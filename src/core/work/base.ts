import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Runner } from '../runtime/runner.ts'

/**
 * Change documents name the commit of the standards they were written against (STD-BASE, 8 November 2026): a
 * `Base: <repository>@<commit>` line and a `Touches:` line of the files they change. A document whose touched files
 * have moved on the base repository's `origin/main` since that commit needs rebasing. Design notes, `.design.md`, still
 * read as change documents through the rollout, but only those already carrying a `Base:` line.
 */
const WORK_DIRECTORY = join('+', '_WORK')
const CHANGE_SUFFIX = '.change.md'
const DESIGN_SUFFIX = '.design.md'
const MAIN = 'refs/remotes/origin/main'

/** A header field, plain or bold: `Base: …`, `**Base:** …` or `**Status: … .**`. */
const HEADER = /^\*{0,2}(Base|Touches|Status):\*{0,2}\s*(.*)$/
const BASE = /^`?([A-Za-z0-9._-]+)@([0-9a-f]{4,40})\b/i
const GRADUATED = /\bgraduated\b/i
const QUALIFIER = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/[A-Za-z0-9][A-Za-z0-9._-]*$/

/** A repository whose work folders may hold change documents, by its local registry key. */
export interface BaseCheckRepository {
  readonly key: string
  readonly path: string
}

/** A registered checkout a `Base:` line may name, by registry key, with its GitHub identity. */
export interface BaseCheckCheckout extends BaseCheckRepository {
  readonly repository: string
}

export type BaseVerdict = 'moved' | 'current' | 'unknown'

export type BaseFileChange = 'modified' | 'added' | 'deleted' | 'renamed'

/** A touched file that has moved since the base: how, and for a rename its new path. */
export interface BaseMovedFile {
  readonly path: string
  readonly change: BaseFileChange
  readonly to?: string
}

export interface BaseCheckDocument {
  /** The registry key of the repository holding the document. */
  readonly repository: string
  /** The document's path within that repository. */
  readonly path: string
  readonly base: { readonly repository: string; readonly commit: string } | null
  readonly touches: readonly string[]
  readonly status: string | null
  readonly verdict: BaseVerdict
  readonly files: readonly BaseMovedFile[]
  /** Why the verdict is unknown; null otherwise. */
  readonly reason: string | null
}

export interface BaseCheckReport {
  readonly schema: 'ki/work-base/v1'
  readonly documents: readonly BaseCheckDocument[]
  /** Graduated documents, by repository and path, which are not checked. */
  readonly graduated: readonly { readonly repository: string; readonly path: string }[]
}

export interface BaseCheckRequest {
  /** The repositories whose `+/_WORK/` folders are read. */
  readonly repositories: readonly BaseCheckRepository[]
  /** The registered checkouts a `Base:` line may name. */
  readonly checkouts: readonly BaseCheckCheckout[]
  readonly runner: Runner
  readonly environment: NodeJS.ProcessEnv
}

interface Header {
  readonly base?: string
  readonly touches?: string
  readonly status?: string
}

/** The first `Base:`, `Touches:` and `Status:` lines above the document's first section heading. */
const readHeader = (text: string): Header => {
  const header: { -readonly [Field in keyof Header]: string } = {}
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) break
    const match = HEADER.exec(line.trim())
    if (match) header[(match[1] as string).toLowerCase() as keyof Header] ??= (match[2] as string).trim()
  }
  return header
}

/** Each touched entry: every backticked span, or else the comma, semicolon or `and` separated list. */
const touchedEntries = (value: string): readonly string[] => {
  const quoted = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string)
  const entries = quoted.length ? quoted : value.split(/,|;|\band\b/).map((entry) => entry.replace(/\.$/, ''))
  return entries.map((entry) => entry.trim().replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean)
}

interface Touches {
  readonly paths: readonly string[]
  /** Repositories other than the base that the line names files in. */
  readonly elsewhere: readonly string[]
}

/**
 * The touched paths in the base repository. An entry `<owner>/<name>` whose owner owns a registered repository names
 * the repository the entries after it belong to, as in ``Touches: `owner/app` `docs/spec.md` ``; paths in any other
 * repository than the base cannot be checked against its history.
 */
const touchedPaths = (entries: readonly string[], base: string, owners: ReadonlySet<string>): Touches => {
  const paths: string[] = []
  const elsewhere = new Set<string>()
  let inBase = true
  for (const entry of entries) {
    const owner = QUALIFIER.exec(entry)?.[1]
    if (owner !== undefined && owners.has(owner.toLowerCase())) {
      inBase = `https://github.com/${entry.toLowerCase()}` === base
      if (!inBase) elsewhere.add(entry)
    } else if (inBase) paths.push(entry)
  }
  return { paths, elsewhere: [...elsewhere] }
}

/** Every change document, and every design note, under a repository's `+/_WORK/`, by path within it, sorted. */
const changeDocuments = async (root: string): Promise<readonly string[]> =>
  (await readdir(join(root, WORK_DIRECTORY), { recursive: true }).catch(() => []))
    .filter((path) => path.endsWith(CHANGE_SUFFIX) || path.endsWith(DESIGN_SUFFIX))
    .map((path) => join(WORK_DIRECTORY, path))
    .sort()

type Resolution = { readonly commit: string; readonly main: string } | { readonly reason: string }

interface Git {
  readonly resolve: (checkout: BaseCheckCheckout, commit: string) => Promise<Resolution>
  readonly diff: (checkout: BaseCheckCheckout, from: string, to: string) => Promise<readonly BaseMovedFile[]>
}

/** Git reads in a base checkout, each resolution and whole-tree diff run once however many documents share it. */
const gitReader = (runner: Runner, environment: NodeJS.ProcessEnv): Git => {
  const git = (checkout: BaseCheckCheckout, arguments_: readonly string[]) =>
    runner('git', ['-C', checkout.path, ...arguments_], { ...environment, GIT_TERMINAL_PROMPT: '0' })
  const revision = async (checkout: BaseCheckCheckout, name: string): Promise<string | undefined> => {
    const result = await git(checkout, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`])
    return result.exitCode === 0 ? result.output.trim() : undefined
  }
  const resolutions = new Map<string, Promise<Resolution>>()
  const diffs = new Map<string, Promise<readonly BaseMovedFile[]>>()
  const resolve = async (checkout: BaseCheckCheckout, commit: string): Promise<Resolution> => {
    const main = await revision(checkout, MAIN)
    if (main === undefined)
      return { reason: `${checkout.key} at ${checkout.path} has no origin/main; fetch it, then check again` }
    const full = await revision(checkout, commit)
    if (full === undefined)
      return {
        reason: `base ${commit} is not in ${checkout.key} at ${checkout.path}; fetch it, or correct the Base: line`
      }
    const ancestor = await git(checkout, ['merge-base', '--is-ancestor', full, main])
    if (ancestor.exitCode !== 0)
      return { reason: `base ${commit} is not on ${checkout.key}'s origin/main: unpushed, or on another branch` }
    return { commit: full, main }
  }
  const diff = async (checkout: BaseCheckCheckout, from: string, to: string): Promise<readonly BaseMovedFile[]> => {
    const result = await git(checkout, ['diff', '--name-status', '-z', '--find-renames', from, to])
    const fields = result.output.split('\0')
    const files: BaseMovedFile[] = []
    for (let index = 0; index < fields.length - 1; ) {
      const status = fields[index] as string
      const path = fields[index + 1] as string
      if (status.startsWith('R')) {
        files.push({ path, change: 'renamed', to: fields[index + 2] as string })
        index += 3
      } else {
        files.push({ path, change: status === 'D' ? 'deleted' : status === 'A' ? 'added' : 'modified' })
        index += 2
      }
    }
    return files
  }
  const once = <T>(cache: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> => {
    const cached = cache.get(key) ?? read()
    cache.set(key, cached)
    return cached
  }
  return {
    resolve: (checkout, commit) => once(resolutions, `${checkout.path}\0${commit}`, () => resolve(checkout, commit)),
    diff: (checkout, from, to) => once(diffs, `${checkout.path}\0${from}\0${to}`, () => diff(checkout, from, to))
  }
}

/** Whether a changed path is a touched path or lies under a touched directory. */
const touches = (paths: readonly string[], changed: string): boolean =>
  paths.some((path) => changed === path || changed.startsWith(`${path}/`))

const unknown = (document: Omit<BaseCheckDocument, 'verdict' | 'files' | 'reason'>, reason: string) => ({
  ...document,
  verdict: 'unknown' as const,
  files: [],
  reason
})

const checkDocument = async (
  repository: BaseCheckRepository,
  path: string,
  header: Header,
  request: BaseCheckRequest,
  git: Git
): Promise<BaseCheckDocument> => {
  const baseMatch = header.base === undefined ? null : BASE.exec(header.base)
  const base = baseMatch ? { repository: baseMatch[1] as string, commit: baseMatch[2] as string } : null
  const entries = header.touches === undefined ? [] : touchedEntries(header.touches)
  const document = { repository: repository.key, path, base, touches: entries, status: header.status ?? null }
  if (header.base === undefined) return unknown(document, 'no Base: line')
  if (base === null) return unknown(document, `Base: ${header.base} is not <repository>@<commit>`)
  if (header.touches === undefined) return unknown(document, 'no Touches: line')
  const checkout = request.checkouts.find((candidate) => candidate.key === base.repository)
  if (checkout === undefined) return unknown(document, `${base.repository} is not in the local registry`)
  const owners = new Set(request.checkouts.map((candidate) => candidate.repository.split('/')[3] as string))
  const touched = touchedPaths(entries, checkout.repository, owners)
  if (touched.elsewhere.length)
    return unknown(document, `touches files outside ${base.repository}: ${touched.elsewhere.join(', ')}`)
  if (!touched.paths.length) return unknown(document, 'Touches: names no files')
  const resolution = await git.resolve(checkout, base.commit)
  if ('reason' in resolution) return unknown(document, resolution.reason)
  const files = (await git.diff(checkout, resolution.commit, resolution.main)).filter(
    (file) => touches(touched.paths, file.path) || (file.to !== undefined && touches(touched.paths, file.to))
  )
  return { ...document, verdict: files.length ? 'moved' : 'current', files, reason: null }
}

/**
 * Read every change document under each repository's `+/_WORK/`, skip the graduated, and check each against its
 * base: moved, with the touched files changed on the base repository's `origin/main` since the base commit; current;
 * or unknown, with the reason, never a pass, where the base cannot be resolved. Nothing is fetched or changed.
 */
export const checkChangeDocumentBases = async (request: BaseCheckRequest): Promise<BaseCheckReport> => {
  const git = gitReader(request.runner, request.environment)
  const documents: BaseCheckDocument[] = []
  const graduated: { repository: string; path: string }[] = []
  for (const repository of request.repositories)
    for (const path of await changeDocuments(repository.path)) {
      const header = readHeader(await readFile(join(repository.path, path), 'utf8'))
      if (path.endsWith(DESIGN_SUFFIX) && header.base === undefined) continue
      if (header.status !== undefined && GRADUATED.test(header.status))
        graduated.push({ repository: repository.key, path })
      else documents.push(await checkDocument(repository, path, header, request, git))
    }
  return { schema: 'ki/work-base/v1', documents, graduated }
}
