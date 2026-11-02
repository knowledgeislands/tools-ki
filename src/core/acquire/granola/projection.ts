import { KiError } from '../../errors.ts'

export const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : undefined

export const stringField = (value: unknown, names: readonly string[]): string | undefined => {
  const item = record(value)
  if (!item) return undefined
  for (const name of names) {
    const candidate = item[name]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

export const decodeXml = (value: string): string =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

export const attribute = (value: unknown, name: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const match = new RegExp(`\\b${name}=(['"])(.*?)\\1`, 's').exec(value)
  return match?.[2] ? decodeXml(match[2]).trim() : undefined
}

export interface GranolaAttachmentInventory {
  readonly ids: readonly string[]
  readonly expected: number
  /** Set when the listed screenshot count and the detail's attachment identities cannot be reconciled. */
  readonly difference?: string
}

export interface GranolaAttachmentImage {
  readonly id: string
  readonly bytes: Buffer
  readonly mimeType: string
  readonly metadata: Readonly<Record<string, unknown>>
}

/** MCP text can carry a data-only notice before its JSON projection. */
export const providerRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== 'string') return record(value)
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  try {
    return record(JSON.parse(value.slice(start, end + 1)))
  } catch {
    return undefined
  }
}

const providerData = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  const outer = providerRecord(value)
  return outer?.['data'] === undefined ? outer : providerRecord(outer['data'])
}

export const readGranolaFolders = async (
  read: (arguments_: Readonly<Record<string, unknown>>) => Promise<unknown>
): Promise<readonly { readonly id: string; readonly projection: unknown }[]> => {
  const folders: { id: string; projection: unknown }[] = []
  const seen = new Set<string>()
  let offset = 0
  while (true) {
    const response = await read(offset ? { offset } : {})
    const page = providerData(response)
    const values = Array.isArray(response) ? response : page?.['folders']
    if (!Array.isArray(values)) throw new KiError('Granola folders response contains no folders array')
    for (const projection of values) {
      const id = stringField(projection, ['id', 'folder_id'])
      if (!id) throw new KiError('Granola folder has no stable identity')
      if (seen.has(id)) throw new KiError('Granola folders have a repeated identity')
      seen.add(id)
      folders.push({ id, projection })
    }
    if (page?.['truncated'] !== true) return folders
    const next = page['next_offset']
    if (!Number.isSafeInteger(next) || Number(next) <= offset || !values.length)
      throw new KiError('Granola folder pagination did not advance')
    offset = Number(next)
  }
}

export const completeGranolaTranscript = async (
  initial: unknown,
  read: (offset: number) => Promise<unknown>
): Promise<unknown> => {
  let page = providerData(initial)
  if (page?.['truncated'] !== true) return initial
  const pages: unknown[] = [initial]
  const texts: string[] = []
  const total = page['total_chars']
  let offset = Number(page['offset'] ?? 0)
  while (true) {
    const text = stringField(page, ['transcript', 'text', 'content'])
    if (!text) throw new KiError('Granola transcript page has no transcript content')
    texts.push(text)
    if (page?.['truncated'] !== true) break
    const next = page['next_offset']
    if (!Number.isSafeInteger(next) || Number(next) <= offset)
      throw new KiError('Granola transcript pagination did not advance')
    offset = Number(next)
    const projection = await read(offset)
    pages.push(projection)
    page = providerData(projection)
    if (!page || page['offset'] !== offset || page['total_chars'] !== total)
      throw new KiError('Granola transcript pagination changed its source or range')
  }
  return { transcript: texts.join('\n'), source_pages: pages, total_chars: total, truncated: false }
}

export const granolaScreenshotCount = (projection: unknown): number => {
  const value = record(projection)?.['screenshot_count'] ?? attribute(projection, 'screenshot_count')
  if (value === undefined) return 0
  const count = typeof value === 'number' ? value : /^\d+$/.test(String(value)) ? Number(value) : NaN
  if (!Number.isSafeInteger(count) || count < 0) throw new KiError('Granola screenshot count is invalid')
  return count
}

const attachmentId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

const screenshotTypes = new Set(['screenshot', 'image'])

/**
 * The listing gives only a screenshot count, so the detail's attachments are reconciled to it: an attachment typed as
 * something other than a screenshot is not one, and a repeated identity is one attachment. Anything left over is a
 * difference to report, never a reason to guess which attachments the count meant.
 */
export const granolaAttachmentInventory = (detail: unknown, listing: unknown): GranolaAttachmentInventory => {
  const expected = granolaScreenshotCount(listing)
  let entries: { id: string; type?: string }[]
  if (typeof detail === 'string') {
    entries = [...detail.matchAll(/<attachment\b([^>]*)>/g)].map((match) => {
      const type = attribute(match[0], 'type')
      return { id: attribute(match[0], 'id') ?? '', ...(type ? { type } : {}) }
    })
  } else {
    const attachments = providerData(detail)?.['attachments'] ?? []
    if (!Array.isArray(attachments)) throw new KiError('Granola attachment inventory is malformed')
    entries = attachments.map((value) => {
      const type = stringField(value, ['type', 'kind'])
      return { id: stringField(value, ['id', 'attachment_id']) ?? '', ...(type ? { type } : {}) }
    })
  }
  const invalid = entries.filter((entry) => !attachmentId.test(entry.id)).map((entry) => JSON.stringify(entry.id))
  const others = entries
    .filter((entry) => attachmentId.test(entry.id) && entry.type && !screenshotTypes.has(entry.type.toLowerCase()))
    .map((entry) => `${entry.id} (${entry.type})`)
  const screenshots = entries
    .filter((entry) => attachmentId.test(entry.id) && (!entry.type || screenshotTypes.has(entry.type.toLowerCase())))
    .map((entry) => entry.id)
  const ids = [...new Set(screenshots)]
  if (!invalid.length && ids.length === expected) return { ids, expected }
  const repeated = ids.filter((id) => screenshots.indexOf(id) !== screenshots.lastIndexOf(id))
  const difference = [
    `Granola lists ${expected} screenshots but the detail names ${ids.length} screenshot attachments`,
    ...(repeated.length ? [`repeated: ${repeated.join(', ')}`] : []),
    ...(invalid.length ? [`invalid identities: ${invalid.join(', ')}`] : []),
    ...(others.length ? [`not screenshots: ${others.join(', ')}`] : [])
  ].join('; ')
  return { ids, expected, difference }
}

export const decodeGranolaImages = (
  response: unknown,
  meetingId: string,
  ids: readonly string[]
): readonly GranolaAttachmentImage[] => {
  let envelope = record(response)
  if (envelope?.['result'] !== undefined) envelope = record(envelope['result'])
  if (!envelope || envelope['isError'] || !Array.isArray(envelope['content']))
    throw new KiError('Granola attachment response is malformed or failed')
  const blocks = envelope['content'].map(record)
  const images: GranolaAttachmentImage[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const image = blocks[index]
    if (image?.['type'] !== 'image') continue
    const metadata = providerRecord(blocks[index + 1]?.['text'])
    const id = ids[images.length]
    if (!id || metadata?.['attachment_id'] !== id || metadata['meeting_id'] !== meetingId)
      throw new KiError('Granola image metadata does not match the requested identities')
    const data = image['data']
    const mimeType = image['mimeType']
    if (
      typeof data !== 'string' ||
      !data.length ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
      data.length % 4 !== 0 ||
      typeof mimeType !== 'string' ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)
    )
      throw new KiError('Granola image encoding or MIME type is invalid')
    const bytes = Buffer.from(data, 'base64')
    if (bytes.toString('base64') !== data) throw new KiError('Granola image encoding is not canonical base64')
    images.push({ id, bytes, mimeType, metadata })
  }
  if (images.length !== ids.length) throw new KiError('Granola returned an incomplete image batch')
  return images
}
