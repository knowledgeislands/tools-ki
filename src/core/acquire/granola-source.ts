import { createHash } from 'node:crypto'
import { KiError } from '../errors.ts'
import type { CommandResult, Runner } from '../runtime/runner.ts'

export interface GranolaSource {
  readonly accountSha256: string
  readonly schemaSha256: string
  readonly folders: () => Promise<readonly GranolaFolder[]>
  readonly meetings: (window: GranolaWindow, folderId?: string) => Promise<GranolaResponse>
  readonly details: (meetingIds: readonly string[]) => Promise<ReadonlyMap<string, GranolaDetail>>
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

export type GranolaDetail =
  | { readonly state: 'available'; readonly projection: unknown }
  | { readonly state: 'unavailable'; readonly projection: unknown; readonly reason: string }

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

const textMeetingCollection = (value: string, label: string): readonly GranolaMeeting[] => {
  const root = /<meetings_data\b([^>]*)>([\s\S]*?)<\/meetings_data>/.exec(value)
  if (!root) throw new KiError(`Granola ${label} response is malformed`)
  const count = /\bcount=(['"])(\d+)\1/.exec(root[1] as string)
  if (!count) throw new KiError(`Granola ${label} response has no meeting count`)
  const meetings = [...(root[2] as string).matchAll(/<meeting\b([^>]*)>[\s\S]*?<\/meeting>/g)].map((match) => {
    const id = /\bid=(['"])([^'"]+)\1/.exec(match[1] as string)?.[2]
    if (!id) throw new KiError(`Granola ${label} has no stable identity`)
    return { id, projection: match[0] }
  })
  if (Number(count[2]) !== meetings.length)
    throw new KiError(`Granola ${label} response count does not match its meeting projections`)
  return meetings
}

const meetingCollection = (value: unknown, label: string): readonly GranolaMeeting[] => {
  if (typeof value === 'string') return textMeetingCollection(value, label)
  return collection(value, ['meetings', 'documents'], label).map((projection) => ({
    id: identity(projection, ['id', 'meeting_id', 'document_id'], label === 'meetings' ? 'meeting' : label),
    projection
  }))
}

const explicitlyUnavailableDetails = (value: unknown): ReadonlySet<string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Set()
  const notFound = (value as Record<string, unknown>)['not_found']
  if (!Array.isArray(notFound) || notFound.some((id) => typeof id !== 'string')) return new Set()
  return new Set(notFound as readonly string[])
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

const rateLimited = (result: CommandResult): boolean =>
  result.exitCode !== 0 && /(?:rate limit exceeded|too many requests)/i.test(result.output)

const retryBaseMilliseconds = (environment: NodeJS.ProcessEnv): number => {
  const configured = environment['KI_GRANOLA_RATE_LIMIT_BASE_MS']
  if (configured === undefined) return 30_000
  const parsed = Number(configured)
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new KiError('KI_GRANOLA_RATE_LIMIT_BASE_MS must be a non-negative integer')
  return parsed
}

const requestIntervalMilliseconds = (environment: NodeJS.ProcessEnv): number => {
  const configured = environment['KI_GRANOLA_REQUEST_INTERVAL_MS']
  if (configured === undefined) return 1_100
  const parsed = Number(configured)
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new KiError('KI_GRANOLA_REQUEST_INTERVAL_MS must be a non-negative integer')
  return parsed
}

const pause = async (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))

interface GranolaRequestGate {
  readonly beforeRequest: () => Promise<void>
  readonly onRateLimit: () => void
}

const requestGate = (environment: NodeJS.ProcessEnv): GranolaRequestGate => {
  let interval = requestIntervalMilliseconds(environment)
  const adaptiveInterval = environment['KI_GRANOLA_REQUEST_INTERVAL_MS'] === undefined ? 5_000 : interval
  let nextRequestAt = 0
  return {
    beforeRequest: async () => {
      const remaining = nextRequestAt - Date.now()
      if (remaining > 0) await pause(remaining)
      nextRequestAt = Date.now() + interval
    },
    onRateLimit: () => {
      interval = Math.max(interval, adaptiveInterval)
      nextRequestAt = Math.max(nextRequestAt, Date.now() + interval)
    }
  }
}

const runGranolaCall = async (
  runner: Runner,
  environment: NodeJS.ProcessEnv,
  tool: string,
  arguments_: Readonly<Record<string, unknown>>,
  gate: GranolaRequestGate
): Promise<CommandResult> => {
  const command = ['call', `granola.${tool}`, '--args', stableJson(arguments_), '--output', 'json', '--no-oauth']
  const base = retryBaseMilliseconds(environment)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await gate.beforeRequest()
    const result = await runner('mcporter', command, environment)
    if (!rateLimited(result) || attempt === 3) return result
    gate.onRateLimit()
    await pause(base * 2 ** attempt)
  }
  /* v8 ignore next -- The final loop attempt returns regardless of outcome, so control cannot reach this guard. */
  throw new KiError(`Granola ${tool} retry state is unreachable`)
}

const call = async (
  runner: Runner,
  environment: NodeJS.ProcessEnv,
  tool: string,
  arguments_: Readonly<Record<string, unknown>>,
  gate: GranolaRequestGate
): Promise<unknown> => {
  const result = await runGranolaCall(runner, environment, tool, arguments_, gate)
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
  const gate = requestGate(environment)
  const accountSha256 = sha256(stableJson(await call(runner, environment, 'get_account_info', {}, gate)))
  return {
    accountSha256,
    schemaSha256,
    folders: async () =>
      collection(await call(runner, environment, 'list_meeting_folders', {}, gate), ['folders'], 'folders').map(
        (projection) => ({
          id: identity(projection, ['id', 'folder_id'], 'folder'),
          projection
        })
      ),
    meetings: async (window, folderId) => {
      const response = await call(
        runner,
        environment,
        'list_meetings',
        {
          time_range: 'custom',
          custom_start: window.since,
          custom_end: window.until,
          ...(folderId ? { folder_id: folderId } : {})
        },
        gate
      )
      return {
        meetings: meetingCollection(response, 'meetings'),
        projectionSha256: sha256(stableJson(response))
      }
    },
    details: async (meetingIds) => {
      /* v8 ignore next -- The sole caller chunks a keyed meeting map into non-empty batches of at most ten. */
      if (!meetingIds.length || meetingIds.length > 10 || new Set(meetingIds).size !== meetingIds.length)
        throw new KiError('Granola meeting detail batch must contain between one and ten unique identities')
      const response = await call(runner, environment, 'get_meetings', { meeting_ids: meetingIds }, gate)
      const meetings = meetingCollection(response, 'meeting detail')
      const requested = new Set(meetingIds)
      const found = new Map<string, GranolaDetail>()
      for (const meeting of meetings) {
        if (!requested.has(meeting.id))
          throw new KiError(`Granola meeting detail returned unrequested identity ${meeting.id}`)
        if (found.has(meeting.id)) throw new KiError(`Granola meeting detail repeated identity ${meeting.id}`)
        found.set(meeting.id, { state: 'available', projection: meeting.projection })
      }
      const unavailable = explicitlyUnavailableDetails(response)
      for (const meetingId of unavailable) {
        if (!requested.has(meetingId))
          throw new KiError(`Granola meeting detail marked unrequested identity ${meetingId} unavailable`)
        if (found.has(meetingId))
          throw new KiError(`Granola meeting detail both returned and marked ${meetingId} unavailable`)
        found.set(meetingId, {
          state: 'unavailable',
          projection: { not_found: [meetingId] },
          reason: 'provider returned no detail for the listed meeting identity'
        })
      }
      const missing = meetingIds.filter((meetingId) => !found.has(meetingId))
      if (missing.length && meetingIds.length === 1)
        throw new KiError(`Granola meeting detail ${meetingIds[0]} did not return exactly one meeting`)
      if (missing.length)
        throw new KiError(`Granola meeting detail did not account for requested identity ${missing[0]}`)
      return found
    },
    transcript: async (meetingId) => {
      const result = await runGranolaCall(
        runner,
        environment,
        'get_meeting_transcript',
        { meeting_id: meetingId },
        gate
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
