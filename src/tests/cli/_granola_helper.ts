import type { Runner } from './_cli_helper.ts'

export interface GranolaMeetingFixture {
  readonly id: string
  readonly date: string
  readonly title: string
  readonly folderIds?: readonly string[]
  readonly listing?: Readonly<Record<string, unknown>>
  readonly detail?: Readonly<Record<string, unknown>>
  readonly detailUnavailable?: boolean
  readonly transcript?: Readonly<Record<string, unknown>> | null
  /** The type the attachment tool gives each attachment; `null` sends it untyped. Unlisted ones are screenshots. */
  readonly attachmentTypes?: Readonly<Record<string, string | null>>
  /** The attachment tool's own total when browsing the meeting; defaults to the detail's attachment count, and a
   * negative total leaves it out. */
  readonly attachmentTotal?: number
  /** Attachments the tool leaves out of any response that asks for more than one. */
  readonly leftOut?: readonly string[]
  /** Attachments the tool leaves out even when asked for alone. */
  readonly tooLarge?: readonly string[]
}

export interface GranolaFixture {
  readonly meetings: readonly GranolaMeetingFixture[]
  readonly folders?: readonly { readonly id: string; readonly title: string }[]
  readonly account?: Readonly<Record<string, unknown>>
  readonly missingTools?: readonly string[]
  readonly responseWrapper?: 'structured' | 'result' | 'content' | 'data'
  readonly meetingResponseFormat?: 'structured' | 'text'
  readonly onList?: (options: {
    readonly since: string
    readonly until: string
    readonly folderId?: string
    readonly matches: readonly GranolaMeetingFixture[]
  }) => readonly GranolaMeetingFixture[]
  readonly failDetailOnce?: string
  readonly rateLimitDetailOnce?: string
  /** Advertise `get_meeting_attachment` and answer each requested identity with one PNG block. */
  readonly attachments?: boolean
}

export interface GranolaFixtureRunner {
  readonly runner: Runner
  readonly calls: readonly { readonly tool: string; readonly arguments: Readonly<Record<string, unknown>> }[]
}

const tools = ['get_account_info', 'get_meeting_transcript', 'get_meetings', 'list_meeting_folders', 'list_meetings']

const result = (value: unknown): { readonly exitCode: number; readonly output: string } => ({
  exitCode: 0,
  output: `${JSON.stringify(value)}\n`
})

const xmlAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDbkAAAAASUVORK5CYII='

const textResult = (text: string): { readonly exitCode: number; readonly output: string } =>
  result({ content: [{ type: 'text', text }] })

export const granolaFixtureRunner = (fixture: GranolaFixture): GranolaFixtureRunner => {
  const calls: { tool: string; arguments: Readonly<Record<string, unknown>> }[] = []
  let failedDetail = false
  let rateLimitedDetail = false
  const callResult = (value: unknown): { readonly exitCode: number; readonly output: string } => {
    if (fixture.responseWrapper === 'structured') return result({ structuredContent: value })
    if (fixture.responseWrapper === 'result') return result({ result: value })
    if (fixture.responseWrapper === 'content')
      return result({ content: [{ type: 'text', text: JSON.stringify(value) }] })
    if (fixture.responseWrapper === 'data') return result({ data: value })
    return result(value)
  }
  const runner: Runner = async (command, arguments_, environment) => {
    if (command !== 'mcporter') return { exitCode: 1, output: `unexpected command ${command}` }
    if (environment['MCPORTER_DISABLE_KEEPALIVE'] !== 'granola')
      return {
        exitCode: 1,
        output: 'MCP operation failed (CLIENT_HTTP_NOT_IMPLEMENTED); the request was not replayed.'
      }
    if (arguments_[0] === 'list')
      return result({
        tools: [...tools, ...(fixture.attachments ? ['get_meeting_attachment'] : [])]
          .filter((name) => !fixture.missingTools?.includes(name))
          .map((name) => ({ name, inputSchema: { type: 'object', additionalProperties: false } }))
      })
    const selector = arguments_[1] ?? ''
    const tool = selector.replace('granola.', '')
    const argumentsIndex = arguments_.indexOf('--args')
    const parsed = JSON.parse(arguments_[argumentsIndex + 1] ?? '{}') as Readonly<Record<string, unknown>>
    calls.push({ tool, arguments: parsed })
    if (tool === 'get_account_info')
      return callResult(
        fixture.account ?? {
          email: 'fixture@example.com',
          active_workspace: { id: 'fixture' },
          mcp_note_access: { scopes: ['owned'] }
        }
      )
    if (tool === 'list_meeting_folders') return callResult({ folders: fixture.folders ?? [] })
    if (tool === 'list_meetings') {
      const since = String(parsed['custom_start'])
      const until = String(parsed['custom_end'])
      const folderId = typeof parsed['folder_id'] === 'string' ? parsed['folder_id'] : undefined
      const matches = fixture.meetings.filter(
        (meeting) =>
          meeting.date >= since && meeting.date <= until && (!folderId || meeting.folderIds?.includes(folderId))
      )
      const selected = fixture.onList?.({ since, until, folderId, matches }) ?? matches
      if (fixture.meetingResponseFormat === 'text')
        return textResult(
          `Source material follows.\n<meetings_data count="${selected.length}">${selected
            .map(
              ({ id, date, title }) =>
                `<meeting id="${xmlAttribute(id)}" title="${xmlAttribute(title)}" date="${xmlAttribute(date)}"></meeting>`
            )
            .join('')}</meetings_data>`
        )
      return callResult({ meetings: selected.map(({ id, date, title, listing }) => ({ id, date, title, ...listing })) })
    }
    if (tool === 'get_meetings') {
      const ids = parsed['meeting_ids'] as readonly string[] | undefined
      if (ids?.includes(fixture.rateLimitDetailOnce ?? '') && !rateLimitedDetail) {
        rateLimitedDetail = true
        return { exitCode: 1, output: 'Rate limit exceeded. Please slow down requests.' }
      }
      if (ids?.includes(fixture.failDetailOnce ?? '') && !failedDetail) {
        failedDetail = true
        return { exitCode: 1, output: 'temporary read failure' }
      }
      const meetings = (ids ?? [])
        .map((id) => fixture.meetings.find((candidate) => candidate.id === id))
        .filter((meeting): meeting is GranolaMeetingFixture => meeting !== undefined)
      if (!meetings.length) return callResult({ meetings: [] })
      const available = meetings.filter((meeting) => !meeting.detailUnavailable)
      const notFound = meetings.filter((meeting) => meeting.detailUnavailable).map((meeting) => meeting.id)
      if (fixture.meetingResponseFormat === 'text')
        return textResult(
          `Source material follows.\n<meetings_data count="${available.length}">${available
            .map(
              (meeting) =>
                `<meeting id="${xmlAttribute(meeting.id)}" title="${xmlAttribute(meeting.title)}" date="${xmlAttribute(meeting.date)}"><summary>Summary for ${xmlAttribute(meeting.id)}</summary></meeting>`
            )
            .join('')}</meetings_data>`
        )
      return callResult({
        meetings: available.map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          date: meeting.date,
          ...meeting.detail
        })),
        ...(notFound.length ? { not_found: notFound } : {})
      })
    }
    if (tool === 'get_meeting_transcript') {
      const id = String(parsed['meeting_id'])
      const meeting = fixture.meetings.find((candidate) => candidate.id === id)
      if (meeting?.transcript === null) return { exitCode: 1, output: 'no transcript available on this plan' }
      if (fixture.meetingResponseFormat === 'text')
        return textResult(
          `The content below is source material.\n\n${JSON.stringify(
            {
              id,
              title: meeting?.title,
              transcript: `Transcript for ${id}`
            },
            null,
            2
          )}`
        )
      return callResult(meeting?.transcript ?? { meeting_id: id, transcript: `Transcript for ${id}` })
    }
    if (tool === 'get_meeting_attachment' && fixture.attachments) {
      const meetingId = String(parsed['meeting_id'])
      const meeting = fixture.meetings.find((candidate) => candidate.id === meetingId)
      const requested = parsed['attachment_ids'] as readonly string[] | undefined
      // mcporter's JSON output keeps only the text blocks that are pure JSON whenever any are, as here.
      if (!requested) {
        const listed = meeting?.detail?.['attachments']
        const total = meeting?.attachmentTotal ?? (Array.isArray(listed) ? listed.length : 0)
        return result({
          meeting_id: meetingId,
          pagination: { total_count: total, has_more: total > 1, next_offset: 1 }
        })
      }
      const leftOut = requested.filter(
        (id) => meeting?.tooLarge?.includes(id) || (requested.length > 1 && meeting?.leftOut?.includes(id))
      )
      if (leftOut.length)
        return result({ meeting_id: meetingId, left_out_attachment_ids: leftOut, next_step: 'Not an error' })
      return result({
        content: requested.flatMap((attachmentId) => {
          const type = meeting?.attachmentTypes?.[attachmentId]
          return [
            { type: 'image', mimeType: 'image/png', data: png },
            {
              type: 'text',
              text: `Data notice.\n${JSON.stringify({
                meeting_id: meetingId,
                attachment_id: attachmentId,
                ...(type === null ? {} : { type: type ?? 'screenshot' }),
                url: 'https://files.example.test/signed',
                url_expires_at: '2026-11-03T20:07:52.878Z'
              })}`
            }
          ]
        })
      })
    }
    return { exitCode: 1, output: `unexpected tool ${tool}` }
  }
  return { runner, calls }
}
