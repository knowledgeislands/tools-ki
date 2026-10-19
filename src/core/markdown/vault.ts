import { readdir } from 'node:fs/promises'
import { join, posix } from 'node:path'

/**
 * The resolver's candidate universe: every regular file under the root, in its on-disk spelling,
 * skipping dot-entries (`.git`, `.obsidian`, `.trash`) and `node_modules`; symbolic links are not followed.
 */
export interface Vault {
  readonly root: string
  readonly files: ReadonlySet<string>
  /** Each indexed path with its case- and normalisation-folded spelling. */
  readonly entries: readonly { readonly path: string; readonly folded: string }[]
}

export type Resolution =
  | { readonly kind: 'resolved'; readonly path: string }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }
  | { readonly kind: 'unresolved' }

const fold = (text: string): string => text.normalize('NFC').toLowerCase()

export const indexedEntry = (name: string): boolean => !name.startsWith('.') && name !== 'node_modules'

export const indexVault = async (root: string): Promise<Vault> => {
  const files: string[] = []
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      if (!indexedEntry(entry.name)) continue
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  await walk('')
  files.sort()
  return { root, files: new Set(files), entries: files.map((path) => ({ path, folded: fold(path) })) }
}

/** A target is tried with `.md` first, as Obsidian adds it, then as written. */
const spellings = (target: string): string[] => (/\.md$/i.test(target) ? [target] : [`${target}.md`, target])

const unique = (paths: readonly string[]): Resolution | undefined => {
  const candidates = [...new Set(paths)].sort()
  if (candidates.length === 1) return { kind: 'resolved', path: candidates[0] as string }
  return candidates.length ? { kind: 'ambiguous', candidates } : undefined
}

const folded = (vault: Vault, matches: (path: string) => boolean): Resolution | undefined =>
  unique(vault.entries.filter((entry) => matches(entry.folded)).map(({ path }) => path))

/** A path step: the exact spelling decides it, then a unique case-insensitive match. */
const pathStep = (vault: Vault, names: readonly string[]): Resolution | undefined => {
  const exact = names.find((name) => vault.files.has(name))
  if (exact) return { kind: 'resolved', path: exact }
  const keys = names.map(fold)
  return folded(vault, (path) => keys.includes(path))
}

/** The leaf step: case-insensitive only, so two notes differing in case or folder stay ambiguous. */
const leafStep = (vault: Vault, names: readonly string[]): Resolution | undefined => {
  const keys = names.map(fold)
  return folded(vault, (path) => keys.some((name) => path === name || path.endsWith(`/${name}`)))
}

const inside = (path: string): boolean => path !== '..' && !path.startsWith('../') && !posix.isAbsolute(path)

/**
 * Resolves a wikilink target in Obsidian's order: beside the note, then the full path from the root,
 * then a unique path suffix or leaf name, case-insensitively. Every match is reported in its on-disk spelling.
 */
export const resolveTarget = (vault: Vault, source: string, target: string): Resolution => {
  const names = spellings(target)
  const beside = names.map((name) => posix.normalize(posix.join(posix.dirname(source), name))).filter(inside)
  const full = names.map((name) => posix.normalize(name)).filter(inside)
  return pathStep(vault, beside) ?? pathStep(vault, full) ?? leafStep(vault, names) ?? { kind: 'unresolved' }
}
