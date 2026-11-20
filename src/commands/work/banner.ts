import art from '../../assets/banner-art.txt' with { type: 'text' }
import { KiError } from '../../core/errors.ts'
import type { WorkPackageBanner, WorkPackageMeeting } from '../../core/work/package.ts'

/** The scroll's four lines sit at these lines of the art, each between the `|` marks at these columns. */
const SCROLL_FIRST_LINE = 5
const SCROLL_START = 17
const SCROLL_WIDTH = 54
const SEPARATOR = '  ·  '

export interface BannerOptions {
  /** Full prints the art, the roadmap and the package lines; short is the Medium and Short layouts' banner. */
  readonly layout: 'full' | 'short'
  readonly art: boolean
  readonly running: number
  readonly queued: number
  readonly blocked: number
  /** Live items from the session, each `<glyph> <what> · <holder> · at <time>`. */
  readonly items: readonly string[]
  /** The F7 line's text after `↪️`, while the work heads for a hold or a handoff. */
  readonly headingFor?: string
  /** The meetings the session sits in, each with the other participants it works with there, for the F8 line. */
  readonly meetings: readonly WorkPackageMeeting[]
  /** The scroll's host; needed only when the art is printed. */
  readonly host?: string
  readonly now: Date
  /** An IANA time zone, or undefined for the host's own. */
  readonly timeZone?: string
}

interface LocalTime {
  readonly day: string
  readonly weekday: string
  readonly date: string
  readonly time: string
  readonly zone: string
}

const localTime = (moment: Date, timeZone: string | undefined): LocalTime => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short'
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value])
  ) as Record<string, string>
  return {
    day: `${parts['year']}-${parts['month']}-${parts['day']}`,
    weekday: parts['weekday'] as string,
    date: `${parts['day']} ${parts['month']} ${parts['year']}`,
    time: `${parts['hour']}:${parts['minute']}`,
    // Bun's ICU names winter London `GMT+0` where Node's names it `GMT`; the banner says `GMT` either way.
    zone: (parts['timeZoneName'] as string).replace(/^GMT\+0$/, 'GMT')
  }
}

/** A friendly local time: the time alone today, `yesterday` before it, or the weekday and date further back. */
const friendly = (value: string, options: BannerOptions, zone: boolean): string => {
  const moment = localTime(new Date(value), options.timeZone)
  const clock = zone ? `${moment.time} ${moment.zone}` : moment.time
  if (moment.day === localTime(options.now, options.timeZone).day) return clock
  if (moment.day === localTime(new Date(options.now.getTime() - 86_400_000), options.timeZone).day)
    return `yesterday ${clock}`
  return `${moment.weekday} ${moment.date.replace(/ \d+$/, '')} ${clock}`
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const onHold = (banner: WorkPackageBanner): boolean => banner.hold !== null

/** What waits on Kris: the queries with him, and on hold the parked ones too. */
const waiting = (banner: WorkPackageBanner): number => banner.queries.length + (onHold(banner) ? banner.parked : 0)

/** The scroll's state, in Kris's terms: the hold or finish, or whether anything waits on him. */
const scrollState = (banner: WorkPackageBanner): string => {
  if (banner.hold) return banner.hold.kind === 'paused' ? 'ON HOLD' : 'SNOOZING'
  if (banner.state === 'finished') return 'FINISHED'
  const withOwner = banner.state === 'with-supervisor' || banner.state === 'handoff-to-supervisor'
  return withOwner || waiting(banner) > 0 ? 'WITH YOU' : 'ALL CLEAR'
}

/** Centres a line in the scroll's space, any odd space going on the right. */
const centreScrollLine = (text: string): string => {
  const width = [...text].length
  if (width > SCROLL_WIDTH)
    throw new KiError(`scroll line is ${width} characters, over the scroll's ${SCROLL_WIDTH}: ${text}`)
  const left = Math.floor((SCROLL_WIDTH - width) / 2)
  return `${' '.repeat(left)}${text}${' '.repeat(SCROLL_WIDTH - width - left)}`
}

const renderArt = (banner: WorkPackageBanner, options: BannerOptions): string => {
  if (options.host === undefined)
    throw new KiError(
      'no host for the art scroll',
      2,
      "pass --host <name>, set [rig] name in the rig's cairn/config.toml, or leave the art out with --no-art"
    )
  const count = (value: number, words: string): string => `${value === 0 ? 'nothing' : value} ${words}`
  const now = localTime(options.now, options.timeZone)
  const running = banner.hold || banner.state === 'finished' ? 0 : options.running
  const scroll = [
    `${options.host.toUpperCase()}${SEPARATOR}${scrollState(banner)}`,
    '',
    `${count(waiting(banner), 'waiting on you')}${SEPARATOR}${count(running, 'running')}`,
    `${now.weekday} ${now.date}${SEPARATOR}${now.time} ${now.zone}`
  ]
  const lines = art.trimEnd().split('\n')
  scroll.forEach((text, index) => {
    const line = lines[SCROLL_FIRST_LINE + index] as string
    lines[SCROLL_FIRST_LINE + index] =
      `${line.slice(0, SCROLL_START)}${centreScrollLine(text)}${line.slice(SCROLL_START + SCROLL_WIDTH)}`
  })
  return ['```text', ...lines, '```'].join('\n')
}

const heading = (banner: WorkPackageBanner, at: string): string => {
  switch (banner.state) {
    case 'with-worker':
      return `### 🤖 With worker · at ${at}`
    case 'handoff-to-supervisor':
      return `### 🤖 → 👤 Handoff to supervisor ·${banner.blocking ? ' blocked ·' : ''} at ${at}`
    case 'with-supervisor':
      return `### 👤 With supervisor · at ${at}`
    case 'handoff-to-worker':
      return `### 👤 → 🤖 Handoff to worker · at ${at}`
    case 'handoff':
      return `### → 🎯 Handoff to ${banner.target} · at ${at}`
    case 'on-hold': {
      const hold = banner.hold as NonNullable<WorkPackageBanner['hold']>
      if (hold.kind === 'paused') return `### ⏸️ On hold · paused until ${hold.release} · at ${at}`
      return `### 💤 Snoozing (on hold) ·${hold.idle ? ' idle ·' : ''} at ${at}`
    }
    default:
      return `### 🏁 Finished · ${banner.label} closed at ${at}`
  }
}

const countsLine = (banner: WorkPackageBanner, options: BannerOptions): string | undefined => {
  const parked = `🅿️ ${plural(banner.parked, 'query', 'queries')} parked`
  if (banner.hold?.kind === 'paused') return `⏸️ drained · ${parked}`
  if (banner.hold) return `💤 waiting for a message · ${parked}`
  if (banner.state === 'finished') return undefined
  return [
    `🤖 ${options.running} running`,
    `⏳ ${options.queued} queued`,
    `👤 ${banner.queries.length} with you`,
    `⛔ ${options.blocked} blocked`,
    `🅿️ ${banner.parked} parked`
  ].join(' · ')
}

const roadmapLine = (banner: WorkPackageBanner): string => {
  const roadmap = banner.roadmap
  if (!roadmap) return '🗺️ roadmap · none'
  return [
    '🗺️ roadmap',
    plural(roadmap.records, 'record', 'records'),
    `${roadmap.open} open`,
    `${roadmap.done} done awaiting prune`,
    plural(roadmap.ideas, 'idea', 'ideas')
  ].join(' · ')
}

const packageLine = (banner: WorkPackageBanner): string =>
  `📦 package · changes ${banner.changes} · open ${banner.queries.length} · held ${banner.held} · meetings ${banner.meetings}`

/** The standard's item order: running, queued, with you, blocked, parked, a hold's release, then the rest as given. */
const ITEM_ORDER = ['🤖', '⏳', '👤', '⛔', '🅿️'] as const

const itemLines = (banner: WorkPackageBanner, options: BannerOptions): readonly string[] => {
  const given = (glyph: string) => options.items.filter((item) => item.startsWith(glyph))
  const own: Readonly<Record<string, readonly string[]>> = {
    '👤': banner.queries.map((query) => `👤 ${query.tag} · owner · at ${friendly(query.revised, options, false)}`),
    '🅿️': banner.parked ? [`🅿️ ${plural(banner.parked, 'query', 'queries')} in the change documents`] : []
  }
  const release = banner.hold
    ? [banner.hold.kind === 'paused' ? `⏸️ ${banner.hold.release}, or \`resume\`` : '💤 a message arrives, or `resume`']
    : []
  const rest = options.items.filter((item) => !ITEM_ORDER.some((glyph) => item.startsWith(glyph)))
  return [...ITEM_ORDER.flatMap((glyph) => [...(own[glyph] ?? []), ...given(glyph)]), ...release, ...rest].map(
    (item) => `- ${item}`
  )
}

/** The meeting line, F8: each meeting by its id, then `· with` the others there, two or more joined by `, `. */
const meetingLine = (meetings: readonly WorkPackageMeeting[]): string =>
  `🤝 in ${meetings
    .map((meeting) => (meeting.with.length ? `${meeting.id} · with ${meeting.with.join(', ')}` : meeting.id))
    .join(', ')}`

/** The seat's thread line: named first where the roster names its actor, `🧵 <id>` for a seat with no role. */
const threadLine = (banner: WorkPackageBanner): string => {
  if (banner.glyph === null) return `🧵 ${banner.id}`
  const seat = `${banner.glyph} 🔑 ${banner.id}`
  return banner.name === null ? seat : `${banner.name} (${seat})`
}

/** The package's banner, F1 to F9, exactly as the `ki-coordination` standard lays it out. */
export const renderBanner = (banner: WorkPackageBanner, options: BannerOptions): string => {
  if (options.headingFor !== undefined && banner.state !== 'with-worker')
    throw new KiError('--heading-for applies only while the work is With worker', 2)
  const full = options.layout === 'full'
  const items = itemLines(banner, options)
  const blocks = [
    full && options.art ? renderArt(banner, options) : undefined,
    heading(banner, friendly(banner.since, options, true)),
    countsLine(banner, options),
    full ? roadmapLine(banner) : undefined,
    full ? packageLine(banner) : undefined,
    items.length ? items.join('\n') : undefined,
    options.headingFor === undefined ? undefined : `↪️ ${options.headingFor}`,
    options.meetings.length ? meetingLine(options.meetings) : undefined,
    threadLine(banner)
  ]
  return blocks.filter((block) => block !== undefined).join('\n\n')
}
