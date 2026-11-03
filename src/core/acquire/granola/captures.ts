import { lstat, open, readdir, readFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { KiError } from '../../errors.ts'
import { verifyGranolaParents } from './layout.ts'

/** The committed capture is the only acquisition record; its front matter carries the source evidence. */
export interface GranolaCapture {
  readonly path: string
  readonly content: string
  readonly accountSha256?: string
  readonly detailSha256?: string
  readonly transcriptState?: string
  readonly transcriptSha256?: string
  readonly inferredUnfoldered: boolean
  readonly folderIds: readonly string[]
}

/** Package and file names end `--<source id>` after the date and title slug, which never contain `--`. */
const sourceIdentity = (name: string): string | undefined => {
  const parts = name.split('--')
  return parts.length < 3 ? undefined : parts.slice(2).join('--')
}

const physicalFile = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isFile() && !state.isSymbolicLink())
}

/**
 * A Granola capture may also be a pasted capture the import was folded into, such as `granola-meeting.md`, or any
 * Markdown file whose front matter names Granola as its source; its `source_id` identifies the meeting.
 */
const frontMatterIdentity = async (path: string): Promise<string | undefined> => {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const head = buffer.subarray(0, bytesRead).toString('utf8')
    const end = head.indexOf('\n---\n')
    if (!head.startsWith('---\n') || end === -1) return undefined
    const frontMatter = head.slice(4, end + 1)
    if (!/^source: "?granola"?$/m.test(frontMatter)) return undefined
    return /^source_id: "([^"\\]+)"$/m.exec(frontMatter)?.[1]
  } finally {
    await handle.close()
  }
}

/** Find every capture of the requested identities, wherever it is filed under the capture or held directory. */
export const granolaCaptureIndex = async (
  layout: { readonly documents: string; readonly captures: string; readonly held?: string },
  ids: readonly string[]
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const wanted = new Set(ids)
  const found = new Map<string, string[]>()
  const add = (id: string, path: string): void => {
    found.set(id, [...(found.get(id) ?? []), relative(layout.documents, path)])
  }
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        const id = sourceIdentity(entry.name)
        if (id && wanted.has(id) && (await physicalFile(join(path, 'meeting.md')))) add(id, join(path, 'meeting.md'))
        await walk(path)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const id = sourceIdentity(entry.name.slice(0, -3))
        if (id && wanted.has(id)) add(id, path)
        else if (entry.name !== 'meeting.md' || !sourceIdentity(basename(directory))) {
          const declared = await frontMatterIdentity(path)
          if (declared && wanted.has(declared)) add(declared, path)
        }
      }
    }
  }
  for (const directory of layout.held ? [layout.captures, layout.held] : [layout.captures]) {
    await verifyGranolaParents(join(directory, 'meeting.md'))
    if (await lstat(directory).catch(() => undefined)) await walk(directory)
  }
  return found
}

const frontmatterValue = (frontmatter: string, name: string, path: string): string | undefined => {
  const match = new RegExp(`^${name}: (.+)$`, 'm').exec(frontmatter)
  if (!match) return undefined
  try {
    const value = JSON.parse(match[1] as string) as unknown
    if (typeof value !== 'string') throw new Error(name)
    return value
  } catch {
    throw new KiError(`Granola capture ${path} has malformed ${name}`)
  }
}

export const readGranolaCapture = async (documents: string, path: string, id: string): Promise<GranolaCapture> => {
  const content = await readFile(join(documents, path), 'utf8')
  const end = content.indexOf('\n---\n')
  const frontmatter = content.startsWith('---\n') && end !== -1 ? content.slice(4, end + 1) : ''
  if (frontmatterValue(frontmatter, 'source_id', path) !== id)
    throw new KiError(`Granola capture ${path} does not carry source identity ${id}`)
  const accountSha256 = frontmatterValue(frontmatter, 'source_account_sha256', path)
  const detailSha256 = frontmatterValue(frontmatter, 'detail_sha256', path)
  const transcriptState = frontmatterValue(frontmatter, 'transcript_state', path)
  const transcriptSha256 = frontmatterValue(frontmatter, 'transcript_sha256', path)
  return {
    path,
    content,
    ...(accountSha256 ? { accountSha256 } : {}),
    ...(detailSha256 ? { detailSha256 } : {}),
    ...(transcriptState ? { transcriptState } : {}),
    ...(transcriptSha256 ? { transcriptSha256 } : {}),
    inferredUnfoldered: /^inferred_unfoldered: true$/m.test(frontmatter),
    folderIds: [...frontmatter.matchAll(/^ {2}- id: (".*")$/gm)]
      .map((match) => JSON.parse(match[1] as string) as string)
      .sort((left, right) => left.localeCompare(right, 'en'))
  }
}
