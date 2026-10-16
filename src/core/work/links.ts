import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { REPOSITORY_DECLARATION_FILE, readRepositoryDeclaration } from '../configuration/index.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { type LocalRegistryEntry, requiredLocalRegistry } from '../storage/local-registry.ts'

export interface RecordLinkContext {
  readonly stateDirectory: string
  readonly environment: Environment
  /** Runs `git` to find a pruned record's last revision. */
  readonly runner: Runner
}

/** The printed Markdown link, or why none can be printed. */
export type RecordLink = { readonly link: string } | { readonly reason: string }

/** `KI-TOOL-KI-CLI-127`: an uppercase repository code, an issuing area and an issue number. */
const recordIdentifier = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/
const areaAndNumber = /^([A-Z][A-Z0-9]*)-(\d+)$/
const roadmapDirectories = ['docs/roadmap', 'Streams/Roadmap'] as const
const ISSUE_LEDGER = '_ISSUES.md'

const repositoryCode = async (repository: string): Promise<string | undefined> => {
  try {
    const declaration = await readRepositoryDeclaration(join(repository, REPOSITORY_DECLARATION_FILE))
    const code = declaration.skills.find((skill) => skill.name === 'ki-repo')?.configuration['repo_code']
    return typeof code === 'string' ? code : undefined
  } catch {
    return undefined
  }
}

/** The live record file, as a path relative to the repository. */
const liveRecord = async (repository: string, identifier: string): Promise<string | undefined> => {
  for (const directory of roadmapDirectories) {
    const files = await readdir(join(repository, directory)).catch(() => [] as string[])
    const file = files.find((name) => name.startsWith(`${identifier}-`) && name.endsWith('.md'))
    if (file) return `${directory}/${file}`
  }
  return undefined
}

/** The issuing area's high-water mark in the repository's `_ISSUES.md` ledger, with its roadmap directory. */
const issued = async (
  repository: string,
  area: string
): Promise<{ readonly directory: string; readonly mark: number } | undefined> => {
  for (const directory of roadmapDirectories) {
    const text = await readFile(join(repository, directory, ISSUE_LEDGER), 'utf8').catch(() => undefined)
    if (text === undefined) continue
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
    const areas = (front === undefined ? undefined : (parse(front) as { areas?: unknown })?.areas) as
      | Record<string, unknown>
      | undefined
    const mark = areas?.[area]
    return typeof mark === 'number' ? { directory, mark } : undefined
  }
  return undefined
}

const git = (context: RecordLinkContext, repository: string, arguments_: readonly string[]) =>
  context.runner('git', ['-C', repository, ...arguments_], context.environment)

/** The record's path and the last revision holding it: the first parent of the newest commit that deleted it. */
const lastRevision = async (
  context: RecordLinkContext,
  repository: string,
  directory: string,
  identifier: string
): Promise<{ readonly path: string; readonly revision: string } | undefined> => {
  const log = await git(context, repository, [
    'log',
    '--diff-filter=D',
    '--format=%H %P',
    '--name-only',
    '--',
    directory
  ])
  if (log.exitCode !== 0) return undefined
  let parent: string | undefined
  for (const line of log.output.split('\n')) {
    const commit = /^[0-9a-f]{40} ([0-9a-f]{40})/.exec(line)
    if (commit) parent = commit[1]
    else if (parent && line.startsWith(`${directory}/${identifier}-`) && line.endsWith('.md'))
      return { path: line, revision: parent }
  }
  return undefined
}

const linkInScope = async (
  context: RecordLinkContext,
  entry: LocalRegistryEntry,
  identifier: string,
  area: string,
  number: number
): Promise<RecordLink> => {
  const live = await liveRecord(entry.path, identifier)
  if (live) return { link: `[${identifier}](${join(entry.path, live)})` }
  const ledger = await issued(entry.path, area)
  if (!ledger || number > ledger.mark) return { reason: `${identifier} has not been issued in ${entry.key}` }
  const pruned = await lastRevision(context, entry.path, ledger.directory, identifier)
  if (!pruned) return { reason: `${identifier} has no record in ${entry.key} and no commit there deleted one` }
  return { link: `[${identifier} (pruned)](${entry.repository}/blob/${pruned.revision}/${pruned.path})` }
}

/**
 * Resolves one roadmap record identifier to a Markdown link. The registered repository whose
 * declared `repo_code` scopes the identifier is searched first; with no scope match, every
 * registered repository is walked as the `close` gate does. A record no longer on disk but
 * within its area's issued numbers links to its last committed revision on the canonical remote.
 */
export const recordLink = async (context: RecordLinkContext, identifier: string): Promise<RecordLink> => {
  if (!recordIdentifier.test(identifier)) return { reason: `${identifier} is not a work-record identifier` }
  const registry = await requiredLocalRegistry(context.stateDirectory)
  const scoped: { readonly entry: LocalRegistryEntry; readonly code: string }[] = []
  for (const entry of registry) {
    const code = await repositoryCode(entry.path)
    if (code && identifier.startsWith(`${code}-`) && areaAndNumber.test(identifier.slice(code.length + 1)))
      scoped.push({ entry, code })
  }
  if (!scoped.length) {
    for (const entry of registry) {
      const live = await liveRecord(entry.path, identifier)
      if (live) return { link: `[${identifier}](${join(entry.path, live)})` }
    }
    return { reason: `no registered repository issues ${identifier}` }
  }
  const longest = Math.max(...scoped.map((candidate) => candidate.code.length))
  const { entry, code } = scoped.find((candidate) => candidate.code.length === longest) as (typeof scoped)[number]
  const [, area, number] = areaAndNumber.exec(identifier.slice(code.length + 1)) as RegExpExecArray
  return linkInScope(context, entry, identifier, area as string, Number(number))
}
