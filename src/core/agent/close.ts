import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { KiError } from '../errors.ts'
import { requiredLocalRegistry } from '../storage/local-registry.ts'
import { type AgentContext, agentsDirectory, git, instant, read, temporaryDirectory, temporaryRoot } from './context.ts'
import { agentState, agents, closedAgentDirectory, existingRun, pidOf, readQueue, running } from './runs.ts'
import {
  adoptStateFiles,
  type DecisionEntry,
  decisionName,
  decisionsLog,
  parseDecisions,
  requireHome,
  type ThreadHome,
  threadHome,
  threadPath
} from './thread.ts'

export interface CloseRequest {
  readonly run: string
  readonly repo?: string | undefined
  /** Remove the state folder instead of archiving it. */
  readonly delete: boolean
  /** Archive the state folder as `_archive/<run>.tar.gz` instead of moving it. */
  readonly compress: boolean
  /** Agents that exited without `DONE` whose reports the owner has read. */
  readonly acceptExited: readonly string[]
  /** The owner waives the decision gate; the close note records it. */
  readonly reconciled: boolean
}

interface GateLine {
  readonly ok: boolean
  readonly text: string
}

export interface CloseResult {
  /** Every gate line, `ok` or `blocker`, in the order checked. */
  readonly lines: readonly string[]
  /** The archive line; undefined when a blocker stopped the close. */
  readonly outcome: string | undefined
}

const ok = (text: string): GateLine => ({ ok: true, text })
const blocker = (text: string): GateLine => ({ ok: false, text })

const listed = (names: readonly string[]): string => names.join(', ')

const entries = async (directory: string): Promise<readonly string[]> =>
  (await readdir(directory).catch(() => [] as string[])).sort()

/** `KI-TOOL-KI-CLI-124`: an uppercase repository or area code and an issue number. */
const recordIdentifier = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/

const roadmapDirectories = ['docs/roadmap', 'Streams/Roadmap'] as const

/** Whether a registered repository holds a roadmap record with this identifier. */
const recordExists = async (context: AgentContext, identifier: string): Promise<boolean> => {
  for (const repository of await requiredLocalRegistry(context.stateDirectory))
    for (const directory of roadmapDirectories)
      if (
        (await entries(join(repository.path, directory))).some(
          (file) => file.startsWith(`${identifier}-`) && file.endsWith('.md')
        )
      )
        return true
  return false
}

/** Undefined when the home resolves; otherwise why it does not. */
const unresolved = async (
  context: AgentContext,
  thread: ThreadHome,
  home: string,
  kind: string | undefined
): Promise<string | undefined> => {
  const target = home.split('#')[0] as string
  if (recordIdentifier.test(target))
    return (await recordExists(context, target)) ? undefined : 'matches no roadmap record in the registry'
  const path = isAbsolute(target) ? target : join(thread.repository, target)
  if (!(await stat(path).catch(() => undefined))) return 'does not exist'
  // A held decision waits in the thread's checkpoint, which the ignore block may keep out of Git.
  if (kind === 'held' && target.split('/').includes('_CHECKPOINTS')) return undefined
  const tracked = await git(context, dirname(path), ['ls-files', '--error-unmatch', '--', path])
  return tracked.exitCode === 0 ? undefined : 'is not tracked by Git'
}

const decisionLines = async (
  context: AgentContext,
  thread: ThreadHome,
  request: CloseRequest
): Promise<{
  readonly lines: readonly GateLine[]
  readonly decisions: readonly DecisionEntry[]
  readonly log: string | undefined
}> => {
  const log = decisionsLog(thread)
  const text = await read(log)
  if (text === undefined) return { lines: [ok('no decisions log')], decisions: [], log: undefined }
  const decisions = parseDecisions(text)
  if (request.reconciled)
    return {
      lines: [ok(`decision gate waived by --reconciled (${decisions.length} entries in ${log})`)],
      decisions,
      log
    }
  const lines: GateLine[] = []
  for (const entry of decisions) {
    const name = `decision ${decisionName(entry)}${entry.class === undefined ? '' : ` (${entry.class})`}`
    if (entry.home === undefined) {
      lines.push(
        entry.class === 'operational' ? ok(`${name} is its own home`) : blocker(`${name} has no home (${log})`)
      )
      continue
    }
    const reason = await unresolved(context, thread, entry.home, entry.class)
    lines.push(
      reason === undefined ? ok(`${name} home ${entry.home}`) : blocker(`${name} home ${entry.home} ${reason}`)
    )
  }
  return { lines, decisions, log }
}

const folderLine = async (context: AgentContext, thread: ThreadHome): Promise<GateLine> => {
  const folder = threadPath(thread)
  if (!(await stat(folder).catch(() => undefined))) return ok(`no thread folder at ${thread.folder}`)
  const status = await git(context, thread.repository, ['status', '--porcelain', '--untracked-files=all', '--', folder])
  if (status.exitCode !== 0) throw new KiError(`git status failed in ${thread.repository}: ${status.output.trim()}`, 1)
  return status.output.trim()
    ? blocker(`thread folder ${thread.folder} has uncommitted changes`)
    : ok(`thread folder ${thread.folder} committed and clean`)
}

/** A line for each agent's temporary folder that still holds output; `--reconciled` waives it. */
const temporaryLines = async (context: AgentContext, request: CloseRequest): Promise<readonly GateLine[]> => {
  const root = temporaryRoot(context, request.run)
  const lines: GateLine[] = []
  for (const name of await entries(root)) {
    const held = await entries(join(root, name))
    if (!held.length) continue
    const text = `temporary folder ${join(root, name)} holds ${listed(held)}`
    lines.push(request.reconciled ? ok(`${text}, waived by --reconciled`) : blocker(text))
  }
  return lines
}

/** Removes the run's temporary root, one line for each agent folder it held. */
const removeTemporary = async (context: AgentContext, run: string): Promise<readonly GateLine[]> => {
  const root = temporaryRoot(context, run)
  const folders = await entries(root)
  await rm(root, { recursive: true, force: true })
  return folders.map((name) => ok(`removed ${join(root, name)}`))
}

/** Whether one agent may close: finished with `DONE`, or exited without it and accepted. */
const stateLine = async (
  context: AgentContext,
  directory: string,
  name: string,
  acceptExited: readonly string[]
): Promise<GateLine> => {
  const state = await agentState(context, directory, name)
  if (state.kind === 'running')
    return blocker(`${name} still running (pid ${await pidOf(join(directory, `${name}.pid`))})`)
  if (state.kind === 'blocked') return blocker(`${name} ${state.last}`)
  if (state.kind === 'finished') return ok(`${name} finished`)
  if (acceptExited.includes(name)) return ok(`${name} exited without DONE, accepted`)
  return blocker(`${name} exited without DONE`)
}

const gateLines = async (
  context: AgentContext,
  directory: string,
  thread: ThreadHome,
  request: CloseRequest
): Promise<{
  readonly lines: readonly GateLine[]
  readonly decisions: readonly DecisionEntry[]
  readonly log: string | undefined
}> => {
  const lines: GateLine[] = []
  const names = await agents(directory)
  for (const name of request.acceptExited)
    if (!names.includes(name)) throw new KiError(`no agent ${name} in ${request.run}`, 2)
  for (const name of names) lines.push(await stateLine(context, directory, name, request.acceptExited))
  const dispatcher = await running(context, join(directory, 'dispatch.pid'))
  lines.push(dispatcher ? blocker(`dispatcher still running (pid ${dispatcher})`) : ok('no dispatcher running'))
  const queue = await readQueue(context, directory)
  lines.push(queue.length ? blocker(`queue holds ${listed(queue.map((queued) => queued.name))}`) : ok('queue empty'))
  const worktrees = await entries(join(directory, 'worktrees'))
  lines.push(worktrees.length ? blocker(`worktrees/ holds ${listed(worktrees)}`) : ok('no worktrees'))
  lines.push(...(await temporaryLines(context, request)))
  // Gated before the move, so that a close that fails leaves the state folder as it found it.
  if (lines.some((line) => !line.ok)) {
    const pending = await adoptStateFiles(context, request.run, thread, false)
    lines.push(...pending.map((file) => ok(`${file} stays in the state folder until the blockers above clear`)))
  } else {
    const adopted = await adoptStateFiles(context, request.run, thread)
    lines.push(...adopted.map((file) => ok(`moved ${file} from the state folder into ${thread.folder}`)))
  }
  const decided = await decisionLines(context, thread, request)
  lines.push(...decided.lines, await folderLine(context, thread))
  return { lines, decisions: decided.decisions, log: decided.log }
}

const render = (line: GateLine): string => `${line.ok ? 'ok' : 'blocker'}: ${line.text}`

const note = (
  context: AgentContext,
  request: CloseRequest,
  outcome: string,
  lines: readonly GateLine[],
  decisions: readonly DecisionEntry[],
  log: string | undefined
): string =>
  [
    `# Close of run ${request.run}`,
    '',
    `Closed ${instant(context)} by \`ki agent close\`${request.reconciled ? ' with the decision gate waived by the owner (`--reconciled`)' : ''}. ${outcome}.`,
    '',
    '## Gate',
    '',
    ...lines.map((line) => `- ${render(line)}`),
    '',
    '## Decisions',
    '',
    ...(log === undefined
      ? ['No decisions log.']
      : request.reconciled
        ? [
            `The owner waived the decision gate with \`--reconciled\`; ${decisions.length} entries in ${log} were not checked.`
          ]
        : decisions.map(
            (entry) =>
              `- Decision ${decisionName(entry)}${entry.class === undefined ? '' : ` (${entry.class})`}: ${entry.home ?? 'its own home'}`
          )),
    ''
  ].join('\n')

/**
 * Retires a finished run's state folder once the reconcile gate passes: no agent or
 * dispatcher alive, every agent `DONE` or accepted, the queue and worktrees empty, every
 * decision housed, every agent's temporary folder empty, and the tracked thread folder
 * committed and clean; it then removes the run's temporary folders. Once the agents, queue,
 * worktrees and temporary folders pass, it moves any log or report the run kept in its state
 * folder into the thread folder, which then needs committing; beyond that move, on any blocker
 * it reports every line and changes nothing. It
 * archives by default, so a run folder never goes while anything durable exists only inside
 * it, and deletes only on `--delete`. Before any of that it refuses a home whose repository is
 * relative, gone, or in no registered repository, so that nothing is written where the home
 * no longer is.
 */
export const closeRun = async (context: AgentContext, request: CloseRequest): Promise<CloseResult> => {
  if (request.delete && request.compress) throw new KiError('--delete and --compress exclude each other', 2)
  const directory = await existingRun(context, request.run)
  const archive = join(agentsDirectory(context), '_archive')
  const target = join(archive, request.compress ? `${request.run}.tar.gz` : request.run)
  if (!request.delete && (await stat(target).catch(() => undefined)))
    throw new KiError(`${request.run} is already archived at ${target}`, 1)
  const thread = await threadHome(context, request.run, request.repo, false)
  // Checked before the gate, which moves state-folder files into the home.
  await requireHome(context, request.run, thread)
  const gate = await gateLines(context, directory, thread, request)
  if (gate.lines.some((line) => !line.ok)) return { lines: gate.lines.map(render), outcome: undefined }
  const lines = [...gate.lines, ...(await removeTemporary(context, request.run))]
  const { decisions, log } = gate

  await mkdir(archive, { recursive: true })
  let outcome: string
  let notePath: string
  if (request.delete) {
    await rm(directory, { recursive: true, force: true })
    outcome = `deleted ${directory}`
    notePath = join(archive, `${request.run}.close.md`)
  } else if (request.compress) {
    const tar = await context.runner(
      'tar',
      ['-C', agentsDirectory(context), '-czf', target, request.run],
      context.environment
    )
    if (tar.exitCode !== 0) throw new KiError(`tar failed: ${tar.output.trim()}`, 1)
    await rm(directory, { recursive: true, force: true })
    outcome = `compressed ${directory} to ${target}`
    notePath = join(archive, `${request.run}.close.md`)
  } else {
    await rename(directory, target)
    outcome = `archived ${directory} to ${target}`
    notePath = join(target, 'close.md')
  }
  await writeFile(notePath, note(context, request, outcome, lines, decisions, log))
  return { lines: lines.map(render), outcome: `${outcome}; close note at ${notePath}` }
}

export interface AgentCloseRequest {
  readonly run: string
  readonly repo?: string | undefined
  /** The agents to close by name. */
  readonly agents: readonly string[]
  /** Also close every agent that finished with `DONE`. */
  readonly finished: boolean
  /** Agents that exited without `DONE` whose reports the owner has read; each is closed too. */
  readonly acceptExited: readonly string[]
  /** The owner waives the temporary-folder check; the close note records it. */
  readonly reconciled: boolean
}

const agentFiles = ['pid', 'status', 'log', 'prompt.md', 'launch.json', 'report.md', 'queued.md', 'draft.md']

/** One agent's packet in the state folder: its run files and any `<name>.prev-<n>/` it set aside. */
const packetOf = async (directory: string, name: string): Promise<readonly string[]> =>
  (await entries(directory)).filter((file) => {
    if (!file.startsWith(`${name}.`)) return false
    const suffix = file.slice(name.length + 1)
    return agentFiles.includes(suffix) || /^prev-\d+$/.test(suffix)
  })

/** The gate lines of one agent: its state, the queue, its worktrees, its temporary folder. */
const agentGate = async (
  context: AgentContext,
  directory: string,
  request: AgentCloseRequest,
  name: string,
  queued: readonly { readonly name: string; readonly waitFor?: readonly string[] | undefined }[]
): Promise<readonly GateLine[]> => {
  const lines = [await stateLine(context, directory, name, request.acceptExited)]
  if (queued.some((entry) => entry.name === name)) lines.push(blocker(`queue holds ${name}`))
  const waiting = queued.filter((entry) => entry.waitFor?.includes(name)).map((entry) => entry.name)
  if (waiting.length)
    lines.push(blocker(`queued ${listed(waiting)} ${waiting.length === 1 ? 'waits' : 'wait'} for ${name}`))
  const worktrees = (await entries(join(directory, 'worktrees'))).filter((entry) => entry.startsWith(`${name}.`))
  if (worktrees.length) lines.push(blocker(`worktrees/ holds ${listed(worktrees)}`))
  const temporary = temporaryDirectory(context, request.run, name)
  const held = await entries(temporary)
  if (held.length) {
    const text = `temporary folder ${temporary} holds ${listed(held)}`
    lines.push(request.reconciled ? ok(`${text}, waived by --reconciled`) : blocker(text))
  }
  const earlier = await entries(closedAgentDirectory(directory, name))
  if (earlier.length) lines.push(blocker(`closed/${name} already holds an earlier close (${listed(earlier)})`))
  return lines
}

const agentNote = (
  context: AgentContext,
  request: AgentCloseRequest,
  name: string,
  outcome: string,
  lines: readonly GateLine[]
): string =>
  [
    `# Close of agent ${name} in run ${request.run}`,
    '',
    `Closed ${instant(context)} by \`ki agent close --agent\`${request.reconciled ? ' with the temporary-folder check waived by the owner (`--reconciled`)' : ''}. ${outcome}.`,
    '',
    '## Gate',
    '',
    ...lines.map((line) => `- ${render(line)}`),
    ''
  ].join('\n')

/**
 * Retires some agents of a run while the rest of it stays open: each one named, every
 * finished one on `finished`, and each accepted with `acceptExited`. Each must have finished
 * with `DONE` or be accepted, be neither queued nor awaited by a queued agent, and hold no
 * worktree and no temporary output. On any blocker it reports every line and changes nothing.
 * Once the gate passes it moves each agent's report into the work folder, which then needs
 * committing, removes its temporary folder, and moves the rest of its packet into
 * `closed/<name>/` in the state folder with a `close.md` note, so that `status`, `watch` and the
 * run's own close no longer see it and closing the run archives it with the rest. Decisions
 * belong to the run, so their gate waits for the run's close.
 */
export const closeAgents = async (context: AgentContext, request: AgentCloseRequest): Promise<CloseResult> => {
  const directory = await existingRun(context, request.run)
  const names = await agents(directory)
  for (const name of [...request.agents, ...request.acceptExited])
    if (!names.includes(name)) throw new KiError(`no open agent ${name} in ${request.run}`, 2)
  const finished: string[] = []
  if (request.finished)
    for (const name of names) if ((await agentState(context, directory, name)).kind === 'finished') finished.push(name)
  const selected = [...new Set([...request.agents, ...request.acceptExited, ...finished])].sort()
  if (!selected.length) return { lines: [], outcome: `no finished agent to close in ${request.run}` }
  const thread = await threadHome(context, request.run, request.repo, false)
  // Checked before the gate, which moves state-folder reports into the home.
  await requireHome(context, request.run, thread)
  const queued = await readQueue(context, directory)
  const gates = new Map<string, readonly GateLine[]>()
  for (const name of selected) gates.set(name, await agentGate(context, directory, request, name, queued))
  const gate = [...gates.values()].flat()
  if (gate.some((line) => !line.ok)) {
    const pending = await adoptStateFiles(context, request.run, thread, false, selected)
    return {
      lines: [
        ...gate,
        ...pending.map((file) => ok(`${file} stays in the state folder until the blockers above clear`))
      ].map(render),
      outcome: undefined
    }
  }
  const lines: GateLine[] = []
  const closed: string[] = []
  for (const name of selected) {
    const own = [...(gates.get(name) as readonly GateLine[])]
    const adopted = await adoptStateFiles(context, request.run, thread, true, [name])
    own.push(...adopted.map((file) => ok(`moved ${file} from the state folder into ${thread.folder}`)))
    const temporary = temporaryDirectory(context, request.run, name)
    if (await stat(temporary).catch(() => undefined)) {
      await rm(temporary, { recursive: true, force: true })
      own.push(ok(`removed ${temporary}`))
    }
    const target = closedAgentDirectory(directory, name)
    await mkdir(target, { recursive: true })
    for (const file of await packetOf(directory, name)) await rename(join(directory, file), join(target, file))
    const outcome = `moved ${name}'s packet to ${target}`
    await writeFile(join(target, 'close.md'), agentNote(context, request, name, outcome, own))
    lines.push(...own)
    closed.push(`${outcome}; close note at ${join(target, 'close.md')}`)
  }
  return { lines: lines.map(render), outcome: closed.join('\n') }
}
