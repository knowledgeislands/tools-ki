import { randomUUID } from 'node:crypto'
import { appendFile, copyFile, mkdir, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { gitWorkingTreeRoot } from '../runtime/git.ts'
import { statusSince, WORK_DIRECTORY, type WorkRun } from '../work/status.ts'
import {
  type AgentContext,
  type AuthorityTier,
  agentsDirectory,
  checkName,
  type GrantName,
  git,
  instant,
  read,
  runDirectory,
  localTime as stamp,
  temporaryDirectory
} from './context.ts'
import {
  type AttemptIdentity,
  beginOperation,
  type ControlOperation,
  type ControlStore,
  canonical,
  dependencyTargets,
  effectIdentity,
  finishOperation,
  identity,
  loadControl,
  lostControlOperations,
  newStore,
  nextIdentity,
  pendingControl,
  type QueueIdentity,
  saveControl,
  verifyStore,
  verifyWorkHome
} from './control-store.ts'
import {
  deriveEvents,
  flushPendingEvents,
  initializeEvents,
  type Observed,
  type RunEvent,
  readEvents,
  recordEvent
} from './events.ts'
import type { DependencyIdentity } from './identities.ts'
import { type AgentEffort, type AgentRuntime, runtimeLaunch } from './runtimes.ts'
import { ownershipLoss, ownsScope } from './scope.ts'
import { requireSelection, resolveSelection, type SelectionRequest, sha256 } from './selection.ts'
import { readThread, reportPath, type ThreadHome, threadHome, threadPath } from './thread.ts'

import { agentWorktree, agentWorktreeLines, prepareAgentWorktree, worktreeRepository } from './worktrees.ts'

export type { AgentContext, AuthorityTier, GrantName } from './context.ts'
export { authorityTiers, grantNames } from './context.ts'

export interface LaunchRequest extends SelectionRequest {
  readonly entry?: string | undefined
  readonly launchToken?: string | undefined
  /** Binds a legacy queue projection to its durable spawn intent before any effect. */
  readonly queueSource?: string | undefined
  readonly run: string
  readonly name: string
  readonly workdir: string
  readonly prompt: string
  readonly runtime: AgentRuntime
  readonly addDirs: readonly string[]
  readonly rules: AuthorityTier
  /** Grant sections appended after the tier footer, in order; omitted, none. */
  readonly allow?: readonly GrantName[] | undefined
  readonly waitFor: readonly string[]
  /** Omitted, the runtime uses its own default model or effort. */
  readonly model?: string | undefined
  readonly effort?: AgentEffort | undefined
  /** The repository owning the run's thread; omitted, the Git repository of the working directory. */
  readonly repo?: string | undefined
  readonly worktree?: string | undefined
  /** Start a name that has already run, setting its earlier packet aside in `<name>.prev-<n>/`. */
  readonly relaunch?: boolean | undefined
}

export type AgentState =
  | { readonly kind: 'finished'; readonly last: string }
  | {
      readonly kind: 'running' | 'exited' | 'stopped' | 'dequeued' | 'failed' | 'queued' | 'blocked'
      readonly last: string | undefined
    }

export const existingRun = async (context: AgentContext, run: string): Promise<string> => {
  const directory = runDirectory(context, run)
  if (!(await stat(directory).catch(() => undefined))?.isDirectory()) throw new KiError(`no such run: ${run}`, 1)
  return directory
}

const lines = (text: string | undefined): string[] => (text ?? '').split('\n').filter((line) => line.trim())

/** Legacy packet history consumes attempt numbers without conferring process ownership. */
const minimumAttempt = async (context: AgentContext, directory: string, name: string): Promise<number> => {
  const files = await readdir(directory)
  const archives = files.filter(
    (file) => file.startsWith(`${name}.prev-`) && /^\d+$/.test(file.slice(`${name}.prev-`.length))
  )
  const current = await read(join(directory, `${name}.pid`))
  const metadata = await read(join(directory, `${name}.launch.json`))
  let minimum = archives.length + (current !== undefined || metadata !== undefined ? 1 : 0) + 1
  for (const folder of [directory, ...archives.map((folder) => join(directory, folder))]) {
    const text = await read(join(folder, `${name}.launch.json`))
    if (text === undefined) continue
    const packet = JSON.parse(text) as { identity?: { attempt?: number } }
    const attempt = packet.identity?.attempt
    if (Number.isSafeInteger(attempt) && (attempt as number) > 0) minimum = Math.max(minimum, (attempt as number) + 1)
  }
  for (const event of await readEvents(context, directory))
    if (event.agent === name) minimum = Math.max(minimum, event.attempt + 1)
  return minimum
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

/** Relative Markdown link targets made absolute from the asset's folder, so they open from a prompt. */
const absoluteLinks = (text: string, folder: string): string =>
  text.replace(/\]\(([^)\s]+)\)/g, (link, target: string) =>
    /^(?:[a-z][a-z0-9+.-]*:|[#/])/i.test(target) ? link : `](${resolve(folder, target)})`
  )

/** The tier's footer from its `## Rules` heading line, not from an earlier mention of it. */
const footer = async (context: AgentContext, tier: AuthorityTier): Promise<string> => {
  const assets = await delegationAssets(context)
  const text = (await read(join(assets, `rules-${tier}.md`))) ?? ''
  const heading = /^## Rules$/m.exec(text)
  if (!heading) throw new KiError(`the ki-delegation footer for '${tier}' has no '## Rules' section`, 1)
  return absoluteLinks(text.slice(heading.index).trimEnd(), assets)
}

/** The grant's section from its `## Grant: <name>` heading line. */
const grant = async (context: AgentContext, name: GrantName): Promise<string> => {
  const assets = await delegationAssets(context)
  const text = (await read(join(assets, `grant-${name}.md`))) ?? ''
  const heading = new RegExp(`^## Grant: ${name}$`, 'm').exec(text)
  if (!heading) throw new KiError(`the ki-delegation grant '${name}' has no '## Grant: ${name}' section`, 1)
  return absoluteLinks(text.slice(heading.index).trimEnd(), assets)
}

/**
 * Where the agent writes its report: the run's state folder. The launcher copies it into the
 * thread folder once it sees the agent's `DONE`.
 */
const stateReport = (directory: string, name: string): string => join(directory, `${name}.report.md`)

/** Each distinct path in the brief to this agent's `<name>.report.md`, in order of first mention. */
const reportPaths = (body: string, name: string): readonly string[] => {
  const pattern = new RegExp(`(?<![^\\s(\`'"<\\[])([^\\s()\`'"<>\\[\\]]*/${name}\\.report\\.md)`, 'g')
  return [...new Set([...body.matchAll(pattern)].map((match) => match[1] as string))]
}

/** Whether a report path's folder is the run's work folder, absolute or as written, or any `+/_WORK/<id>/`. */
const inWorkFolder = (path: string, thread: ThreadHome): boolean => {
  const folder = path.slice(0, path.lastIndexOf('/'))
  return folder === thread.folder || folder === threadPath(thread) || /(?:^|\/)\+\/_WORK\/[^/]+$/.test(folder)
}

/**
 * Refuses a brief that sends this agent's report into a work folder: an agent reports only to
 * its state folder, and the launcher alone homes the report in the work folder.
 */
const refuseWorkReport = (body: string, directory: string, thread: ThreadHome, name: string): void => {
  const path = reportPaths(body, name).find((candidate) => inWorkFolder(candidate, thread))
  if (path)
    throw new KiError(
      `the brief sends the report to ${path}; an agent reports only to ${stateReport(directory, name)}, and the launcher homes it in ${threadPath(thread)}`,
      1
    )
}

/**
 * Each path in the brief to this agent's `<name>.report.md` other than the state-folder report,
 * as a warning naming the report path the progress protocol uses.
 */
const reportConflicts = (body: string, directory: string, name: string): readonly string[] => {
  const report = stateReport(directory, name)
  return reportPaths(body, name)
    .filter((path) => path !== report)
    .map((path) => `the brief names ${path}; the report goes to ${report}, which governs`)
}

export const pidOf = async (path: string): Promise<number | undefined> => {
  const pid = Number.parseInt((await read(path)) ?? '', 10)
  return Number.isInteger(pid) && pid > 0 ? pid : undefined
}

export const running = async (context: AgentContext, pidFile: string): Promise<number | undefined> => {
  const pid = await pidOf(pidFile)
  return pid !== undefined && context.processes.alive(pid) ? pid : undefined
}

export const agentState = async (context: AgentContext, directory: string, name: string): Promise<AgentState> => {
  const store = await loadControl(directory)
  const attempt = store?.attempts[name]
  const pid = await pidOf(join(directory, `${name}.pid`))
  if (attempt?.state === 'stopped') return { kind: 'stopped', last: 'stopped' }
  if (attempt?.entry && store?.entries[attempt.entry]?.state === 'queued')
    return { kind: 'queued', last: 'queued after verified absence' }
  if (attempt?.state === 'failed' && attempt.entry && store?.entries[attempt.entry]?.disposition === 'dequeued')
    return { kind: 'dequeued', last: 'dequeued' }
  if (attempt?.state === 'failed') return { kind: 'failed', last: 'failed' }
  if (attempt?.state === 'done') return { kind: 'finished', last: 'done' }
  const ownerPid = pid ?? attempt?.owner?.pid
  if (store && attempt) {
    const loss = await ownershipLoss(
      context,
      store,
      attempt,
      ownerPid !== undefined && context.processes.alive(ownerPid)
    )
    if (loss) return { kind: 'blocked', last: `${attempt.state === 'held' ? 'held; ' : ''}${loss.text}` }
  }
  if (attempt?.state === 'held' && pid === undefined && attempt.owner && context.processes.alive(attempt.owner.pid))
    return { kind: 'running', last: 'held; launch acknowledgement unavailable' }
  const status = lines(await read(join(directory, `${name}.status`)))
  if (attempt?.state === 'held')
    return {
      kind: 'running',
      last: status.at(-1)?.trim() === 'DONE' ? 'held; worker launch not authorised' : status.at(-1)
    }
  if (attempt?.state === 'unconfirmed' && !context.processes.control)
    return { kind: 'running', last: 'claim-unconfirmed' }
  if (status.at(-1)?.trim() === 'DONE') {
    if (attempt && context.processes.control) {
      try {
        const scope = await context.processes.control.inspect(attempt)
        if (!ownsScope(attempt, scope) || !scope.containment || !scope.empty || !scope.fenced)
          return { kind: 'running', last: 'completion-unconfirmed' }
      } catch {
        return { kind: 'running', last: 'completion-unconfirmed' }
      }
    }
    return { kind: 'finished', last: status.at(-2) ?? 'DONE' }
  }
  if (attempt && ['unconfirmed', 'stop-requested', 'stop-timeout'].includes(attempt.state))
    return { kind: 'running', last: attempt.state }
  const kind = pid !== undefined && context.processes.alive(pid) ? 'running' : 'exited'
  return { kind, last: status.at(-1) }
}

/** A wait gate: open, still waiting on some names, or closed for good. */
type Gate =
  | { readonly kind: 'open' }
  | { readonly kind: 'waiting'; readonly names: readonly string[] }
  | { readonly kind: 'closed'; readonly reason: string }

/** Seconds a held agent waits between gate checks. */
const holdSeconds = 30

/**
 * A gate opens when every named agent has written `DONE` and closes for good when one
 * has a pid but has ended without it; a name not yet launched keeps it waiting.
 */
const gate = async (
  context: AgentContext,
  directory: string,
  names: readonly string[],
  bindings?: Readonly<Record<string, DependencyIdentity | null>>
): Promise<Gate> => {
  const waiting: string[] = []
  const store = await loadControl(directory)
  const targets = bindings ?? (store ? dependencyTargets(store, names) : undefined)
  if (targets && JSON.stringify(Object.keys(targets).sort()) !== JSON.stringify([...new Set(names)].sort()))
    return { kind: 'closed', reason: 'dependency bindings differ from the frozen gate' }
  for (const name of names) {
    const target = targets?.[name]
    if (target) {
      if (target.agent !== name || !store)
        return { kind: 'closed', reason: `${name} dependency identity is unverified` }
      if (target.entry) {
        const entry = store.entries[target.entry]
        if (!entry || entry.token !== target.token || entry.attempt !== target.attempt)
          return { kind: 'closed', reason: `${name} queue identity is unverified` }
        if (entry.state === 'cancelled') return { kind: 'closed', reason: `${name} was ${entry.disposition}` }
        if (entry.state !== 'started') {
          waiting.push(name)
          continue
        }
      }
      const current = store.attempts[name]
      const attempt = current?.token === target.token ? current : store.history[target.token]
      if (!attempt || attempt.attempt !== target.attempt || attempt.agent !== name)
        return { kind: 'closed', reason: `${name} attempt identity is unverified` }
      if (attempt.state === 'stopped' || attempt.state === 'failed')
        return { kind: 'closed', reason: `${name} was ${attempt.state}` }
      if (attempt.state === 'done') continue
      if (current?.token !== target.token)
        return { kind: 'closed', reason: `${name} attempt was superseded without verified completion` }
    } else if (bindings && store && dependencyTargets(store, [name])[name])
      return { kind: 'closed', reason: `${name} has an unbound predecessor identity` }
    const state = await agentState(context, directory, name)
    if (state.kind === 'finished') continue
    if (state.kind === 'blocked') return { kind: 'closed', reason: `${name}: ${state.last}` }
    if (state.kind === 'exited' && (await pidOf(join(directory, `${name}.pid`))) !== undefined)
      return { kind: 'closed', reason: `${name} exited without DONE` }
    waiting.push(name)
  }
  return waiting.length ? { kind: 'waiting', names: waiting } : { kind: 'open' }
}

const describe = (state: AgentState): string =>
  state.kind === 'blocked'
    ? (state.last as string)
    : state.kind === 'stopped' || state.kind === 'dequeued' || state.kind === 'failed' || state.kind === 'queued'
      ? state.kind
      : state.kind === 'finished'
        ? 'finished'
        : state.kind === 'running'
          ? (state.last ?? 'no status yet')
          : `EXITED WITHOUT DONE (${state.last ?? 'no status'})`

export const agents = async (directory: string): Promise<string[]> => {
  const packet = (await readdir(directory))
    .filter((file) => file.endsWith('.pid') && file !== 'dispatch.pid')
    .map((file) => file.slice(0, -'.pid'.length))
  return [...new Set([...packet, ...Object.keys((await loadControl(directory))?.attempts ?? {})])].sort()
}

/** The run's agents and their liveness, which event derivation and recording read. */
const observed = async (context: AgentContext, directory: string): Promise<Observed> => ({
  agents: await agents(directory),
  alive: async (name) => (await agentState(context, directory, name)).kind === 'running'
})

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
  if (request.waitFor.includes(request.name)) throw new KiError(`${request.name} cannot wait for itself`, 2)
  if (request.model !== undefined && !request.model.trim()) throw new KiError('a model needs a name', 2)
  const selection = await resolveSelection(context, request)
  requireSelection(selection)
  return {
    ...request,
    selection,
    runtime: selection.runtime,
    model: selection.model,
    effort: selection.effort,
    rules: selection.rules,
    workdir: await resolveDirectory(context, request.workdir, 'workdir'),
    worktree:
      request.worktree === undefined
        ? undefined
        : await worktreeRepository(context, await resolveDirectory(context, request.worktree, 'worktree repository')),
    addDirs: await Promise.all(request.addDirs.map((path) => resolveDirectory(context, path, 'directory'))),
    repo: request.repo === undefined ? undefined : await resolveDirectory(context, request.repo, 'repository')
  }
}
const preflight = async (context: AgentContext, candidate: LaunchRequest): Promise<LaunchRequest> => {
  const request = await validated(context, candidate)
  const body = await promptText(context, request.prompt)
  await delegationAssets(context)
  await footer(context, request.rules)
  await Promise.all((request.allow ?? []).map((name) => grant(context, name)))
  const thread = await threadHome(context, request.run, request.repo, false, request.workdir, true)
  await verifyWorkHome(thread)
  refuseWorkReport(body, runDirectory(context, request.run), thread, request.name)
  return request
}

/** The request with a directory, such as the thread's repository, among those the agent may write. */
const withDirectory = (request: LaunchRequest, directory: string): LaunchRequest =>
  request.workdir === directory || request.addDirs.includes(directory)
    ? request
    : { ...request, addDirs: [...request.addDirs, directory] }

const physicalWorkdir = async (context: AgentContext, directory: string, request: LaunchRequest): Promise<string> => {
  const tree = agentWorktree(context, request)
  return tree ? resolve(await realpath(directory), relative(directory, tree.path)) : realpath(request.workdir)
}

const composePrompt = async (
  context: AgentContext,
  directory: string,
  request: LaunchRequest,
  report: string,
  temporary: string,
  body: string
): Promise<string> => {
  const base = join(directory, request.name)
  const zone = context.environment.TZ ? `TZ=${context.environment.TZ} ` : ''
  const sections = [body.trimEnd()]
  sections.push(
    await footer(context, request.rules),
    ...(request.selection?.acceptanceSupplement ? [request.selection.acceptanceSupplement] : []),
    ...(await Promise.all((request.allow ?? []).map((name) => grant(context, name)))),
    [
      '---',
      '',
      `Progress protocol. Overwrite ${base}.status with one plain-language line 'HH:MM <zone> - what you are doing' (time from: ${zone}date '+%H:%M %Z') at each change of activity and at least every two minutes. When finished, write your report to ${report} as the owner report the ki-delegation background-run standard sets (what has been done, what is in progress, outstanding queries), then write DONE as the last line of ${base}.status. This is the only report path; it governs any other the brief names. Temporary output goes in ${temporary}/, outside every repository; ki agent close refuses while it holds anything and then removes it, so home what must survive first. For a milestone the coordinator should hear about, write the line as 'HH:MM <zone> - milestone: <text>'; when you are blocked or the work has failed, as 'HH:MM <zone> - blocked: <text>' or 'HH:MM <zone> - failed: <text>'. Do not use background subagents. Never end your session while waiting.`
    ].join('\n')
  )
  return `${sections.join('\n\n')}\n`
}

const heldLine = (context: AgentContext, names: readonly string[]): string =>
  `${stamp(context)} - held until ${names.join(', ')} finish\n`

/** Starts the runtime on a composed prompt and records its pid. */
const startRuntime = async (
  context: AgentContext,
  directory: string,
  request: LaunchRequest,
  prompt: string,
  store: ControlStore,
  attempt: AttemptIdentity,
  confirmed: (pid: number) => void
): Promise<number> => {
  const base = join(directory, request.name)
  // Both callers validate the reservation and cancellation fence inside this transaction.
  const entry = request.entry === undefined ? undefined : (store.entries[request.entry] as QueueIdentity)
  await validated(context, request)
  const tree = await prepareAgentWorktree(context, request)
  await validated(context, request)
  if ((await realpath(tree?.path ?? request.workdir)) !== attempt.workdir)
    throw new KiError('workdir-identity-changed: physical working directory differs from the reserved attempt', 1)
  await writeFile(`${base}.status`, `${stamp(context)} - launched\n`)
  attempt.state = 'unconfirmed'
  const operation = await beginOperation(
    context,
    directory,
    store,
    'spawn',
    { token: attempt.token, scope: attempt.scope, selection: request.selection, queueSource: request.queueSource },
    { ...attempt },
    'held',
    entry?.operation
  )
  if (entry) {
    entry.state = 'unconfirmed'
    entry.operation = operation.id
  }
  await saveControl(directory, store)
  const launch = runtimeLaunch(request.runtime, {
    run: request.run,
    prompt,
    workingDirectory: tree?.path ?? request.workdir,
    directories: [directory, ...request.addDirs],
    environment: context.environment,
    log: `${base}.log`,
    model: request.model,
    effort: request.effort
  })
  let pid: number
  try {
    if (context.processes.control) {
      attempt.owner = await context.processes.control.launch(attempt, launch, 'worker', effectIdentity(operation))
      if (
        attempt.owner.token !== attempt.token ||
        attempt.owner.scope !== attempt.scope ||
        attempt.owner.launcher !== attempt.launcher
      )
        throw new KiError('ownership-unverified: adapter returned a foreign launch identity', 1)
      pid = attempt.owner.pid
    } else pid = await context.processes.launch(launch)
  } catch {
    await recordEvent(
      context,
      directory,
      await observed(context, directory),
      request.name,
      'blocked',
      `claim-unconfirmed: ${operation.id}`,
      operation.id
    )
    throw new KiError(
      `claim-unconfirmed: inspect with ki agent recover inspect ${request.run} --operation ${operation.id}`,
      1
    )
  }
  attempt.state = 'running'
  if (entry) entry.state = 'started'
  confirmed(pid)
  await writeFile(`${base}.pid`, `${pid}\n`)
  await finishOperation(context, directory, store, operation, {
    resultingState: 'running',
    outcome: 'started',
    reason: context.processes.control
      ? 'managed worker-start acknowledgement'
      : 'legacy launch; native control ownership unavailable',
    exitCode: 0
  })
  await writeFile(`${base}.launch.json`, await launchDetails(context, request))
  return pid
}

/** Detaches the hold process: `ki agent launch --foreground` on the composed prompt. */
const startHold = async (
  context: AgentContext,
  directory: string,
  request: LaunchRequest,
  store: ControlStore,
  attempt: AttemptIdentity,
  confirmed: (pid: number) => void
): Promise<number> => {
  const base = join(directory, request.name)
  const launch = {
    command: context.launcher[0],
    arguments: [
      ...context.launcher.slice(1),
      'agent',
      'launch',
      request.run,
      request.name,
      request.workdir,
      `${base}.prompt.md`,
      '--runtime',
      request.runtime,
      ...request.addDirs.flatMap((path) => ['--add-dir', path]),
      ...request.waitFor.flatMap((name) => ['--wait-for', name]),
      ...(request.model === undefined ? [] : ['--model', request.model]),
      ...(request.effort === undefined ? [] : ['--effort', request.effort]),
      ...(request.worktree === undefined ? [] : ['--worktree', request.worktree]),
      '--launch-token',
      request.launchToken as string,
      '--foreground'
    ],
    workingDirectory: directory,
    environment: context.environment,
    log: `${base}.log`
  }
  const entry = request.entry === undefined ? undefined : store.entries[request.entry]
  if (entry) entry.state = 'claimed'
  const operation = await beginOperation(
    context,
    directory,
    store,
    'spawn-supervisor',
    { token: attempt.token, scope: attempt.scope, selection: request.selection, queueSource: request.queueSource },
    { ...attempt },
    'held'
  )
  let pid: number
  try {
    if (context.processes.control) {
      attempt.owner = await context.processes.control.launch(attempt, launch, 'supervisor', effectIdentity(operation))
      if (
        attempt.owner.token !== attempt.token ||
        attempt.owner.scope !== attempt.scope ||
        attempt.owner.launcher !== attempt.launcher
      )
        throw new Error('foreign supervisor identity')
      pid = attempt.owner.pid
    } else pid = await context.processes.launch(launch)
  } catch {
    attempt.state = 'unconfirmed'
    if (entry) {
      entry.state = 'unconfirmed'
      entry.operation = operation.id
    }
    await saveControl(directory, store)
    await recordEvent(
      context,
      directory,
      await observed(context, directory),
      request.name,
      'blocked',
      `claim-unconfirmed: ${operation.id}`,
      operation.id
    )
    throw new KiError(
      `claim-unconfirmed: inspect with ki agent recover inspect ${request.run} --operation ${operation.id}`,
      1
    )
  }
  confirmed(pid)
  await finishOperation(context, directory, store, operation, {
    resultingState: 'held',
    outcome: 'held',
    reason: context.processes.control
      ? 'managed supervisor acknowledged; worker gate remains closed'
      : 'legacy held process; native control ownership unavailable',
    exitCode: 0
  })
  return pid
}

/**
 * The runtime, model and effort an agent starts with, a default left out, and its working
 * directory, from which a later command may fix the thread home.
 */
const launchDetails = async (context: AgentContext, request: LaunchRequest): Promise<string> => {
  const worktree = agentWorktree(context, request)
  const attempt = (await loadControl(runDirectory(context, request.run)))?.attempts[request.name]
  return `${JSON.stringify({ identity: attempt, request, ...request.selection, runtime: request.runtime, model: request.model, effort: request.effort, workdir: worktree?.path ?? request.workdir, ...(worktree ? { worktree } : {}), token: request.launchToken, entry: request.entry })}\n`
}

/** State-folder files that mark a name as having run; `.queued.md` and `.draft.md` do not. */
const packetFiles = ['pid', 'status', 'prompt.md', 'launch.json', 'report.md'] as const

const exists = async (path: string): Promise<boolean> => (await stat(path).catch(() => undefined)) !== undefined

/** The files that take a name in this run: its state-folder packet and its thread-folder report. */
const takenBy = async (directory: string, thread: ThreadHome, name: string): Promise<readonly string[]> => {
  const files: string[] = []
  for (const suffix of packetFiles)
    if (await exists(join(directory, `${name}.${suffix}`))) files.push(`${name}.${suffix}`)
  if (await exists(reportPath(thread, name))) files.push(`${thread.folder}/${name}.report.md`)
  return files
}

/** Refuses a name that has already run, suggesting the first free `<name>-<n>` from 2. */
const refuseTaken = async (directory: string, thread: ThreadHome, request: LaunchRequest): Promise<void> => {
  const files = await takenBy(directory, thread, request.name)
  if (!files.length) return
  let suffix = 2
  while ((await takenBy(directory, thread, `${request.name}-${suffix}`)).length) suffix += 1
  throw new KiError(
    `${request.run}/${request.name} has already run (${files.join(', ')}); launch it as ${request.name}-${suffix} or pass --relaunch`,
    1
  )
}

/**
 * Sets a relaunched name's earlier packet aside in the first free `<name>.prev-<n>/` of the
 * state folder, deleting nothing. The thread-folder report stays where it is, so a relaunch
 * is refused while that report has changes Git does not hold.
 */
const setAside = async (
  context: AgentContext,
  directory: string,
  thread: ThreadHome,
  request: LaunchRequest
): Promise<void> => {
  const report = reportPath(thread, request.name)
  if (await exists(report)) {
    const status = await git(context, thread.repository, ['status', '--porcelain', '--', report])
    if (status.output.trim())
      throw new KiError(
        `${request.run}/${request.name} cannot relaunch: ${thread.folder}/${request.name}.report.md has uncommitted changes`,
        1
      )
  }
  const files: string[] = []
  for (const suffix of [...packetFiles, 'log'])
    if (await exists(join(directory, `${request.name}.${suffix}`))) files.push(`${request.name}.${suffix}`)
  if (!files.length) return
  let previous = 1
  while (await exists(join(directory, `${request.name}.prev-${previous}`))) previous += 1
  const target = join(directory, `${request.name}.prev-${previous}`)
  await mkdir(target)
  for (const file of files) await rename(join(directory, file), join(target, file))
}

export interface LaunchResult {
  readonly schema: 'ki/agent-launch/v1'
  readonly exitCode: 0
  readonly pid: number
  readonly selection: LaunchRequest['selection']
  readonly identity: unknown
  readonly directory: string
  /** Agents the launch is held for; empty when the runtime started at once. */
  readonly held: readonly string[]
  /** Report paths in the brief that differ from the one the progress protocol names. */
  readonly warnings: readonly string[]
}

/**
 * Launches one detached agent and writes its run packet. With an open gate the runtime
 * starts at once; otherwise a detached hold process starts it once the gate opens.
 */
/** Retire only journal-proven preparations; the control lease excludes a competing spawn. */
const retirePreparation = async (
  context: AgentContext,
  directory: string,
  store: ControlStore,
  earlier: AttemptIdentity | undefined
): Promise<void> => {
  if (
    earlier?.state === 'held' &&
    !earlier.owner &&
    !Object.values(store.operations).some(
      (operation) =>
        ['spawn', 'spawn-supervisor'].includes(operation.operation) &&
        (operation.target as AttemptIdentity).token === earlier.token
    )
  ) {
    await initializeEvents(context, directory)
    const reason = 'preparation interrupted before spawn intent; no process was started'
    const retirement = await beginOperation(
      context,
      directory,
      store,
      'prepare-retire',
      { reason },
      earlier,
      earlier.state,
      `prepare-${earlier.token}`
    )
    earlier.state = 'failed'
    store.history[earlier.token] = structuredClone(earlier)
    const queued = earlier.entry === undefined ? undefined : store.entries[earlier.entry]
    if (queued?.state === 'claimed') queued.state = 'queued'
    await finishOperation(context, directory, store, retirement, {
      outcome: 'preparation-not-started',
      resultingState: 'failed',
      reason,
      exitCode: 0
    })
  }
}

export const launchAgent = async (
  context: AgentContext,
  candidate: LaunchRequest,
  locked = false
): Promise<LaunchResult> => {
  if (!locked) {
    const accepted = await preflight(context, candidate)
    let confirmed: LaunchResult | undefined
    try {
      return await pendingControl(context, candidate.run, async () => {
        confirmed = await launchAgent(context, accepted, true)
        return confirmed
      })
    } catch (error) {
      if (confirmed !== undefined)
        return {
          ...confirmed,
          warnings: [...confirmed.warnings, `confirmed start; follow-up requires inspection: ${String(error)}`]
        }
      throw error
    }
  }
  const accepted = await validated(context, candidate)
  const body = await promptText(context, accepted.prompt)
  // Refused before the first launch records the home, so a refused brief writes nothing.
  refuseWorkReport(
    body,
    runDirectory(context, accepted.run),
    await threadHome(context, accepted.run, accepted.repo, false, accepted.workdir),
    accepted.name
  )
  const thread = await threadHome(context, accepted.run, accepted.repo, true, accepted.workdir)
  const temporary = temporaryDirectory(context, accepted.run, accepted.name)
  let request = withDirectory(withDirectory(accepted, thread.repository), temporary)
  const directory = runDirectory(context, request.run)
  const base = join(directory, request.name)
  const prior = await loadControl(directory)
  const pending =
    request.entry === undefined
      ? Object.values(prior?.entries ?? {}).find(
          (entry) =>
            entry.name === request.name &&
            entry.state === 'queued' &&
            (entry.request as LaunchRequest).prompt === resolve(context.workingDirectory, request.prompt)
        )
      : undefined
  if (prior && pending) {
    request = withDirectory(
      withDirectory(
        await validated(context, { ...(pending.request as LaunchRequest), entry: pending.id }),
        thread.repository
      ),
      temporary
    )
  }
  const old = prior?.attempts[request.name]
  let scopeEmpty = false
  if (old?.owner && !['stopped', 'done', 'failed'].includes(old.state)) {
    const scope = await context.processes.control?.inspect(old)
    if (
      !scope?.ownership ||
      !scope.containment ||
      !scope.empty ||
      !scope.fenced ||
      scope.token !== old.token ||
      scope.scope !== old.scope
    )
      throw new KiError('claim-unconfirmed: prior scope is not verified empty and fenced', 1)
    scopeEmpty = true
  }
  const resuming =
    prior !== undefined &&
    old?.state === 'failed' &&
    ((request.entry !== undefined && old.entry === request.entry) ||
      (request.queueSource !== undefined &&
        Object.values(prior.operations).some(
          (operation) =>
            queueSourceOf(operation) === request.queueSource &&
            queueOutcomeOf(prior, operation) === 'spawn-not-started' &&
            (operation.target as AttemptIdentity).token === old.token
        )))
  const live =
    scopeEmpty || (old && ['stopped', 'done', 'failed'].includes(old.state))
      ? undefined
      : await running(context, `${base}.pid`)
  if (live) throw new KiError(`${request.run}/${request.name} is already running (pid ${live})`, 1)
  if (!request.relaunch && !resuming) await refuseTaken(directory, thread, request)
  const store = (await loadControl(directory)) ?? (await newStore(context, request.run))
  await verifyStore(context, request.run, store)
  const earlier = store.attempts[request.name]
  await retirePreparation(context, directory, store, earlier)
  if (earlier?.state === 'held' && (await pidOf(`${base}.pid`)) === undefined)
    throw new KiError('claim-unconfirmed: held process acknowledgement is unavailable', 1)
  if (earlier && ['unconfirmed', 'stop-requested', 'stop-timeout'].includes(earlier.state))
    throw new KiError('claim-unconfirmed: reconcile the prior attempt before replacement', 1)
  const entry = request.entry === undefined ? undefined : store.entries[request.entry]
  const reserved =
    earlier &&
    ((request.entry !== undefined && earlier.entry === request.entry) ||
      (resuming && request.queueSource !== undefined))
      ? { ...earlier, state: 'held' as const, owner: undefined }
      : identity(
          context,
          store,
          request.run,
          request.name,
          request.runtime,
          await physicalWorkdir(context, directory, request),
          entry,
          request.waitFor,
          await minimumAttempt(context, directory, request.name)
        )
  const state = await gate(context, directory, request.waitFor, reserved.dependencies)
  if (state.kind === 'closed') throw new KiError(`${request.run}/${request.name} gate cannot open: ${state.reason}`, 1)
  if (earlier && earlier.token !== reserved.token) {
    const current = await agentState(context, directory, request.name)
    await deriveEvents(context, directory, { ...(await observed(context, directory)), homeReports: false })
    const previousOutcome: AttemptIdentity = {
      ...earlier,
      state: ['done', 'failed', 'stopped'].includes(earlier.state)
        ? earlier.state
        : current.kind === 'finished'
          ? 'done'
          : current.kind === 'blocked'
            ? earlier.state
            : 'failed'
    }
    // Persist both projections before moving any packet file, and retain the
    // same outcome if later preparation must restore the predecessor.
    earlier.state = previousOutcome.state
    store.history[earlier.token] = previousOutcome
    store.attempts[request.name] = structuredClone(previousOutcome)
    await saveControl(directory, store)
  }
  if (request.relaunch) await setAside(context, directory, thread, request)
  let started: { pid: number; held: readonly string[] } | undefined
  const warnings = reportConflicts(body, directory, request.name)
  try {
    store.attempts[request.name] = reserved
    await saveControl(directory, store)
    await initializeEvents(context, directory)
    request = { ...request, launchToken: reserved.token }

    // The launcher copies the agent's report into the tracked thread folder, so the folder must exist.
    await mkdir(threadPath(thread), { recursive: true })
    await mkdir(temporary, { recursive: true })
    const prompt = await composePrompt(
      context,
      directory,
      request,
      stateReport(directory, request.name),
      temporary,
      body
    )
    await writeFile(`${base}.prompt.md`, prompt)
    await writeFile(`${base}.launch.json`, await launchDetails(context, request))
    // Once started, `<name>.prompt.md` holds the brief, so the run's queued or draft copy goes.
    const spent = [`${base}.queued.md`, `${base}.draft.md`].find(
      (path) => path === resolve(context.workingDirectory, request.prompt)
    )
    if (state.kind === 'open') {
      const pid = await startRuntime(context, directory, request, prompt, store, reserved, (pid) => {
        started = { pid, held: [] }
      })
      if (spent) await rm(spent, { force: true })
      await recordEvent(
        context,
        directory,
        await observed(context, directory),
        request.name,
        'launch',
        `launched (pid ${pid})`
      )
      return {
        schema: 'ki/agent-launch/v1',
        exitCode: 0,
        pid,
        directory,
        held: [],
        warnings,
        selection: request.selection,
        identity: (await loadControl(directory))?.attempts[request.name]
      }
    }
    await writeFile(`${base}.status`, heldLine(context, state.names))
    const pid = await startHold(context, directory, request, store, reserved, (pid) => {
      started = { pid, held: state.names }
    })
    await writeFile(`${base}.pid`, `${pid}\n`)
    await writeFile(`${base}.launch.json`, await launchDetails(context, request))
    if (spent) await rm(spent, { force: true })
    await recordEvent(
      context,
      directory,
      await observed(context, directory),
      request.name,
      'held',
      `held until ${state.names.join(', ')} finish`
    )
    return {
      schema: 'ki/agent-launch/v1',
      exitCode: 0,
      pid,
      directory,
      held: state.names,
      warnings,
      selection: request.selection,
      identity: (await loadControl(directory))?.attempts[request.name]
    }
  } catch (error) {
    if (started !== undefined)
      return {
        schema: 'ki/agent-launch/v1',
        exitCode: 0,
        pid: started.pid,
        directory,
        held: started.held,
        selection: request.selection,
        identity: reserved,
        warnings: [...warnings, `confirmed start; follow-up requires inspection: ${String(error)}`]
      }
    const current = await loadControl(directory)
    if (
      current &&
      !Object.values(current.operations).some(
        (operation) =>
          (operation.operation === 'spawn' || operation.operation === 'spawn-supervisor') &&
          (operation.target as AttemptIdentity).token === reserved.token
      )
    ) {
      reserved.state = 'failed'
      current.history[reserved.token] = structuredClone(reserved)
      current.attempts[request.name] = earlier ?? reserved
      if (entry) current.entries[entry.id] = { ...entry, state: 'queued' }
      await saveControl(directory, current)
    }
    throw error
  }
}

/**
 * The hold process: waits for the gate, then starts the runtime on the composed prompt,
 * or ends with a "gate cannot open" status when a gating agent exits without `DONE`.
 */
export const holdAgent = async (context: AgentContext, candidate: LaunchRequest): Promise<string> => {
  const recorded = await read(join(runDirectory(context, candidate.run), `${candidate.name}.launch.json`))
  if (!recorded) throw new KiError('selection-unverified: held launch has no frozen receipt', 1)
  const metadata = JSON.parse(recorded) as { request: LaunchRequest }
  if (!metadata.request || metadata.request.run !== candidate.run || metadata.request.name !== candidate.name)
    throw new KiError('selection-unverified: held request identity differs', 1)
  const request = await validated(context, {
    ...metadata.request,
    prompt: join(runDirectory(context, candidate.run), `${candidate.name}.prompt.md`),
    launchToken: candidate.launchToken
  })
  const prompt = await promptText(context, request.prompt)
  const directory = runDirectory(context, request.run)
  const base = join(directory, request.name)
  let started: number | undefined
  for (;;) {
    // The launcher has just seen the gate shut, so the first check waits a full interval.
    await context.processes.sleep(holdSeconds * 1000)
    const result = await pendingControl(context, request.run, async () => {
      const store = await loadControl(directory)
      const attempt = store?.attempts[request.name]
      if (
        !store ||
        !request.launchToken ||
        !attempt ||
        attempt.token !== request.launchToken ||
        attempt.state !== 'held'
      )
        return 'launch-fenced: held attempt cannot start'
      if (request.entry !== attempt.entry || (attempt.entry && !store.entries[attempt.entry]))
        return `${stamp(context)} - launch-fenced: queue identity changed`
      if (attempt.entry && store.entries[attempt.entry]?.state === 'cancelled') {
        attempt.state = 'failed'
        await saveControl(directory, store)
        return 'launch-fenced: held queue entry was cancelled'
      }
      const state = await gate(context, directory, request.waitFor, attempt.dependencies)
      if (state.kind === 'waiting') {
        await writeFile(`${base}.status`, heldLine(context, state.names))
        return undefined
      }
      if (state.kind === 'closed') {
        attempt.state = 'failed'
        attempt.gateFailure = `gate cannot open: ${state.reason}`
        if (attempt.entry) {
          const entry = store.entries[attempt.entry] as QueueIdentity
          entry.state = 'cancelled'
          entry.disposition = 'blocked'
          entry.dispositionReason = attempt.gateFailure
        }
        await saveControl(directory, store)
        const line = `${stamp(context)} - gate cannot open: ${state.reason}`
        await writeFile(`${base}.status`, `${line}\n`)
        await recordEvent(
          context,
          directory,
          await observed(context, directory),
          request.name,
          'blocked',
          `gate cannot open: ${state.reason}`
        )
        return line
      }
      const pid = await startRuntime(context, directory, request, prompt, store, attempt, (pid) => {
        started = pid
      })
      await recordEvent(
        context,
        directory,
        await observed(context, directory),
        request.name,
        'launch',
        `launched (pid ${pid})`
      )
      return `${stamp(context)} launched ${request.run}/${request.name} (pid ${pid})`
    }).catch((error: unknown) => {
      if (started !== undefined)
        return `${stamp(context)} launched ${request.run}/${request.name} (pid ${started}); follow-up requires inspection: ${String(error)}`
      throw error
    })
    if (result !== undefined) return result
  }
}

const queueFile = (directory: string): string => join(directory, 'queue.jsonl')

const queueSourceOf = (operation: ControlOperation): string | undefined =>
  ['spawn', 'spawn-supervisor'].includes(operation.operation)
    ? (JSON.parse(operation.payload) as { queueSource?: string }).queueSource
    : undefined

const queueOutcomeOf = (store: ControlStore | undefined, operation: ControlOperation): string | undefined =>
  operation.receipt?.outcome ??
  (operation.resolvedBy === undefined ? undefined : store?.operations[operation.resolvedBy]?.receipt?.outcome)

export const readQueue = async (context: AgentContext, directory: string): Promise<LaunchRequest[]> => {
  const store = await loadControl(directory)
  let projection: LaunchRequest[]
  try {
    projection = lines(await read(queueFile(directory))).map((line) => JSON.parse(line) as LaunchRequest)
  } catch (error) {
    throw new KiError(
      `queue-evidence-unverified: preserve the queue projection and control journal: ${String(error)}`,
      1
    )
  }
  if (projection.some((request) => request.entry !== undefined && !store?.entries[request.entry]))
    throw new KiError('queue-identity-unverified: unknown queue entry; inspect the control journal', 1)
  const refusals = new Set(
    (await readEvents(context, directory))
      .filter((event) => event.queueSource && (event.kind === 'blocked' || event.kind === 'failed'))
      .map((event) => event.queueSource)
  )
  const legacy = projection.filter(
    (request) =>
      request.entry === undefined &&
      !refusals.has(sha256(canonical(request))) &&
      !Object.values(store?.operations ?? {}).some(
        (operation) =>
          queueSourceOf(operation) === sha256(canonical(request)) &&
          ['started', 'held', 'spawn-started'].includes(queueOutcomeOf(store, operation) ?? '')
      )
  )
  const queued = Object.values(store?.entries ?? {}).filter((entry) => entry.state === 'queued')
  return [
    ...legacy,
    ...queued.map(
      (entry) =>
        projection.find((request) => request.entry === entry.id) ?? {
          ...(entry.request as LaunchRequest),
          entry: entry.id
        }
    )
  ]
}

const writeQueue = async (directory: string, queue: readonly LaunchRequest[]): Promise<void> => {
  const temporary = `${queueFile(directory)}.${randomUUID()}.tmp`
  const contents = queue.map((request) => `${JSON.stringify(request)}\n`).join('')
  try {
    await writeFile(temporary, contents)
    await rename(temporary, queueFile(directory))
    if ((await read(queueFile(directory))) !== contents)
      throw new Error('queue publication differs from its intended bytes')
  } catch (error) {
    throw new KiError(
      `queue-evidence-unverified: preserve the control journal and queue projection: ${String(error)}`,
      1
    )
  }
}

/** Appends a ready-made agent to the run queue; returns its position. */
export interface QueueResult {
  readonly schema: 'ki/agent-launch/v1'
  readonly exitCode: 0
  readonly identity: unknown
  readonly position: number
  readonly entry: string
  readonly selection: LaunchRequest['selection']
  /** Report paths in the brief that differ from the one the progress protocol will name. */
  readonly warnings: readonly string[]
}

export const queueAgent = async (
  context: AgentContext,
  candidate: LaunchRequest,
  locked = false
): Promise<QueueResult> => {
  if (!locked) {
    const accepted = await preflight(context, candidate)
    return pendingControl(context, candidate.run, () => queueAgent(context, accepted, true))
  }
  const request = await validated(context, candidate)
  const body = await promptText(context, request.prompt)
  await delegationAssets(context)
  const directory = runDirectory(context, request.run)
  refuseWorkReport(
    body,
    directory,
    await threadHome(context, request.run, request.repo, false, request.workdir),
    request.name
  )
  const thread = await threadHome(context, request.run, request.repo, true, request.workdir)
  const retained = await loadControl(directory)
  if (
    Object.values(retained?.entries ?? {}).some(
      (entry) => entry.name === request.name && (entry.state === 'claimed' || entry.state === 'unconfirmed')
    )
  )
    throw new KiError('claim-unconfirmed: reconcile the prior queue claim before replacement', 1)
  const queue = await readQueue(context, directory)
  if (queue.some((queued) => queued.name === request.name))
    throw new KiError(`${request.run}/${request.name} is already queued`, 1)
  if (!request.relaunch) await refuseTaken(directory, thread, request)
  const prompt = join(directory, `${request.name}.queued.md`)
  await copyFile(resolve(context.workingDirectory, request.prompt), prompt)
  if ((await read(prompt)) !== body)
    throw new KiError('queue-evidence-unverified: copied prompt differs from the frozen brief', 1)
  // The thread home is on record now, so the dispatcher's launch needs no repository.
  const store = (await loadControl(directory)) ?? (await newStore(context, request.run))
  await verifyStore(context, request.run, store)
  const id = randomUUID()
  const brief = join(directory, 'queue-entries', `${id}.md`)
  await mkdir(join(directory, 'queue-entries'), { recursive: true })
  await copyFile(prompt, brief)
  if ((await read(brief)) !== body)
    throw new KiError('queue-evidence-unverified: retained brief differs from the frozen prompt', 1)
  const entry = {
    id,
    brief,
    registered: nextIdentity(store),
    dependencies: dependencyTargets(store, request.waitFor),
    requestedDependencies: dependencyTargets(store, request.waitFor),
    name: request.name,
    attempt:
      Math.max(
        (await minimumAttempt(context, directory, request.name)) - 1,
        store.attempts[request.name]?.attempt ?? 0,
        ...Object.values(store.entries)
          .filter((entry) => entry.name === request.name)
          .map((entry) => entry.attempt)
      ) + 1,
    token: randomUUID(),
    scope: randomUUID(),
    request: { ...request, prompt, repo: undefined },
    state: 'queued' as const
  }
  store.entries[entry.id] = entry
  await saveControl(directory, store)
  const history = lines(await read(queueFile(directory))).map((line) => JSON.parse(line) as LaunchRequest)
  await writeQueue(directory, [...history, { ...request, prompt, entry: entry.id, repo: undefined }])
  return {
    schema: 'ki/agent-launch/v1',
    exitCode: 0,
    identity: {
      ...identity(
        context,
        store,
        request.run,
        request.name,
        request.runtime,
        await physicalWorkdir(context, directory, request),
        entry
      ),
      state: 'queued'
    },
    position: queue.length + 1,
    entry: entry.id,
    selection: request.selection,
    warnings: reportConflicts(body, directory, request.name)
  }
}

export interface AgentSummary {
  readonly lines: readonly string[]
  readonly live: boolean
  readonly blocked?: string | undefined
}

const summary = async (context: AgentContext, directory: string): Promise<AgentSummary> => {
  const result: string[] = []
  let live = false
  let blocked: string | undefined
  for (const name of await agents(directory)) {
    const state = await agentState(context, directory, name)
    live ||= state.kind === 'running'
    if (state.kind === 'blocked') blocked = state.last
    result.push(`${name}: ${describe(state)}`)
    result.push(...(await agentWorktreeLines(context, directory, name, state.kind !== 'running')))
  }
  const queue = await readQueue(context, directory)
  if (queue.length) {
    const dispatcher = await running(context, join(directory, 'dispatch.pid'))
    live = true
    result.push(
      `queued: ${queue.map((request) => `${request.name}${request.entry ? ` [${request.entry}]` : ''}`).join(', ')} (${dispatcher ? 'dispatcher running' : 'no dispatcher'})`
    )
  }
  const store = await loadControl(directory)
  for (const entry of Object.values(store?.entries ?? {})) {
    if (entry.state === 'claimed' || entry.state === 'unconfirmed') {
      live = true
      result.push(`${entry.name}: claim-unconfirmed [${entry.id}]`)
    }
    if (entry.state === 'cancelled') result.push(`${entry.name}: ${entry.disposition} [${entry.id}]`)
  }
  const lost = await lostControlOperations(context, directory, store)
  if (lost.length)
    blocked = `ownership-unverified: ${lost.map((operation) => operation.id).join(', ')}; control holder lost; inspect preserved evidence`
  return { lines: result, live, blocked }
}

/** Brings the run's `events.jsonl` up to date with its packet. */
const observe = async (context: AgentContext, directory: string): Promise<void> =>
  deriveEvents(context, directory, await observed(context, directory))

const pendingObservation = async (context: AgentContext, directory: string): Promise<void> => {
  const started = context.now()
  for (;;) {
    try {
      return await observe(context, directory)
    } catch (error) {
      if (!(error instanceof KiError) || !error.message.startsWith('events-transaction-busy:')) throw error
      if (context.now() - started >= 120_000) throw new KiError(`${error.message}; waited 120 seconds`, 1, error.next)
      await context.processes.sleep(1000)
    }
  }
}
const eventText = (event: RunEvent): string =>
  `${event.agent} ${event.kind}: ${event.tag === undefined ? '' : `${event.tag} - `}${event.text}`

const inboxFile = (directory: string): string => join(directory, 'inbox.md')

/** The lines of the run's `inbox.md` that no `status` has shown yet, which it marks shown. */
const unreadInbox = async (directory: string): Promise<string[]> => {
  const inbox = lines(await read(inboxFile(directory)))
  const seen = Number((await read(join(directory, 'inbox.seen'))) ?? 0)
  if (inbox.length > seen) await writeFile(join(directory, 'inbox.seen'), `${inbox.length}\n`)
  return inbox.slice(seen)
}

/** Each agent's latest status, the queue, and the inbox lines sent since the last call. */
export const runStatus = async (context: AgentContext, run: string): Promise<AgentSummary> => {
  const directory = await existingRun(context, run)
  await observe(context, directory)
  const current = await summary(context, directory)
  const inbox = (await unreadInbox(directory)).map((line) => `inbox: ${line}`)
  return { lines: [...current.lines, ...inbox], live: current.live }
}

/** One live item of a run, in the `ki-coordination` banner's `- [running] <agent> - <what>` form. */
export interface RunItem {
  readonly kind: 'running' | 'queued' | 'blocked'
  readonly agent: string
  readonly what: string
}

export interface RunOverview {
  readonly run: string
  /** The thread folder, absent for a run that predates `thread.json`. */
  readonly home: string | undefined
  /** Running or held agents, then queued ones; empty for a run at rest. */
  readonly items: readonly RunItem[]
  readonly worktrees: readonly string[]
}

/** A run's running or held agents and its queue, read from packet files alone. */
export const runOverview = async (context: AgentContext, run: string): Promise<RunOverview> => {
  const directory = runDirectory(context, run)
  const items: RunItem[] = []
  const worktrees: string[] = []
  for (const name of await agents(directory)) {
    const state = await agentState(context, directory, name)
    if (state.kind === 'running') items.push({ kind: 'running', agent: name, what: describe(state) })
    if (state.kind === 'blocked') items.push({ kind: 'blocked', agent: name, what: describe(state) })
    worktrees.push(...(await agentWorktreeLines(context, directory, name, state.kind !== 'running')))
  }
  for (const [position, request] of (await readQueue(context, directory)).entries())
    items.push({
      kind: 'queued',
      agent: request.name,
      what: `position ${position + 1}${request.waitFor.length ? `, waiting for ${request.waitFor.join(', ')}` : ''}`
    })
  const store = await loadControl(directory)
  for (const entry of Object.values(store?.entries ?? {})) {
    if (
      (entry.state === 'claimed' || entry.state === 'unconfirmed') &&
      !items.some((item) => item.agent === entry.name)
    )
      items.push({ kind: 'running', agent: entry.name, what: 'claim-unconfirmed: recovery required' })
  }
  const thread = await readThread(context, run)
  return { run, home: thread && threadPath(thread), items, worktrees }
}

/**
 * Every run on this machine with an agent running or held or a non-empty queue; with `all`,
 * the runs at rest too. Archived runs are never listed, and nothing is written.
 */
export const listRuns = async (context: AgentContext, all: boolean): Promise<RunOverview[]> => {
  const entries = await readdir(agentsDirectory(context), { withFileTypes: true }).catch(() => [])
  const runs = entries.filter((entry) => entry.isDirectory() && entry.name !== '_archive').map((entry) => entry.name)
  const overviews: RunOverview[] = []
  for (const run of runs.sort()) {
    const overview = await runOverview(context, run)
    if (all || overview.items.length || overview.worktrees.length) overviews.push(overview)
  }
  return overviews
}

/**
 * The live runs homed in one repository's work folders, each with its running agents and the time its status
 * file last changed, for `ki work status` to show as run items.
 */
export const workRuns = async (context: AgentContext, root: string): Promise<WorkRun[]> => {
  const homed: WorkRun[] = []
  for (const { run, items } of await listRuns(context, false)) {
    const home = await readThread(context, run)
    if (home?.repository !== root || !home.folder.startsWith(`${WORK_DIRECTORY}/`)) continue
    const agents = []
    for (const item of items) {
      if (item.kind !== 'running') continue
      const since = await statusSince(join(runDirectory(context, run), `${item.agent}.status`))
      if (since) agents.push({ name: item.agent, since })
    }
    homed.push({ run, folder: home.folder, agents })
  }
  return homed
}

/** The sending run: the agent's marker, else `--from`, else the one run whose thread this repository owns. */
const sendingRun = async (context: AgentContext, from: string | undefined): Promise<string> => {
  const marked = context.environment['KI_AGENT_RUN']
  if (marked) return checkName(marked, 'run')
  if (from !== undefined) return checkName(from, 'run')
  const root = await gitWorkingTreeRoot(context.workingDirectory, context.runner, context.environment)
  const owned: string[] = []
  for (const { run } of await listRuns(context, true))
    if (root !== undefined && (await readThread(context, run))?.repository === root) owned.push(run)
  if (owned.length === 1) return owned[0] as string
  throw new KiError(
    owned.length
      ? `${owned.join(', ')} all have their thread in this repository; name the sender with --from <run>`
      : "no run has its thread in this directory's repository; name the sender with --from <run>",
    2
  )
}

/**
 * Appends one timestamped line, naming the sender, to a live run's `inbox.md` in its state
 * folder, where the receiving thread's next `status` shows it; returns the inbox path.
 */
export const sendLine = async (
  context: AgentContext,
  request: { readonly run: string; readonly line: string; readonly from?: string | undefined }
): Promise<string> => {
  const line = request.line.trim()
  if (!line || line.includes('\n')) throw new KiError('send takes one non-empty line', 2)
  const directory = await existingRun(context, request.run)
  const from = await sendingRun(context, request.from)
  if (!(await runOverview(context, request.run)).items.length)
    throw new KiError(`${request.run} is not live: no agent is running or held and its queue is empty`, 1)
  await appendFile(inboxFile(directory), `${instant(context)} from ${from}: ${line}\n`)
  return inboxFile(directory)
}

/**
 * Emits each new event, then one status line, per interval until no agent is running,
 * ending with ALL FINISHED.
 */
export const watchRun = async (
  context: AgentContext,
  run: string,
  seconds: number,
  emit: (line: string) => void
): Promise<void> => {
  const directory = await existingRun(context, run)
  let cursor = (await readEvents(context, directory)).length
  for (;;) {
    const current = await summary(context, directory)
    await pendingObservation(context, directory)
    for (const event of await readEvents(context, directory, cursor)) {
      emit(`${stamp(context)} | ${eventText(event)}`)
      cursor = event.seq
    }
    const line = [stamp(context), ...current.lines].join(' | ')
    if (current.blocked)
      throw new KiError(
        current.blocked,
        1,
        'preserve the attempt evidence; inspect before an explicit launch --relaunch'
      )
    if (!current.live) return emit(`${line} | ALL FINISHED`)
    emit(line)
    await context.processes.sleep(seconds * 1000)
  }
}

/**
 * Writes a prompt skeleton from the ki-delegation contract for the owner to complete, naming
 * the run's tracked decisions log and the agent's report path in the run's state folder.
 */
export const newPrompt = async (
  context: AgentContext,
  run: string,
  name: string,
  repo?: string | undefined
): Promise<string> => {
  const directory = runDirectory(context, run)
  const path = join(directory, `${checkName(name, 'name')}.draft.md`)
  const skeleton = (await read(join(await delegationAssets(context), 'run-prompt.md'))) as string
  if (await read(path)) throw new KiError(`prompt draft already exists: ${path}`, 1)
  const thread = await threadHome(context, run, repo)
  await writeFile(
    path,
    skeleton
      .replaceAll('<decisions log path>', `${thread.folder}/decisions.md`)
      .replaceAll('+/_WORK/<id>', thread.folder)
      .replaceAll('<report path>', stateReport(directory, name))
      .replaceAll('<run>', run)
  )
  return path
}

export interface DispatchRequest {
  readonly run: string
  readonly max: number
  readonly seconds: number
}

/** Starts the run's dispatcher as a detached `ki agent dispatch --foreground` process. */
export const startDispatcher = async (
  context: AgentContext,
  request: DispatchRequest
): Promise<{ readonly pid: number; readonly warning?: string }> => {
  const directory = await existingRun(context, request.run)
  const live = await running(context, join(directory, 'dispatch.pid'))
  if (live) throw new KiError(`the ${request.run} dispatcher is already running (pid ${live})`, 1)
  const pid = await context.processes.launch({
    command: context.launcher[0],
    arguments: [
      ...context.launcher.slice(1),
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
  try {
    await writeFile(join(directory, 'dispatch.pid'), `${pid}\n`)
    if ((await read(join(directory, 'dispatch.pid'))) !== `${pid}\n`)
      throw new Error('PID publication could not be verified')
  } catch (error) {
    return {
      pid,
      warning: `dispatcher started; preserve dispatch.log and inspect its process before retrying: ${String(error)}`
    }
  }
  return { pid }
}

/**
 * Keeps up to `max` agents running from the queue until it is empty and nothing runs,
 * launching the first request whose gate is open and dropping any whose gate cannot open.
 */
export const dispatchRun = async (
  context: AgentContext,
  request: DispatchRequest,
  emit: (line: string) => void
): Promise<void> => {
  const directory = await existingRun(context, request.run)
  let confirmedStart = false
  for (;;) {
    const result = await pendingControl(context, request.run, async () => {
      await flushPendingEvents(context, directory)
      const store = await loadControl(directory)
      if (store) {
        await verifyStore(context, request.run, store)
        for (const attempt of Object.values(store.attempts)) await retirePreparation(context, directory, store, attempt)
        if (
          Object.values(store.entries).some((entry) => entry.state === 'claimed' || entry.state === 'unconfirmed') ||
          Object.values(store.operations).some(
            (operation) => queueSourceOf(operation) !== undefined && queueOutcomeOf(store, operation) === undefined
          )
        ) {
          emit(`${stamp(context)} claim-unconfirmed: inspect and reconcile before replacement`)
          return 'uncertain'
        }
      }
      let alive = 0
      let heldUncertainty = false
      for (const name of await agents(directory)) {
        const state = await agentState(context, directory, name)
        if (state.kind === 'running') alive += 1
        if (state.kind === 'blocked') {
          emit(`${stamp(context)} ${state.last}`)
          if (store?.attempts[name]?.state === 'held') heldUncertainty = true
          else return 'uncertain'
        }
      }
      const queue = await readQueue(context, directory)
      const gates: Gate[] = []
      for (const queued of queue)
        gates.push(
          await gate(
            context,
            directory,
            queued.waitFor,
            queued.entry === undefined ? undefined : store?.entries[queued.entry]?.dependencies
          )
        )
      const index = gates.findIndex((state) => state.kind !== 'waiting')
      let next = queue[index]
      const state = gates[index]
      const drop = async (queued: LaunchRequest, kind: 'blocked' | 'failed', reason: string): Promise<void> => {
        const text = `could not launch: ${reason}`
        const entry = queued.entry === undefined ? undefined : store?.entries[queued.entry]
        const publish = async (): Promise<void> =>
          recordEvent(
            context,
            directory,
            await observed(context, directory),
            queued.name,
            kind,
            text,
            undefined,
            entry?.attempt ?? (await minimumAttempt(context, directory, queued.name)),
            queued.entry === undefined ? sha256(canonical(queued)) : undefined
          )
        if (store && entry) {
          entry.state = 'cancelled'
          entry.disposition = kind
          entry.dispositionReason = text
          await saveControl(directory, store)
          const pending = lines(await read(queueFile(directory))).map((line) => JSON.parse(line) as LaunchRequest)
          await writeQueue(
            directory,
            pending.filter((candidate) => candidate.entry !== queued.entry)
          )
          await publish()
        } else {
          // Durable refusal evidence precedes removal of a pre-identity packet.
          await publish()
          await writeQueue(
            directory,
            queue.filter((candidate) => candidate !== queued)
          )
        }
        emit(`${stamp(context)} could not launch ${queued.name}: ${reason}`)
      }
      if (next && state?.kind === 'closed') {
        await drop(next, 'blocked', `gate cannot open: ${state.reason}`)
        return 'again'
      }
      if (next && alive < request.max) {
        let launched: LaunchResult | undefined
        if (next.run !== request.run || typeof next.name !== 'string')
          throw new KiError('queue-home-unverified: the queued request does not belong to this run', 1)
        try {
          await preflight(context, next)
          if (store && next.entry) {
            const entry = store.entries[next.entry] as QueueIdentity
            const frozen = entry.request as LaunchRequest
            if (
              canonical(next.selection) !== canonical(frozen.selection) ||
              next.runtime !== frozen.runtime ||
              next.model !== frozen.model ||
              next.effort !== frozen.effort ||
              next.rules !== frozen.rules ||
              JSON.stringify(next.allow ?? []) !== JSON.stringify(frozen.allow ?? [])
            )
              throw new KiError('selection-changed: the queue differs from its frozen request', 1)
            next = { ...frozen, entry: entry.id }
          }
          launched = await launchAgent(
            context,
            next.entry === undefined ? { ...next, queueSource: sha256(canonical(next)) } : next,
            true
          )
          confirmedStart = true
          await writeQueue(directory, queue.toSpliced(index, 1))
          emit(`${stamp(context)} launched ${next.name}`)
          if (launched.warnings.some((warning) => warning.startsWith('confirmed start;'))) {
            emit(`${stamp(context)} follow-up requires inspection: ${launched.warnings.join('; ')}`)
          }
        } catch (error) {
          if (launched !== undefined) {
            emit(`${stamp(context)} launched ${next.name}; follow-up requires inspection: ${String(error)}`)
            return 'inspection'
          }
          const current = await loadControl(directory)
          const entryId = next.entry
          if (!(error instanceof KiError)) throw error
          if (error.message.startsWith('selection-changed:')) throw error
          const operations = Object.values(current?.operations ?? {})
          if (
            (next.entry === undefined &&
              operations.some(
                (operation) => queueSourceOf(operation) === sha256(canonical(next)) && !operation.resolvedBy
              )) ||
            (next.entry &&
              (operations.some(
                (operation) =>
                  ['spawn', 'spawn-supervisor'].includes(operation.operation) &&
                  (operation.target as AttemptIdentity).entry === entryId
              ) ||
                current?.entries[next.entry]?.state === 'unconfirmed'))
          ) {
            emit(`${stamp(context)} claim-unconfirmed: ${error.message}`)
            return 'uncertain'
          }
          if (next.role !== undefined) throw error
          await drop(next, 'failed', error.message)
        }
        return 'again'
      }
      if (heldUncertainty && queue.length === 0) return 'uncertain'
      if (alive === 0) {
        for (const [position, queued] of queue.entries()) {
          const waiting = gates[position] as Extract<Gate, { kind: 'waiting' }>
          await drop(queued, 'blocked', `gate cannot open: nothing running for ${waiting.names.join(', ')}`)
        }
        if (heldUncertainty) return 'uncertain'
        emit(`${stamp(context)} queue empty, all finished`)
        return 'end'
      }
      return 'sleep'
    }).catch((error: unknown) => {
      if (!confirmedStart) throw error
      emit(`${stamp(context)} follow-up requires inspection: ${String(error)}`)
      return 'inspection' as const
    })
    if (result === 'uncertain') throw new KiError('claim-unconfirmed: reconcile before dispatching replacement work', 1)
    if (result === 'inspection') throw new KiError('dispatch-unconfirmed: follow-up requires inspection', 1)
    if (result === 'end') return
    if (result === 'sleep') await context.processes.sleep(request.seconds * 1000)
  }
}

/** The events `wait --next` returns; launches, holds and milestones stay in the log and `watch`. */
const waitedKinds: ReadonlySet<RunEvent['kind']> = new Set([
  'done',
  'failed',
  'blocked',
  'needs-owner',
  'stopped',
  'dequeued'
])

/**
 * Blocks until the run has an event the coordinator has not yet seen and returns it, moving the
 * `events.seen` cursor past it; with `next` false, waits for the whole run instead.
 */
export const waitForRun = async (
  context: AgentContext,
  run: string,
  options: { readonly next: boolean; readonly seconds: number }
): Promise<string> => {
  const directory = await existingRun(context, run)
  const seenFile = join(directory, 'events.seen')
  for (;;) {
    // Liveness first, so an agent that stops during this pass still has its events derived.
    const { live, blocked } = await summary(context, directory)
    await pendingObservation(context, directory)
    if (options.next) {
      const cursor = Number.parseInt((await read(seenFile)) ?? '0', 10)
      const event = (await readEvents(context, directory, cursor)).find((candidate) => waitedKinds.has(candidate.kind))
      if (event) {
        const contents = `${event.seq}\n`
        try {
          await writeFile(seenFile, contents)
        } catch (error) {
          if ((await read(seenFile)) !== contents)
            throw new KiError(`events-evidence-unverified: waiter cursor write interrupted: ${String(error)}`, 1)
        }
        if ((await read(seenFile)) !== contents)
          throw new KiError('events-evidence-unverified: waiter cursor write could not be verified', 1)
        return eventText(event)
      }
    }
    if (blocked)
      throw new KiError(blocked, 1, 'preserve the attempt evidence; inspect before an explicit launch --relaunch')
    if (!live) return 'ALL FINISHED'
    await context.processes.sleep(options.seconds * 1000)
  }
}
