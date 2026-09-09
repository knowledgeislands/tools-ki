import type { Runner } from '../../core/runtime/runner.ts'

export interface GranolaMeetingFixture {
  readonly id: string
  readonly date: string
  readonly title: string
  readonly folderIds?: readonly string[]
  readonly detail?: Readonly<Record<string, unknown>>
  readonly transcript?: Readonly<Record<string, unknown>> | null
}

export interface GranolaFixture {
  readonly meetings: readonly GranolaMeetingFixture[]
  readonly folders?: readonly { readonly id: string; readonly title: string }[]
  readonly account?: Readonly<Record<string, unknown>>
  readonly missingTools?: readonly string[]
  readonly responseWrapper?: 'structured' | 'result' | 'content' | 'data'
  readonly onList?: (options: {
    readonly since: string
    readonly until: string
    readonly folderId?: string
    readonly matches: readonly GranolaMeetingFixture[]
  }) => readonly GranolaMeetingFixture[]
  readonly failDetailOnce?: string
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

export const granolaFixtureRunner = (fixture: GranolaFixture): GranolaFixtureRunner => {
  const calls: { tool: string; arguments: Readonly<Record<string, unknown>> }[] = []
  let failedDetail = false
  const callResult = (value: unknown): { readonly exitCode: number; readonly output: string } => {
    if (fixture.responseWrapper === 'structured') return result({ structuredContent: value })
    if (fixture.responseWrapper === 'result') return result({ result: value })
    if (fixture.responseWrapper === 'content')
      return result({ content: [{ type: 'text', text: JSON.stringify(value) }] })
    if (fixture.responseWrapper === 'data') return result({ data: value })
    return result(value)
  }
  const runner: Runner = async (command, arguments_) => {
    if (command !== 'mcporter') return { exitCode: 1, output: `unexpected command ${command}` }
    if (arguments_[0] === 'list')
      return result({
        tools: tools
          .filter((name) => !fixture.missingTools?.includes(name))
          .map((name) => ({ name, inputSchema: { type: 'object', additionalProperties: false } }))
      })
    const selector = arguments_[1] ?? ''
    const tool = selector.replace('granola.', '')
    const argumentsIndex = arguments_.indexOf('--args')
    const parsed = JSON.parse(arguments_[argumentsIndex + 1] ?? '{}') as Readonly<Record<string, unknown>>
    calls.push({ tool, arguments: parsed })
    if (tool === 'get_account_info') return callResult(fixture.account ?? { account: 'fixture', workspace: 'fixture' })
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
      return callResult({ meetings: selected.map(({ id, date, title }) => ({ id, date, title })) })
    }
    if (tool === 'get_meetings') {
      const id = (parsed['meeting_ids'] as readonly string[] | undefined)?.[0]
      if (id === fixture.failDetailOnce && !failedDetail) {
        failedDetail = true
        return { exitCode: 1, output: 'temporary read failure' }
      }
      const meeting = fixture.meetings.find((candidate) => candidate.id === id)
      if (!meeting) return callResult({ meetings: [] })
      return callResult({ meetings: [{ id: meeting.id, title: meeting.title, date: meeting.date, ...meeting.detail }] })
    }
    if (tool === 'get_meeting_transcript') {
      const id = String(parsed['meeting_id'])
      const meeting = fixture.meetings.find((candidate) => candidate.id === id)
      if (meeting?.transcript === null) return { exitCode: 1, output: 'no transcript available on this plan' }
      return callResult(meeting?.transcript ?? { meeting_id: id, transcript: `Transcript for ${id}` })
    }
    return { exitCode: 1, output: `unexpected tool ${tool}` }
  }
  return { runner, calls }
}
