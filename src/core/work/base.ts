import { readFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { Runner } from '../runtime/runner.ts'
import { frontMatter } from './store.ts'

/**
 * A change document names what it was written against in its front matter's `ki-inputs`, under `ki-authoring`'s change
 * format: a whole repository, `<organisation>/<repository>@<version ref>`; a file or folder within one,
 * `<organisation>/<repository>:<path>@<version ref>`; or a file in the store, such as another change document,
 * `<file>@<version ref>`, the ref its `ki-revised` when read or a store commit. An input that has moved on past its ref
 * is reported so that each Before is checked against the new version; it does not block. A change that is `done` or
 * `replaced` is not checked.
 */
export const WORK_BASE_SCHEMA = 'ki/work-base/v2' as const

const MAIN = 'refs/remotes/origin/main'
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['done', 'replaced'])
/** `<organisation>/<repository>`, then an optional `:<path>`. */
const REPOSITORY_INPUT = /^([A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+)(?::(.+))?$/
const URL_INPUT = /^[a-z][a-z0-9+.-]*:\/\//i
/** A date, or a time, as a version ref outside Git: compared with the input's `ki-revised`. */
const DATE_REF = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+Z)?$/
const COMMIT_REF = /^[0-9a-f]{4,40}$/i

/** A registered checkout an input may name, by its GitHub identity. */
export interface BaseCheckout {
  readonly key: string
  readonly path: string
  readonly repository: string
}

/** A change document to check, by its package and its path within the store. */
export interface BaseDocumentSource {
  readonly package: string
  readonly path: string
}

/** An input's verdict: moved on, current, unknown with a reason, or unchecked because it lies outside Git and the store. */
export type BaseVerdict = 'moved' | 'current' | 'unknown' | 'unchecked'

export type BaseFileChange = 'modified' | 'added' | 'deleted' | 'renamed'

/** A file that has moved since the ref: how, and for a rename its new path. */
export interface BaseMovedFile {
  readonly path: string
  readonly change: BaseFileChange
  readonly to?: string
}

export interface BaseInput {
  /** The input as written. */
  readonly input: string
  readonly verdict: BaseVerdict
  /** The files moved since the ref, within the input's path, or in the whole repository for a repository input. */
  readonly files: readonly BaseMovedFile[]
  /** Why the verdict is unknown or unchecked, or when a store document was revised; null otherwise. */
  readonly reason: string | null
}

export interface BaseCheckDocument {
  readonly package: string
  readonly path: string
  readonly status: string | null
  /** Moved when any input moved; else unknown when any input is, or none could be checked; else current. */
  readonly verdict: Exclude<BaseVerdict, 'unchecked'>
  readonly inputs: readonly BaseInput[]
  /** Why the document as a whole is unknown, as when it names no inputs; null otherwise. */
  readonly reason: string | null
}

export interface BaseCheckReport {
  readonly schema: typeof WORK_BASE_SCHEMA
  readonly store: string
  readonly documents: readonly BaseCheckDocument[]
  /** Documents whose `ki-status` is done or replaced, which are not checked. */
  readonly closed: readonly { readonly package: string; readonly path: string; readonly status: string }[]
}

export interface BaseCheckRequest {
  readonly store: string
  readonly documents: readonly BaseDocumentSource[]
  /** The registered checkouts a repository input may name. */
  readonly checkouts: readonly BaseCheckout[]
  readonly runner: Runner
  readonly environment: NodeJS.ProcessEnv
}

/** A Git checkout a ref is resolved in: a registered repository, or the store itself. */
interface Checkout {
  readonly name: string
  readonly path: string
}

type Resolution = { readonly commit: string; readonly main: string } | { readonly reason: string }

interface Git {
  readonly resolve: (checkout: Checkout, ref: string) => Promise<Resolution>
  readonly diff: (checkout: Checkout, from: string, to: string) => Promise<readonly BaseMovedFile[]>
}

/** Git reads in a checkout, each resolution and whole-tree diff run once however many inputs share it. */
const gitReader = (runner: Runner, environment: NodeJS.ProcessEnv): Git => {
  const git = (checkout: Checkout, arguments_: readonly string[]) =>
    runner('git', ['-C', checkout.path, ...arguments_], { ...environment, GIT_TERMINAL_PROMPT: '0' })
  const revision = async (checkout: Checkout, name: string): Promise<string | undefined> => {
    const result = await git(checkout, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`])
    return result.exitCode === 0 ? result.output.trim() : undefined
  }
  const resolutions = new Map<string, Promise<Resolution>>()
  const diffs = new Map<string, Promise<readonly BaseMovedFile[]>>()
  const resolve = async (checkout: Checkout, ref: string): Promise<Resolution> => {
    const main = await revision(checkout, MAIN)
    if (main === undefined)
      return { reason: `${checkout.name} at ${checkout.path} has no origin/main; fetch it, then check again` }
    const full = await revision(checkout, ref)
    if (full === undefined)
      return { reason: `${ref} is not in ${checkout.name} at ${checkout.path}; fetch it, or correct the input` }
    const ancestor = await git(checkout, ['merge-base', '--is-ancestor', full, main])
    if (ancestor.exitCode !== 0)
      return { reason: `${ref} is not on ${checkout.name}'s origin/main: unpushed, or on another branch` }
    return { commit: full, main }
  }
  const diff = async (checkout: Checkout, from: string, to: string): Promise<readonly BaseMovedFile[]> => {
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
    resolve: (checkout, ref) => once(resolutions, `${checkout.path}\0${ref}`, () => resolve(checkout, ref)),
    diff: (checkout, from, to) => once(diffs, `${checkout.path}\0${from}\0${to}`, () => diff(checkout, from, to))
  }
}

/** A path pattern as a test of a changed path: the path itself or anything under it, `*` and `**` as wildcards. */
const pathTest = (pattern: string): ((changed: string) => boolean) => {
  const path = pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '')
  if (!/[*?]/.test(path)) return (changed) => changed === path || changed.startsWith(`${path}/`)
  const expression = path
    .split(/(\*\*\/?|\*|\?)/)
    .map((part) =>
      part.startsWith('**')
        ? '.*'
        : part === '*'
          ? '[^/]*'
          : part === '?'
            ? '[^/]'
            : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    )
    .join('')
  const matcher = new RegExp(`^${expression}(?:/.*)?$`)
  return (changed) => matcher.test(changed)
}

const input = (written: string, verdict: BaseVerdict, reason: string | null, files: readonly BaseMovedFile[] = []) => ({
  input: written,
  verdict,
  files,
  reason
})

/** A Git input: the ref resolved on the checkout's origin/main, and the files moved since, within the path if any. */
const gitInput = async (
  written: string,
  checkout: Checkout,
  path: string | undefined,
  ref: string,
  git: Git
): Promise<BaseInput> => {
  const resolution = await git.resolve(checkout, ref)
  if ('reason' in resolution) return input(written, 'unknown', resolution.reason)
  const moved = await git.diff(checkout, resolution.commit, resolution.main)
  const within = path === undefined ? undefined : pathTest(path)
  const files =
    within === undefined
      ? moved
      : moved.filter((file) => within(file.path) || (file.to !== undefined && within(file.to)))
  return input(written, files.length ? 'moved' : 'current', null, files)
}

/** The end of the day or the moment a date ref names, so that a document revised later that day reads as current. */
const refTime = (ref: string): number =>
  ref.includes('T') ? Date.parse(ref) : Date.parse(`${ref}T00:00:00Z`) + 24 * 60 * 60 * 1000 - 1

/** A store input: a file found beside the document, else from the store's root, never outside the store. */
const storeInput = async (
  written: string,
  file: string,
  ref: string,
  document: BaseDocumentSource,
  request: BaseCheckRequest,
  git: Git
): Promise<BaseInput> => {
  const candidates = [posix.normalize(posix.join(posix.dirname(document.path), file)), posix.normalize(file)]
  let found: { readonly path: string; readonly text: string } | undefined
  for (const path of candidates) {
    if (path.startsWith('../')) continue
    const text = await readFile(join(request.store, path), 'utf8').catch(() => undefined)
    if (text !== undefined) {
      found = { path, text }
      break
    }
  }
  if (found === undefined) return input(written, 'unknown', `${file} is not in the store`)
  if (COMMIT_REF.test(ref))
    return gitInput(written, { name: 'the Cairn store', path: request.store }, found.path, ref, git)
  if (!DATE_REF.test(ref)) return input(written, 'unknown', `version ref ${ref} is neither a commit nor a date`)
  const revised = frontMatter(found.text)?.['ki-revised']
  if (typeof revised !== 'string' || Number.isNaN(Date.parse(revised)))
    return input(written, 'unknown', `${found.path} has no ki-revised to compare with ${ref}`)
  return Date.parse(revised) > refTime(ref)
    ? input(written, 'moved', `${found.path} revised ${revised}`)
    : input(written, 'current', null)
}

/** One input's verdict, from its form. */
const checkInput = async (
  written: unknown,
  document: BaseDocumentSource,
  request: BaseCheckRequest,
  git: Git
): Promise<BaseInput> => {
  if (typeof written !== 'string' || !written.trim())
    return input(String(written), 'unknown', 'an input must be a non-empty string')
  if (URL_INPUT.test(written)) return input(written, 'unchecked', 'a URL, outside Git and the store')
  const at = written.lastIndexOf('@')
  if (at < 0) return input(written, 'unknown', 'no version ref')
  const head = written.slice(0, at).trim()
  const ref = written
    .slice(at + 1)
    .trim()
    .split(/\s/)[0] as string
  const repository = REPOSITORY_INPUT.exec(head)
  if (repository === null) return storeInput(written, head, ref, document, request, git)
  const identity = `https://github.com/${(repository[1] as string).toLowerCase()}`
  const checkout = request.checkouts.find((candidate) => candidate.repository.toLowerCase() === identity)
  if (checkout === undefined) return input(written, 'unknown', `${repository[1]} is not in the local registry`)
  if (DATE_REF.test(ref))
    return input(written, 'unknown', `version ref ${ref} is a date; a repository input needs a commit or tag`)
  return gitInput(written, { name: checkout.key, path: checkout.path }, repository[2], ref, git)
}

const documentVerdict = (
  inputs: readonly BaseInput[]
): { readonly verdict: BaseCheckDocument['verdict']; readonly reason: string | null } => {
  if (!inputs.length) return { verdict: 'unknown', reason: 'no ki-inputs' }
  if (inputs.some((each) => each.verdict === 'moved')) return { verdict: 'moved', reason: null }
  if (inputs.some((each) => each.verdict === 'unknown')) return { verdict: 'unknown', reason: null }
  if (inputs.every((each) => each.verdict === 'unchecked'))
    return { verdict: 'unknown', reason: 'no input can be checked in Git or the store' }
  return { verdict: 'current', reason: null }
}

/**
 * Reads each change document's `ki-status` and `ki-inputs`, skips the closed, and checks each input against its version
 * ref: moved, current, unknown with the reason, never a pass, or unchecked where it lies outside Git and the store.
 * Nothing is fetched or changed.
 */
export const checkChangeDocumentInputs = async (request: BaseCheckRequest): Promise<BaseCheckReport> => {
  const git = gitReader(request.runner, request.environment)
  const documents: BaseCheckDocument[] = []
  const closed: { package: string; path: string; status: string }[] = []
  for (const source of request.documents) {
    const fields = frontMatter(await readFile(join(request.store, source.path), 'utf8')) ?? {}
    const status = typeof fields['ki-status'] === 'string' ? fields['ki-status'] : null
    if (status !== null && CLOSED_STATUSES.has(status)) {
      closed.push({ ...source, status })
      continue
    }
    const written: readonly unknown[] = Array.isArray(fields['ki-inputs']) ? fields['ki-inputs'] : []
    const inputs: BaseInput[] = []
    for (const each of written) inputs.push(await checkInput(each, source, request, git))
    documents.push({ ...source, status, ...documentVerdict(inputs), inputs })
  }
  return { schema: WORK_BASE_SCHEMA, store: request.store, documents, closed }
}
