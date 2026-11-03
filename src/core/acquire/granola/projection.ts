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
  /** Granola's own count of the meeting's viewable attachments, screenshots and photos together. */
  readonly expected: number
  /** The type the detail gives an attachment; Granola types photos there and leaves screenshots untyped. */
  readonly types: Readonly<Record<string, string>>
  /** Set when the listed attachment count and the detail's attachment identities cannot be reconciled. */
  readonly difference?: string
}

/** A meeting that cannot be captured whole is withheld with this reason; the rest of the run continues. */
export class GranolaWithheld extends KiError {}

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

export const granolaAttachmentCount = (projection: unknown): number => {
  const value = record(projection)?.['attachment_count'] ?? attribute(projection, 'attachment_count')
  if (value === undefined) return 0
  const count = typeof value === 'number' ? value : /^\d+$/.test(String(value)) ? Number(value) : NaN
  if (!Number.isSafeInteger(count) || count < 0) throw new KiError('Granola attachment count is invalid')
  return count
}

const attachmentId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

const attachmentTypes = new Set(['screenshot', 'photo'])

const omittedCount = (value: unknown): number => {
  const count = Number(value ?? 0)
  return Number.isSafeInteger(count) && count > 0 ? count : 0
}

/**
 * The listing gives only the meeting's attachment count, so the detail's attachments are reconciled to it. A repeated
 * identity is one attachment, and a detail that left attachments out cannot be complete. Anything left over is a
 * difference to report, never a reason to guess which attachments the count meant.
 */
export const granolaAttachmentInventory = (detail: unknown, listing: unknown): GranolaAttachmentInventory => {
  const expected = granolaAttachmentCount(listing)
  let entries: { id: string; type?: string }[]
  let omitted: number
  if (typeof detail === 'string') {
    entries = [...detail.matchAll(/<attachment\b([^>]*)>/g)].map((match) => {
      const type = attribute(match[0], 'type')
      return { id: attribute(match[0], 'id') ?? '', ...(type ? { type: type.toLowerCase() } : {}) }
    })
    omitted = [...detail.matchAll(/<attachments\b[^>]*>/g)].reduce(
      (sum, match) => sum + omittedCount(attribute(match[0], 'attachments_omitted')),
      0
    )
  } else {
    const data = providerData(detail)
    const attachments = data?.['attachments'] ?? []
    if (!Array.isArray(attachments)) throw new KiError('Granola attachment inventory is malformed')
    entries = attachments.map((value) => {
      const type = stringField(value, ['type', 'kind'])
      return { id: stringField(value, ['id', 'attachment_id']) ?? '', ...(type ? { type: type.toLowerCase() } : {}) }
    })
    omitted = omittedCount(data?.['attachments_omitted'])
  }
  const valid = entries.filter((entry) => attachmentId.test(entry.id))
  const invalid = entries.filter((entry) => !attachmentId.test(entry.id)).map((entry) => JSON.stringify(entry.id))
  const ids = [...new Set(valid.map((entry) => entry.id))]
  const types = Object.fromEntries(valid.flatMap((entry) => (entry.type ? [[entry.id, entry.type]] : [])))
  const others = valid.filter((entry) => entry.type && !attachmentTypes.has(entry.type))
  const repeated = ids.filter((id) => valid.filter((entry) => entry.id === id).length > 1)
  if (!invalid.length && !others.length && !repeated.length && !omitted && ids.length === expected)
    return { ids, expected, types }
  const difference = [
    `Granola counts ${expected} attachments but the detail names ${ids.length}`,
    ...(omitted ? [`the detail left ${omitted} out`] : []),
    ...(repeated.length ? [`repeated: ${repeated.join(', ')}`] : []),
    ...(invalid.length ? [`invalid identities: ${invalid.join(', ')}`] : []),
    ...(others.length
      ? [`not screenshots or photos: ${others.map((entry) => `${entry.id} (${entry.type})`).join(', ')}`]
      : [])
  ].join('; ')
  return { ids, expected, types, difference }
}

/**
 * The attachment tool's own total for a meeting, from the pagination record its browse response carries. mcporter's
 * JSON output gives that record alone, or with a notice of left-out attachments as a list.
 */
export const granolaAttachmentTotal = (response: unknown): number => {
  for (const candidate of Array.isArray(response) ? response : [response]) {
    const total = record(record(candidate)?.['pagination'])?.['total_count']
    if (Number.isSafeInteger(total) && Number(total) >= 0) return Number(total)
  }
  throw new GranolaWithheld("Granola's attachment tool gave no total for the meeting")
}

/**
 * The attachment tool types every attachment it returns. Each must be a screenshot or a photo, agree with any type the
 * detail gives, and together they must make up both Granola's count and the tool's own total. An untyped attachment is
 * never taken for a screenshot.
 */
export const granolaAttachmentTypes = (
  inventory: GranolaAttachmentInventory,
  images: readonly GranolaAttachmentImage[],
  total: number
): { readonly screenshots: number; readonly photos: number; readonly difference?: string } => {
  const counted = { screenshots: 0, photos: 0 }
  const problems: string[] = []
  if (total !== inventory.expected)
    problems.push(`Granola counts ${inventory.expected} attachments but its attachment tool holds ${total}`)
  for (const image of images) {
    const type = stringField(image.metadata, ['type'])?.toLowerCase()
    const listed = inventory.types[image.id]
    if (!type) problems.push(`Granola's attachment tool gives no type for ${image.id}`)
    else if (!attachmentTypes.has(type)) problems.push(`Granola's attachment tool types ${image.id} as ${type}`)
    else if (listed && listed !== type)
      problems.push(`Granola's detail types ${image.id} as ${listed} but its attachment tool as ${type}`)
    else if (type === 'photo') counted.photos += 1
    else counted.screenshots += 1
  }
  /* v8 ignore next 2 -- decodeGranolaImages returns exactly one image per requested inventory identity. */
  if (!problems.length && counted.screenshots + counted.photos !== inventory.expected)
    problems.push(`Granola counts ${inventory.expected} attachments but the tool returned ${images.length}`)
  return problems.length ? { ...counted, difference: problems.join('; ') } : counted
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
    // A signed link expires within minutes and opens the file for anyone holding it, so it is not kept.
    const { url: _url, url_expires_at: _expires, ...kept } = metadata
    images.push({ id, bytes, mimeType, metadata: kept })
  }
  if (images.length !== ids.length) throw new KiError('Granola returned an incomplete image batch')
  return images
}
