import { appendFile, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { AgentProcesses } from './processes.ts'
import { type AgentRuntime, runtimeLaunch } from './runtimes.ts'

/** Cumulative authority tiers whose footers ship with the ki-delegation skill. */
export const authorityTiers = ['none', 'push', 'prune', 'release'] as const
export type AuthorityTier = (typeof authorityTiers)[number]

export interface AgentContext {
  /** The KI state root; runs live under its `agents/` directory. */
  readonly stateDirectory: string
  /** The pinned canonical harness that ships the ki-delegation run assets. */
  readonly harnessDirectory: string
  readonly workingDirectory: string
  readonly environment: Environment
  readonly executable: string
  readonly processes: AgentProcesses
  readonly now: () => number
}

export interface LaunchRequest {
  readonly run: string
  readonly name: string
  readonly workdir: string
  readonly prompt: string
  readonly runtime: AgentRuntime
  readonly addDirs: readonly string[]
  readonly rules: AuthorityTier
  readonly waitFor: readonly string[]
}

type AgentState =
  | { readonly kind: 'finished'; readonly last: string }
  | { readonly kind: 'running' | 'exited'; readonly last: string | undefined }

const checkName = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new KiError(`invalid ${label}: '${value}'`, 2)
  return value
}

const runDirectory = (context: AgentContext, run: string): string =>
  join(context.stateDirectory, 'agents', checkName(run, 'run'))

const existingRun = async (context: AgentContext, run: string): Promise<string> => {
  const directory = runDirectory(context, run)
  if (!(await stat(directory).catch(() => undefined))?.isDirectory()) throw new KiError(`no such run: ${run}`, 1)
  return directory
}

const read = (path: string): Promise<string | undefined> => readFile(path, 'utf8').catch(() => undefined)

const lines = (text: string | undefined): string[] => (text ?? '').split('\n').filter((line) => line.trim())

const clock = (context: AgentContext, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      ...options,
      timeZone: context.environment.TZ || undefined
    }).formatToParts(context.now())
  } catch {
    throw new KiError(`invalid TZ: '${context.environment.TZ}'`, 2)
  }
}

const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((candidate) => candidate.type === type)?.value as string

/** `HH:MM <zone>` in the owner's time zone, taken from `TZ` when set. */
const stamp = (context: AgentContext): string => {
  const parts = clock(context, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
  return `${part(parts, 'hour')}:${part(parts, 'minute')} ${part(parts, 'timeZoneName')}`
}

const today = (context: AgentContext): string => {
  const parts = clock(context, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`
}

const delegationAssets = async (context: AgentContext): Promise<string> => {
  const skills = join(context.harnessDirectory, 'skills')
  const groups = await readdir(skills).catch(() => [] as string[])
  for (const group of groups.sort()) {
    const assets = join(skills, group, 'ki-delegation', 'assets')
    if ((await stat(join(assets, 'run-prompt.md')).catch(() => undefined))?.isFile()) return assets
  }
  throw new KiError(
    'the pinned harness does not ship the ki-delegation run assets; update it with `ki harness update`',
    1
  )
}

const footer = async (context: AgentContext, tier: AuthorityTier): Promise<string> => {
  const text = (await read(join(await delegationAssets(context), `rules-${tier}.md`))) ?? ''
  const start = text.indexOf('## Rules')
  if (start < 0) throw new KiError(`the ki-delegation footer for '${tier}' has no '## Rules' section`, 1)
  return text.slice(start).trimEnd()
}

const pidOf = async (path: string): Promise<number | undefined> => {
  const pid = Number.parseInt((await read(path)) ?? '', 10)
  return Number.isInteger(pid) && pid > 0 ? pid : undefined
}

const running = async (context: AgentContext, pidFile: string): Promise<number | undefined> => {
  const pid = await pidOf(pidFile)
  return pid !== undefined && context.processes.alive(pid) ? pid : undefined
}

const agentState = async (context: AgentContext, directory: string, name: string): Promise<AgentState> => {
  const status = lines(await read(join(directory, `${name}.status`)))
  if (status.at(-1)?.trim() === 'DONE') return { kind: 'finished', last: status.at(-2) ?? 'DONE' }
  const kind = (await running(context, join(directory, `${name}.pid`))) ? 'running' : 'exited'
  return { kind, last: status.at(-1) }
}

const describe = (state: AgentState): string =>
  state.kind === 'finished'
    ? 'finished'
    : state.kind === 'running'
      ? (state.last ?? 'no status yet')
      : `EXITED WITHOUT DONE (${state.last ?? 'no status'})`

const agents = async (directory: string): Promise<string[]> =>
  (await readdir(directory))
    .filter((file) => file.endsWith('.pid') && file !== 'dispatch.pid')
    .map((file) => file.slice(0, -'.pid'.length))
    .sort()

const resolveDirectory = async (context: AgentContext, path: string, label: string): Promise<string> => {
  const directory = resolve(context.workingDirectory, path)
  if (!(await stat(directory).catch(() => undefined))?.isDirectory()) throw new KiError(`no such ${label}: ${path}`, 2)
  return directory
}

const promptText = async (context: AgentContext, path: string): Promise<string> => {
  const text = await read(resolve(context.workingDirectory, path))
  if (text === undefined) throw new KiError(`no such prompt file: ${path}`, 2)
  return text
}

const validated = async (context: AgentContext, request: LaunchRequest): Promise<LaunchRequest> => {
  runDirectory(context, request.run)
  checkName(request.name, 'name')
  for (const name of request.waitFor) checkName(name, 'wait-for name')
  return {
    ...request,
    workdir: await resolveDirectory(context, request.workdir, 'workdir'),
    addDirs: await Promise.all(request.addDirs.map((path) => resolveDirectory(context, path, 'directory')))
  }
}

const composePrompt = async (
  context: AgentContext,
  directory: string,
  request: LaunchRequest,
  body: string
): Promise<string> => {
  const base = join(directory, request.name)
  const zone = context.environment.TZ ? `TZ=${context.environment.TZ} ` : ''
  const sections = [body.trimEnd()]
  if (request.waitFor.length)
    sections.push(
      `Wait gate. Before starting, wait until the last line of each of these status files is DONE, checking every two minutes and keeping your own status current meanwhile: ${request.waitFor.map((name) => `${join(directory, name)}.status`).join(', ')}.`
    )
  sections.push(
    await footer(context, request.rules),
    [
      '---',
      '',
      `Progress protocol. Overwrite ${base}.status with one plain-language line 'HH:MM <zone> - what you are doing' (time from: ${zone}date '+%H:%M %Z') at each change of activity and at least every two minutes. When finished, write your report to ${base}.report.md in the Done / Failed / Needs the owner format, then write DONE as the last line of ${base}.status. Do not use background subagents. Never end your session while waiting.`
    ].join('\n')
  )
  return `${sections.join('\n\n')}\n`
}

/** Launches one detached agent and writes its run packet. */
export const launchAgent = async (
  context: AgentContext,
  candidate: LaunchRequest
): Promise<{ readonly pid: number; readonly directory: string }> => {
  const request = await validated(context, candidate)
  const body = await promptText(context, request.prompt)
  const directory = runDirectory(context, request.run)
  await mkdir(directory, { recursive: true })
  const base = join(directory, request.name)
  const live = await running(context, `${base}.pid`)
  if (live) throw new KiError(`${request.run}/${request.name} is already running (pid ${live})`, 1)

  const prompt = await composePrompt(context, directory, request, body)
  await writeFile(`${base}.prompt.md`, prompt)
  await writeFile(`${base}.status`, `${stamp(context)} - launched\n`)
  await rm(`${base}.report.md`, { force: true })
  const pid = await context.processes.launch(
    runtimeLaunch(request.runtime, {
      prompt,
      workingDirectory: request.workdir,
      directories: [directory, ...request.addDirs],
      environment: context.environment,
      log: `${base}.log`
    })
  )
  await writeFile(`${base}.pid`, `${pid}\n`)
  return { pid, directory }
}

const queueFile = (directory: string): string => join(directory, 'queue.jsonl')

const readQueue = async (directory: string): Promise<LaunchRequest[]> =>
  lines(await read(queueFile(directory))).map((line) => JSON.parse(line) as LaunchRequest)

const writeQueue = (directory: string, queue: readonly LaunchRequest[]): Promise<void> =>
  writeFile(queueFile(directory), queue.map((request) => `${JSON.stringify(request)}\n`).join(''))

/** Appends a ready-made agent to the run queue; returns its position. */
export const queueAgent = async (context: AgentContext, candidate: LaunchRequest): Promise<number> => {
  const request = await validated(context, candidate)
  await promptText(context, request.prompt)
  await delegationAssets(context)
  const directory = runDirectory(context, request.run)
  await mkdir(directory, { recursive: true })
  const queue = await readQueue(directory)
  if (queue.some((queued) => queued.name === request.name) || (await pidOf(join(directory, `${request.name}.pid`))))
    throw new KiError(`${request.run}/${request.name} is already queued or launched`, 1)
  const prompt = join(directory, `${request.name}.queued.md`)
  await copyFile(resolve(context.workingDirectory, request.prompt), prompt)
  await writeQueue(directory, [...queue, { ...request, prompt }])
  return queue.length + 1
}

export interface AgentSummary {
  readonly lines: readonly string[]
  readonly live: boolean
}

const summary = async (context: AgentContext, directory: string): Promise<AgentSummary> => {
  const result: string[] = []
  let live = false
  for (const name of await agents(directory)) {
    const state = await agentState(context, directory, name)
    live ||= state.kind === 'running'
    result.push(`${name}: ${describe(state)}`)
  }
  const queue = await readQueue(directory)
  if (queue.length) {
    const dispatcher = await running(context, join(directory, 'dispatch.pid'))
    live ||= dispatcher !== undefined
    result.push(
      `queued: ${queue.map((request) => request.name).join(', ')} (${dispatcher ? 'dispatcher running' : 'no dispatcher'})`
    )
  }
  return { lines: result, live }
}

export const runStatus = async (context: AgentContext, run: string): Promise<AgentSummary> =>
  summary(context, await existingRun(context, run))

/** Emits one line per interval until no agent is running, ending with ALL FINISHED. */
export const watchRun = async (
  context: AgentContext,
  run: string,
  seconds: number,
  emit: (line: string) => void
): Promise<void> => {
  const directory = await existingRun(context, run)
  for (;;) {
    const current = await summary(context, directory)
    const line = [stamp(context), ...current.lines].join(' | ')
    if (!current.live) return emit(`${line} | ALL FINISHED`)
    emit(line)
    await context.processes.sleep(seconds * 1000)
  }
}

/** Writes a prompt skeleton from the ki-delegation contract for the owner to complete. */
export const newPrompt = async (context: AgentContext, run: string, name: string): Promise<string> => {
  const directory = runDirectory(context, run)
  const path = join(directory, `${checkName(name, 'name')}.draft.md`)
  const skeleton = (await read(join(await delegationAssets(context), 'run-prompt.md'))) as string
  if (await read(path)) throw new KiError(`prompt draft already exists: ${path}`, 1)
  await mkdir(directory, { recursive: true })
  await writeFile(path, skeleton.replaceAll('<decisions log path>', join(directory, 'decisions.md')))
  return path
}

/** Appends a numbered, dated owner decision; returns its number. */
export const recordDecision = async (
  context: AgentContext,
  run: string,
  text: string,
  log?: string
): Promise<{ readonly number: number; readonly path: string }> => {
  const directory = runDirectory(context, run)
  const path = log ? resolve(context.workingDirectory, log) : join(directory, 'decisions.md')
  if (!text.trim()) throw new KiError('a decision needs text', 2)
  const existing = await read(path)
  const numbers = [...(existing ?? '').matchAll(/^## Decision (\d+)\b/gm)].map((match) => Number(match[1]))
  const number = Math.max(0, ...numbers) + 1
  if (existing === undefined) {
    await mkdir(directory, { recursive: true })
    await writeFile(path, '# Decisions\n')
  }
  await appendFile(path, `\n## Decision ${number} (${today(context)})\n\n- ${text.trim()}\n`)
  return { number, path }
}

export interface DispatchRequest {
  readonly run: string
  readonly max: number
  readonly seconds: number
}

/** Starts the run's dispatcher as a detached `ki agent dispatch --foreground` process. */
export const startDispatcher = async (context: AgentContext, request: DispatchRequest): Promise<number> => {
  const directory = await existingRun(context, request.run)
  const live = await running(context, join(directory, 'dispatch.pid'))
  if (live) throw new KiError(`the ${request.run} dispatcher is already running (pid ${live})`, 1)
  const pid = await context.processes.launch({
    command: context.executable,
    arguments: [
      'agent',
      'dispatch',
      request.run,
      '--max',
      String(request.max),
      '--interval',
      String(request.seconds),
      '--foreground'
    ],
    workingDirectory: directory,
    environment: context.environment,
    log: join(directory, 'dispatch.log')
  })
  await writeFile(join(directory, 'dispatch.pid'), `${pid}\n`)
  return pid
}

/** Keeps up to `max` agents running from the queue until it is empty and nothing runs. */
export const dispatchRun = async (
  context: AgentContext,
  request: DispatchRequest,
  emit: (line: string) => void
): Promise<void> => {
  const directory = await existingRun(context, request.run)
  for (;;) {
    let alive = 0
    for (const name of await agents(directory)) if (await running(context, join(directory, `${name}.pid`))) alive += 1
    const [next, ...rest] = await readQueue(directory)
    if (next && alive < request.max) {
      await writeQueue(directory, rest)
      try {
        await launchAgent(context, next)
        emit(`${stamp(context)} launched ${next.name}`)
      } catch (error) {
        if (!(error instanceof KiError)) throw error
        emit(`${stamp(context)} could not launch ${next.name}: ${error.message}`)
      }
      continue
    }
    if (!next && alive === 0) return emit(`${stamp(context)} queue empty, all finished`)
    await context.processes.sleep(request.seconds * 1000)
  }
}

/**
 * Blocks until an agent the coordinator has not yet seen finishes and returns its
 * line, marking it seen; with `next` false, waits for the whole run instead.
 */
export const waitForRun = async (
  context: AgentContext,
  run: string,
  options: { readonly next: boolean; readonly seconds: number }
): Promise<string> => {
  const directory = await existingRun(context, run)
  const seenFile = join(directory, 'seen')
  for (;;) {
    const seen = new Set(lines(await read(seenFile)))
    for (const name of await agents(directory)) {
      if (!options.next || seen.has(name)) continue
      const state = await agentState(context, directory, name)
      if (state.kind === 'running') continue
      await appendFile(seenFile, `${name}\n`)
      return state.kind === 'finished'
        ? `${name} finished: ${state.last}`
        : `${name} exited without DONE: ${state.last ?? 'no status'}`
    }
    if (!(await summary(context, directory)).live) return 'ALL FINISHED'
    await context.processes.sleep(options.seconds * 1000)
  }
}
