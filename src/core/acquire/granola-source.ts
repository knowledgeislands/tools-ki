import { createHash } from 'node:crypto'
import { KiError } from '../errors.ts'
import type { Runner } from '../runtime/runner.ts'

export interface GranolaSource {
  readonly accountSha256: string
  readonly schemaSha256: string
  readonly folders: () => Promise<readonly GranolaFolder[]>
  readonly meetings: (window: GranolaWindow, folderId?: string) => Promise<GranolaResponse>
  readonly detail: (meetingId: string) => Promise<unknown>
  readonly transcript: (meetingId: string) => Promise<GranolaTranscript>
}

export interface GranolaFolder {
  readonly id: string
  readonly projection: unknown
}

export interface GranolaWindow {
  readonly since: string
  readonly until: string
}

export interface GranolaMeeting {
  readonly id: string
  readonly projection: unknown
}

export interface GranolaResponse {
  readonly meetings: readonly GranolaMeeting[]
  readonly projectionSha256: string
}

export type GranolaTranscript =
  | { readonly state: 'available'; readonly projection: unknown }
  | { readonly state: 'unavailable'; readonly reason: string }

const REQUIRED_TOOLS = [
  'get_account_info',
  'get_meeting_transcript',
  'get_meetings',
  'list_meeting_folders',
  'list_meetings'
] as const

export const stableJson = (value: unknown): string => {
  const normalise = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalise)
    if (candidate && typeof candidate === 'object')
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right, 'en'))
          .map(([key, child]) => [key, normalise(child)])
      )
    return candidate
  }
  return JSON.stringify(normalise(value))
}

export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new KiError(`Granola ${label} response is malformed`)
  return value as Record<string, unknown>
}

const parseJson = (output: string, label: string): unknown => {
  try {
    return JSON.parse(output) as unknown
  } catch {
    throw new KiError(`Granola ${label} response is not JSON`)
  }
}

const unwrap = (value: unknown): unknown => {
  if (Array.isArray(value)) return value
  const outer = record(value, 'MCP')
  if (outer['structuredContent'] !== undefined) return outer['structuredContent']
  if (outer['result'] !== undefined) return unwrap(outer['result'])
  if (Array.isArray(outer['content'])) {
    const texts = outer['content']
      .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>)['text'] : undefined))
      .filter((entry): entry is string => typeof entry === 'string')
    if (texts.length === 1) {
      const [text] = texts as [string]
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    }
  }
  return outer
}

const collection = (value: unknown, names: readonly [string, ...string[]], label: string): readonly unknown[] => {
  const unwrapped = unwrap(value)
  if (Array.isArray(unwrapped)) return unwrapped
  const container = record(unwrapped, label)
  for (const name of names) {
    if (Array.isArray(container[name])) return container[name] as readonly unknown[]
  }
  if (container['data'] !== undefined) return collection(container['data'], names, label)
  throw new KiError(`Granola ${label} response contains no ${names[0]} array`)
}

const identity = (value: unknown, names: readonly [string, ...string[]], label: string): string => {
  const item = record(value, label)
  for (const name of names) {
    const candidate = item[name]
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  throw new KiError(`Granola ${label} has no stable identity`)
}

const transcriptUnavailable = (output: string): boolean =>
  /(?:not available|unavailable|not entitled|paid plan|not found|no transcript)/i.test(output)

const call = async (
  runner: Runner,
  environment: NodeJS.ProcessEnv,
  tool: string,
  arguments_: Readonly<Record<string, unknown>> = {}
): Promise<unknown> => {
  const result = await runner(
    'mcporter',
    ['call', `granola.${tool}`, '--args', stableJson(arguments_), '--output', 'json', '--no-oauth'],
    environment
  )
  if (result.exitCode !== 0)
    throw new KiError(`Granola ${tool} failed: ${result.output.trim() || 'mcporter exited non-zero'}`)
  return unwrap(parseJson(result.output, tool))
}

const inspectSchema = async (runner: Runner, environment: NodeJS.ProcessEnv): Promise<string> => {
  const result = await runner('mcporter', ['list', 'granola', '--schema', '--json', '--no-oauth'], environment)
  if (result.exitCode !== 0)
    throw new KiError(`Granola MCP schema inspection failed: ${result.output.trim() || 'mcporter exited non-zero'}`)
  const response = record(parseJson(result.output, 'schema'), 'schema')
  const tools = collection(response['tools'], ['tools'], 'schema tools').map((value) => record(value, 'schema tool'))
  const selected = REQUIRED_TOOLS.map((name) => {
    const tool = tools.find((candidate) => candidate['name'] === name)
    if (!tool) throw new KiError(`Granola MCP is missing required read-only tool ${name}`)
    return { name, inputSchema: tool['inputSchema'] }
  })
  return sha256(stableJson(selected))
}

export const granolaSource = async (runner: Runner, environment: NodeJS.ProcessEnv): Promise<GranolaSource> => {
  const schemaSha256 = await inspectSchema(runner, environment)
  const accountSha256 = sha256(stableJson(await call(runner, environment, 'get_account_info')))
  return {
    accountSha256,
    schemaSha256,
    folders: async () =>
      collection(await call(runner, environment, 'list_meeting_folders'), ['folders'], 'folders').map((projection) => ({
        id: identity(projection, ['id', 'folder_id'], 'folder'),
        projection
      })),
    meetings: async (window, folderId) => {
      const response = await call(runner, environment, 'list_meetings', {
        time_range: 'custom',
        custom_start: window.since,
        custom_end: window.until,
        ...(folderId ? { folder_id: folderId } : {})
      })
      return {
        meetings: collection(response, ['meetings', 'documents'], 'meetings').map((projection) => ({
          id: identity(projection, ['id', 'meeting_id', 'document_id'], 'meeting'),
          projection
        })),
        projectionSha256: sha256(stableJson(response))
      }
    },
    detail: async (meetingId) => {
      const response = await call(runner, environment, 'get_meetings', { meeting_ids: [meetingId] })
      const meetings = collection(response, ['meetings', 'documents'], 'meeting detail')
      if (meetings.length !== 1)
        throw new KiError(`Granola meeting detail ${meetingId} did not return exactly one meeting`)
      const [projection] = meetings
      if (identity(projection, ['id', 'meeting_id', 'document_id'], 'meeting detail') !== meetingId)
        throw new KiError(`Granola meeting detail identity differs from ${meetingId}`)
      return projection
    },
    transcript: async (meetingId) => {
      const result = await runner(
        'mcporter',
        [
          'call',
          'granola.get_meeting_transcript',
          '--args',
          stableJson({ meeting_id: meetingId }),
          '--output',
          'json',
          '--no-oauth'
        ],
        environment
      )
      if (result.exitCode !== 0) {
        if (transcriptUnavailable(result.output)) return { state: 'unavailable', reason: result.output.trim() }
        throw new KiError(
          `Granola get_meeting_transcript failed: ${result.output.trim() || 'mcporter exited non-zero'}`
        )
      }
      return { state: 'available', projection: unwrap(parseJson(result.output, 'transcript')) }
    }
  }
}
