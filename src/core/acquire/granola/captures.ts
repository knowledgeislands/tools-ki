import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
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

/** Find every capture of the requested identities, wherever Acquire has filed it under the capture directory. */
export const granolaCaptureIndex = async (
  layout: { readonly documents: string; readonly captures: string },
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
      }
    }
  }
  await verifyGranolaParents(join(layout.captures, 'meeting.md'))
  if (await lstat(layout.captures).catch(() => undefined)) await walk(layout.captures)
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
