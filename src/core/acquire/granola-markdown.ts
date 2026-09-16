import { KiError } from '../errors.ts'
import type { RoutedGranolaMeeting } from './granola-routing.ts'
import type { GranolaDetail, GranolaFolder, GranolaTranscript } from './granola-source.ts'

export interface GranolaMeetingDocument {
  readonly content: string
  readonly date: string
  readonly omissions: readonly string[]
  readonly path: string
  readonly title: string
}

const KNOWN_OMISSIONS = [
  'attachments',
  'audio',
  'content_version',
  'created_at',
  'deletion_tombstone',
  'native_folder_membership',
  'recording',
  'source_url',
  'tags',
  'transcript_timestamps',
  'updated_at'
] as const

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : undefined

const stringField = (value: unknown, names: readonly string[]): string | undefined => {
  const item = record(value)
  if (!item) return undefined
  for (const name of names) {
    const candidate = item[name]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

const decodeXml = (value: string): string =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

const attribute = (value: unknown, name: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const match = new RegExp(`\\b${name}=(['"])(.*?)\\1`, 's').exec(value)
  return match?.[2] ? decodeXml(match[2]).trim() : undefined
}

const element = (value: unknown, name: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(value)
  return match?.[1] ? decodeXml(match[1]).trim() : undefined
}

const listField = (value: unknown, names: readonly string[]): readonly string[] => {
  const item = record(value)
  if (!item) return []
  for (const name of names) {
    const candidate = item[name]
    if (Array.isArray(candidate))
      return candidate
        .map((entry) => (typeof entry === 'string' ? entry.trim() : stringField(entry, ['name', 'email'])))
        .filter((entry): entry is string => Boolean(entry))
  }
  return []
}

const participantLines = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)

const yamlString = (value: string): string => JSON.stringify(value)

const yamlList = (name: string, values: readonly string[]): readonly string[] =>
  values.length ? [`${name}:`, ...values.map((value) => `  - ${yamlString(value)}`)] : [`${name}: []`]

const slug = (value: string): string => {
  const result = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '')
  return result || 'meeting'
}

const isoDate = (value: string): string => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? 'undated' : parsed.toISOString().slice(0, 10)
}

const embeddedRecord = (value: string): Readonly<Record<string, unknown>> | undefined => {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end < start) return undefined
  try {
    return record(JSON.parse(value.slice(start, end + 1)) as unknown)
  } catch {
    return undefined
  }
}

const transcriptText = (transcript: GranolaTranscript): string | undefined => {
  if (transcript.state === 'unavailable') return undefined
  if (typeof transcript.projection === 'string') {
    const projection = transcript.projection.trim()
    return (
      stringField(embeddedRecord(projection), ['transcript', 'text', 'content']) ??
      element(projection, 'transcript') ??
      projection
    )
  }
  return stringField(transcript.projection, ['transcript', 'text', 'content'])
}

const readableNotes = (value: string, title: string): string => {
  const source = value.split(/\r?\n/)
  const headings = source.flatMap((line) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trimEnd())
    return match?.[1] ? [match[1].length] : []
  })
  const minimumHeading = headings.length ? Math.min(...headings) : undefined
  const lines = source
    .map((line) => {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line.trimEnd())
      if (heading?.[1] && heading[2]) {
        if (heading[1].length === minimumHeading && heading[2].trim().toLocaleLowerCase() === title.toLocaleLowerCase())
          return ''
        const level = Math.min(6, heading[1].length + 2 - (minimumHeading as number))
        return `${'#'.repeat(level)} ${heading[2].trim()}`
      }
      const list = /^( *)(?:[-+*])\s+/.exec(line)
      if (!list) {
        const continuation = /^( {4,})(\S.*)$/.exec(line)
        if (continuation?.[1] && continuation[2])
          return `${'  '.repeat(Math.floor(continuation[1].length / 4))}${continuation[2].trimEnd()}`
        return line.trimEnd()
      }
      const indent = '  '.repeat(Math.floor((list[1] as string).length / 4))
      return `${indent}- ${line.slice(list[0].length).trimEnd()}`
    })
    .join('\n')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '_$1_')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const firstContent = lines.split('\n').find((line) => line.trim())
  return firstContent?.startsWith('## ') ? lines : `## Summary\n\n${lines}`
}

const participantsText = (participants: readonly string[]): string => {
  if (participants.length < 2) return participants[0] as string
  if (participants.length === 2) return `${participants[0]} and ${participants[1]}`
  return `${participants.slice(0, -1).join(', ')}, and ${participants.at(-1)}`
}

const autolinkAddresses = (value: string): string =>
  value
    .replace(/(?<![<\w])([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})(?![>\w])/g, '<$1>')
    .replace(/(?<![<(])(https?:\/\/[^\s<>]+[^\s<>.,;:!?])/g, '<$1>')

const readableTranscript = (value: string): string =>
  autolinkAddresses(value)
    .replace(/\s+(?=(?:Me|Them|Speaker [A-Z]):\s)/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')

const folderName = (folder: GranolaFolder): string | undefined =>
  stringField(folder.projection, ['name', 'title']) ??
  attribute(folder.projection, 'name') ??
  attribute(folder.projection, 'title')

export const renderGranolaMeeting = (options: {
  readonly accountSha256: string
  readonly acquiredAt: string
  readonly detail: GranolaDetail
  readonly folders: readonly GranolaFolder[]
  readonly meeting: RoutedGranolaMeeting
  readonly sourceSha256: string
  readonly transcript: GranolaTranscript
}): GranolaMeetingDocument => {
  const detail = options.detail.projection
  const title =
    stringField(detail, ['title']) ??
    attribute(detail, 'title') ??
    stringField(options.meeting.projection, ['title']) ??
    attribute(options.meeting.projection, 'title') ??
    'Untitled meeting'
  const date =
    stringField(detail, ['date', 'meeting_date']) ??
    attribute(detail, 'date') ??
    stringField(options.meeting.projection, ['date', 'meeting_date']) ??
    attribute(options.meeting.projection, 'date') ??
    'Unknown date'
  const summary = readableNotes(
    stringField(detail, ['summary', 'notes', 'generated_notes']) ??
      element(detail, 'summary') ??
      '_No notes available._',
    title
  )
  const participants = [
    ...listField(detail, ['participants', 'known_participants', 'attendees']),
    ...participantLines(element(detail, 'known_participants'))
  ].filter((value, index, all) => all.indexOf(value) === index)
  const transcript = transcriptText(options.transcript)
  const omissions = [
    ...KNOWN_OMISSIONS,
    ...(options.detail.state === 'unavailable' ? ['meeting_detail'] : []),
    ...(transcript ? [] : ['transcript'])
  ].sort()
  const selectedFolders = options.meeting.folderIds.map((id) => ({
    id,
    name: folderName(options.folders.find((folder) => folder.id === id) as GranolaFolder)
  }))
  const path = `${isoDate(date)}--${slug(title)}--${options.meeting.id}.md`
  if (path.includes('/') || path.includes('\\'))
    throw new KiError(`Granola meeting ${options.meeting.id} produced unsafe path`)
  const frontmatter = [
    '---',
    'type: granola-meeting',
    'source: granola',
    `source_id: ${yamlString(options.meeting.id)}`,
    `title: ${yamlString(title)}`,
    `meeting_date: ${yamlString(date)}`,
    `acquired_at: ${yamlString(options.acquiredAt)}`,
    `source_account_sha256: ${yamlString(options.accountSha256)}`,
    `source_sha256: ${yamlString(options.sourceSha256)}`,
    `inferred_unfoldered: ${options.meeting.inferredUnfoldered}`,
    ...(selectedFolders.length
      ? [
          'folders:',
          ...selectedFolders.flatMap((folder) => [
            `  - id: ${yamlString(folder.id)}`,
            `    name: ${folder.name ? yamlString(folder.name) : 'null'}`
          ])
        ]
      : ['folders: []']),
    ...yamlList('participants', participants),
    ...yamlList('omissions', omissions),
    '---'
  ]
  const sections = [
    ...frontmatter,
    '',
    `# ${title}`,
    ...(participants.length ? ['', '## Attendees', '', participantsText(participants)] : []),
    '',
    summary,
    '',
    '## Transcript',
    '',
    transcript ? readableTranscript(transcript) : '_Transcript unavailable from the source._',
    ''
  ]
  const content = sections.join('\n').replace(/[ \t]+$/gm, '')
  return { content, date, omissions, path, title }
}
