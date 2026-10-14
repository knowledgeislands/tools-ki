import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { KiError } from '../errors.ts'
import { requiredLocalRegistry } from '../storage/local-registry.ts'
import { type AgentContext, agentsDirectory, git, instant, read } from './context.ts'
import { agentState, agents, existingRun, pidOf, readQueue, running } from './runs.ts'
import {
  adoptStateFiles,
  type DecisionEntry,
  decisionsLog,
  parseDecisions,
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
const unresolved = async (context: AgentContext, thread: ThreadHome, home: string): Promise<string | undefined> => {
  const target = home.split('#')[0] as string
  if (recordIdentifier.test(target))
    return (await recordExists(context, target)) ? undefined : 'matches no roadmap record in the registry'
  const path = isAbsolute(target) ? target : join(thread.repository, target)
  if (!(await stat(path).catch(() => undefined))) return 'does not exist'
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
    if (entry.home === undefined) {
      lines.push(blocker(`decision ${entry.number} has no home (${log})`))
      continue
    }
    const reason = await unresolved(context, thread, entry.home)
    lines.push(
      reason === undefined
        ? ok(`decision ${entry.number} home ${entry.home}`)
        : blocker(`decision ${entry.number} home ${entry.home} ${reason}`)
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
  for (const name of names) {
    const state = await agentState(context, directory, name)
    if (state.kind === 'running')
      lines.push(blocker(`${name} still running (pid ${await pidOf(join(directory, `${name}.pid`))})`))
    else if (state.kind === 'finished') lines.push(ok(`${name} finished`))
    else if (request.acceptExited.includes(name)) lines.push(ok(`${name} exited without DONE, accepted`))
    else lines.push(blocker(`${name} exited without DONE`))
  }
  const dispatcher = await running(context, join(directory, 'dispatch.pid'))
  lines.push(dispatcher ? blocker(`dispatcher still running (pid ${dispatcher})`) : ok('no dispatcher running'))
  const queue = await readQueue(directory)
  lines.push(queue.length ? blocker(`queue holds ${listed(queue.map((queued) => queued.name))}`) : ok('queue empty'))
  const worktrees = await entries(join(directory, 'worktrees'))
  lines.push(worktrees.length ? blocker(`worktrees/ holds ${listed(worktrees)}`) : ok('no worktrees'))
  const adopted = await adoptStateFiles(context, request.run, thread)
  lines.push(...adopted.map((file) => ok(`moved ${file} from the state folder into ${thread.folder}`)))
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
        : decisions.map((entry) => `- Decision ${entry.number}: ${entry.home as string}`)),
    ''
  ].join('\n')

/**
 * Retires a finished run's state folder once the reconcile gate passes: no agent or
 * dispatcher alive, every agent `DONE` or accepted, the queue and worktrees empty, every
 * decision housed, and the tracked thread folder committed and clean. It first moves any
 * log or report the run kept in its state folder into the thread folder, which then needs
 * committing; beyond that move, on any blocker it reports every line and changes nothing. It
 * archives by default, so a run folder never goes while anything durable exists only inside
 * it, and deletes only on `--delete`.
 */
export const closeRun = async (context: AgentContext, request: CloseRequest): Promise<CloseResult> => {
  if (request.delete && request.compress) throw new KiError('--delete and --compress exclude each other', 2)
  const directory = await existingRun(context, request.run)
  const archive = join(agentsDirectory(context), '_archive')
  const target = join(archive, request.compress ? `${request.run}.tar.gz` : request.run)
  if (!request.delete && (await stat(target).catch(() => undefined)))
    throw new KiError(`${request.run} is already archived at ${target}`, 1)
  const thread = await threadHome(context, request.run, request.repo, false)
  const { lines, decisions, log } = await gateLines(context, directory, thread, request)
  const rendered = lines.map(render)
  if (lines.some((line) => !line.ok)) return { lines: rendered, outcome: undefined }

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
  return { lines: rendered, outcome: `${outcome}; close note at ${notePath}` }
}
