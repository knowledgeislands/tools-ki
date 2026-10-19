import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import { type Decisions, type FilePlan, type Item, planFile } from './convert.ts'
import { type Heading, headingsOf } from './scan.ts'
import { indexedEntry, indexVault, type Vault } from './vault.ts'

export interface GfmRequest {
  readonly workingDirectory: string
  readonly paths: readonly string[]
  readonly root?: string
  readonly decisions?: string
}

export interface GfmPlan {
  readonly root: string
  /** SHA-256 of the decisions file, or `null` when the batch has none. */
  readonly decisions: string | null
  readonly files: readonly FilePlan[]
}

const PREVIEW_SCHEMA = 'ki/markdown-gfm-preview/v1'
const MANIFEST_SCHEMA = 'ki/markdown-gfm-manifest/v1'

const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')

const exists = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false
  )

/** The nearest enclosing directory holding `.obsidian` or `.git`: the vault whose links resolve. */
const vaultRoot = async (start: string): Promise<string> => {
  for (let directory = start; ; directory = dirname(directory)) {
    if ((await exists(join(directory, '.obsidian'))) || (await exists(join(directory, '.git')))) return directory
    if (dirname(directory) === directory)
      throw new KiError(`no vault root holding .obsidian or .git encloses ${start}`, 1, 'pass --root <dir>')
  }
}

const markdownFiles = async (root: string, directory: string): Promise<string[]> => {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!indexedEntry(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await markdownFiles(root, path)))
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(path)
  }
  return files
}

const toPosix = (path: string): string => path.split(sep).join('/')

/** Root-relative Markdown paths named by the arguments; a directory contributes its Markdown files. */
const batchPaths = async (root: string, workingDirectory: string, paths: readonly string[]): Promise<string[]> => {
  const selected = new Set<string>()
  for (const argument of paths) {
    const absolute = await realpath(resolve(workingDirectory, argument)).catch(() => {
      throw new KiError(`path not found: ${argument}`, 1)
    })
    const inside = relative(root, absolute)
    if (inside.split(sep)[0] === '..')
      throw new KiError(`path ${argument} is outside the vault root ${root}`, 1, 'pass --root <dir> to widen it')
    const stats = await lstat(absolute)
    if (stats.isDirectory()) for (const file of await markdownFiles(root, absolute)) selected.add(relative(root, file))
    else if (/\.md$/i.test(absolute)) selected.add(inside)
    else throw new KiError(`path ${argument} is not a Markdown file or directory`, 1)
  }
  return [...selected].map(toPosix).sort()
}

const decisionKeys = new Set(['heading_fragments', 'protected', 'item'])
const itemKeys = new Set(['path', 'text', 'action', 'target'])

/** Reads the owner's per-batch decisions; any shape it does not define is refused rather than ignored. */
const readDecisions = async (path: string, vault: Vault): Promise<{ hash: string; decisions: Decisions }> => {
  const content = await readFile(path, 'utf8').catch(() => {
    throw new KiError(`decisions file not found: ${path}`, 1)
  })
  const invalid = (reason: string): KiError => new KiError(`invalid decisions file ${path}: ${reason}`, 1)
  let table: Record<string, unknown>
  try {
    table = parse(content) as Record<string, unknown>
  } catch (error) {
    throw invalid((error as Error).message.split('\n')[0] as string)
  }
  const unknown = Object.keys(table).find((key) => !decisionKeys.has(key))
  if (unknown) throw invalid(`unknown key ${unknown}`)
  const fragments = table['heading_fragments']
  if (fragments !== undefined && fragments !== 'github') throw invalid('heading_fragments must be "github"')
  const protectedPaths = table['protected'] ?? []
  if (!Array.isArray(protectedPaths) || protectedPaths.some((entry) => typeof entry !== 'string'))
    throw invalid('protected must be an array of root-relative paths')
  const entries = table['item'] ?? []
  if (!Array.isArray(entries)) throw invalid('item must be an array of tables')
  const decided = new Map<string, { action: 'keep' | 'convert'; target?: string }>()
  for (const [index, entry] of (entries as Record<string, unknown>[]).entries()) {
    const where = `item ${index + 1}`
    const key = Object.keys(entry).find((name) => !itemKeys.has(name))
    if (key) throw invalid(`${where} has unknown key ${key}`)
    const { path: file, text, action, target } = entry
    if (typeof file !== 'string' || typeof text !== 'string') throw invalid(`${where} needs a path and a text`)
    if (action === 'keep' && target === undefined) decided.set(`${file}\n${text}`, { action })
    else if (action === 'convert' && typeof target === 'string' && vault.files.has(target))
      decided.set(`${file}\n${text}`, { action, target })
    else
      throw invalid(
        `${where} needs action "keep", or action "convert" with a target that exists in exact case under the root`
      )
  }
  return {
    hash: sha256(content),
    decisions: {
      headingFragments: fragments === 'github',
      protectedPaths: (protectedPaths as string[]).map((entry) => posix.normalize(entry).replace(/\/$/, '')),
      find: (file, text) => decided.get(`${file}\n${text}`)
    }
  }
}

const noDecisions: Decisions = { headingFragments: false, protectedPaths: [], find: () => undefined }

const givenRoot = async (request: GfmRequest): Promise<string> => {
  const root = await realpath(resolve(request.workingDirectory, request.root as string)).catch(() => '')
  if (!root || !(await lstat(root)).isDirectory())
    throw new KiError(`vault root is not a directory: ${request.root}`, 1)
  return root
}

/** Plans the conversion of every named file without writing anything. */
export const planGfm = async (request: GfmRequest): Promise<GfmPlan> => {
  const root = request.root === undefined ? await vaultRoot(request.workingDirectory) : await givenRoot(request)
  const paths = await batchPaths(root, request.workingDirectory, request.paths)
  const vault = await indexVault(root)
  const loaded =
    request.decisions === undefined
      ? undefined
      : await readDecisions(resolve(request.workingDirectory, request.decisions), vault)
  const decisions = loaded?.decisions ?? noDecisions
  const cache = new Map<string, Promise<readonly Heading[] | undefined>>()
  const headings = (path: string): Promise<readonly Heading[] | undefined> => {
    if (!cache.has(path))
      cache.set(
        path,
        /\.md$/i.test(path) ? readFile(join(root, path), 'utf8').then(headingsOf) : Promise.resolve(undefined)
      )
    return cache.get(path) as Promise<readonly Heading[] | undefined>
  }
  const files: FilePlan[] = []
  for (const path of paths)
    files.push(await planFile({ vault, decisions, headings }, path, await readFile(join(root, path))))
  return { root, decisions: loaded?.hash ?? null, files }
}

export const undecided = (plan: GfmPlan): { readonly path: string; readonly item: Item }[] =>
  plan.files.flatMap((file) => file.items.filter((item) => !item.decision).map((item) => ({ path: file.path, item })))

interface PreviewFile {
  readonly path: string
  readonly input: string
  readonly output: string
  readonly conversions: readonly { readonly line: number; readonly before: string; readonly after: string }[]
}

interface Preview {
  readonly schema: string
  readonly root: string
  readonly decisions: string | null
  readonly files: readonly PreviewFile[]
}

const previewOf = (plan: GfmPlan): Preview => ({
  schema: PREVIEW_SCHEMA,
  root: plan.root,
  decisions: plan.decisions,
  files: plan.files.map((file) => ({
    path: file.path,
    input: sha256(file.input),
    output: sha256(file.output),
    conversions: file.conversions.map(({ line, before, after }) => ({ line, before, after }))
  }))
})

/** Writes the reviewed preview a later apply must match. */
export const writePreview = async (plan: GfmPlan, path: string): Promise<void> => {
  await writeFile(path, `${JSON.stringify(previewOf(plan), null, 2)}\n`)
}

const readPreview = async (path: string): Promise<Preview> => {
  const content = await readFile(path, 'utf8').catch(() => {
    throw new KiError(`preview not found: ${path}`, 1, 'run the same command with --dry-run --preview <file> first')
  })
  const preview = (() => {
    try {
      return JSON.parse(content) as Preview | null
    } catch {
      return null
    }
  })()
  if (preview?.schema !== PREVIEW_SCHEMA) throw new KiError(`not a ${PREVIEW_SCHEMA} preview: ${path}`, 1)
  return preview
}

/** Why the batch differs from its reviewed preview, file by file; empty when it matches exactly. */
const departures = (plan: GfmPlan, preview: Preview): string[] => {
  const current = previewOf(plan)
  if (current.root !== preview.root) return [`the root is ${current.root}, not the previewed ${preview.root}`]
  if (current.decisions !== preview.decisions) return ['the decisions file differs from the previewed one']
  const previewed = new Map(preview.files.map((file) => [file.path, file]))
  const paths = new Set([...previewed.keys(), ...current.files.map((file) => file.path)])
  const reasons: string[] = []
  for (const path of [...paths].sort()) {
    const now = current.files.find((file) => file.path === path)
    const then = previewed.get(path)
    if (!now || !then) reasons.push(`${path}: ${now ? 'not in the preview' : 'previewed but not named now'}`)
    else if (now.input !== then.input) reasons.push(`${path}: changed since the preview`)
    else if (now.output !== then.output) reasons.push(`${path}: its conversion differs from the preview`)
  }
  return reasons
}

export interface GfmApplied {
  readonly changed: readonly FilePlan[]
}

/**
 * Applies a batch only when it matches the reviewed preview byte for byte and every item is decided,
 * writing the rollback manifest before the first file; otherwise nothing is written.
 */
export const applyGfm = async (plan: GfmPlan, previewPath: string, manifestPath: string): Promise<GfmApplied> => {
  const reasons = departures(plan, await readPreview(previewPath))
  if (reasons.length)
    throw new KiError(
      `batch aborted, nothing written: ${reasons.join('; ')}`,
      1,
      'dry-run the batch again and review the new preview'
    )
  const pending = undecided(plan)
  if (pending.length)
    throw new KiError(
      `batch refused, nothing written: ${pending.length} undecided item${pending.length === 1 ? '' : 's'}`,
      1,
      'decide each listed item in the decisions file, or narrow the paths, then dry-run again'
    )
  const changed = plan.files.filter((file) => file.output !== file.input)
  const manifest = {
    schema: MANIFEST_SCHEMA,
    root: plan.root,
    files: changed.map((file) => ({
      path: file.path,
      before: sha256(file.input),
      after: sha256(file.output),
      preimage: file.input
    }))
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' }).catch(() => {
    throw new KiError(`cannot create the manifest ${manifestPath}; it must be a new file`, 1)
  })
  for (const file of changed) await writeFile(join(plan.root, file.path), file.output)
  return { changed }
}
