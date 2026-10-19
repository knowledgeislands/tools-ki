/** A span of a Markdown file whose bytes the converter never rewrites. */
export type RegionKind = 'front-matter' | 'code' | 'comment' | 'template'

export interface Region {
  readonly start: number
  readonly end: number
  readonly kind: RegionKind
}

/** A construct found outside rewritable text that needs an owner's judgement. */
export interface Marker {
  readonly start: number
  readonly kind: 'callout' | 'dataview'
  readonly text: string
}

export interface Heading {
  readonly text: string
  readonly slug: string
}

export interface Scan {
  readonly regions: readonly Region[]
  readonly markers: readonly Marker[]
  /** The protected region holding an offset, if any. */
  readonly regionAt: (offset: number) => RegionKind | undefined
  /** The one-based line holding an offset. */
  readonly lineAt: (offset: number) => number
}

/** The alert types GitHub renders; any other callout type, or a fold marker, is Obsidian's own. */
const GITHUB_ALERTS = new Set(['note', 'tip', 'important', 'warning', 'caution'])
const fenceOpening = /^[ \t>]*(`{3,}|~{3,})(.*)$/
const calloutLine = /^[ \t]*(?:>[ \t]*)+\[!([^\]\s]+)\]([-+]?)/
const atxHeading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/

interface Line {
  readonly start: number
  readonly text: string
}

const linesOf = (text: string): Line[] => {
  const lines: Line[] = []
  let start = 0
  for (const text_ of text.split('\n')) {
    lines.push({ start, text: text_ })
    start += text_.length + 1
  }
  return lines
}

/** Front matter and fenced code, found line by line; an unclosed fence runs to the end of the file. */
const blockRegions = (lines: readonly Line[], markers: Marker[]): Region[] => {
  const regions: Region[] = []
  let index = 0
  if (/^---\r?$/.test((lines[0] as Line).text)) {
    const close = lines.findIndex((line, position) => position > 0 && /^(?:---|\.\.\.)\r?$/.test(line.text))
    if (close > 0) {
      const last = lines[close] as Line
      regions.push({ start: 0, end: last.start + last.text.length, kind: 'front-matter' })
      index = close + 1
    }
  }
  for (; index < lines.length; index++) {
    const line = lines[index] as Line
    const opening = fenceOpening.exec(line.text)
    if (!opening) continue
    const fence = opening[1] as string
    if (/^dataview(?:js)?\b/i.test((opening[2] as string).trim()))
      markers.push({ start: line.start, kind: 'dataview', text: line.text.trim() })
    const closing = new RegExp(`^[ \\t>]*\\${fence[0]}{${fence.length},}[ \\t]*\\r?$`)
    let close = index + 1
    while (close < lines.length && !closing.test((lines[close] as Line).text)) close++
    const last = lines[Math.min(close, lines.length - 1)] as Line
    regions.push({ start: line.start, end: last.start + last.text.length, kind: 'code' })
    index = close
  }
  return regions
}

const inlineDelimiters: readonly (readonly [string, string, RegionKind])[] = [
  ['<!--', '-->', 'comment'],
  ['%%', '%%', 'comment'],
  ['{{', '}}', 'template'],
  ['<%', '%>', 'template']
]

/** Code spans, comments and template expressions in one segment, left to right as a reader meets them. */
const inlineRegions = (text: string, start: number, end: number, markers: Marker[]): Region[] => {
  const regions: Region[] = []
  const segment = text.slice(0, end)
  let position = start
  while (position < end) {
    const character = text[position]
    if (character === '\\') {
      position += 2
      continue
    }
    if (character === '`') {
      const run = (/^`+/.exec(segment.slice(position)) as RegExpExecArray)[0]
      const closing = new RegExp(`(?<!\`)${run}(?!\`)`, 'g')
      closing.lastIndex = position + run.length
      const close = closing.exec(segment)
      if (!close) {
        position += run.length
        continue
      }
      const content = text.slice(position + run.length, close.index)
      if (/^(?:= |\$=)/.test(content.trim()))
        markers.push({ start: position, kind: 'dataview', text: text.slice(position, close.index + run.length) })
      regions.push({ start: position, end: close.index + run.length, kind: 'code' })
      position = close.index + run.length
      continue
    }
    const delimiter = inlineDelimiters.find(([open]) => text.startsWith(open, position))
    const close = delimiter ? segment.indexOf(delimiter[1], position + delimiter[0].length) : -1
    // An unclosed comment hides the rest of the segment, as Obsidian and CommonMark read it; an unclosed
    // template delimiter is ordinary text.
    if (delimiter && (close >= 0 || delimiter[2] === 'comment')) {
      const stop = close < 0 ? end : close + delimiter[1].length
      regions.push({ start: position, end: stop, kind: delimiter[2] })
      position = stop
      continue
    }
    position++
  }
  return regions
}

/** Finds every region the converter must leave alone, and the callouts and Dataview it must list. */
export const scanMarkdown = (text: string): Scan => {
  const lines = linesOf(text)
  const markers: Marker[] = []
  const blocks = blockRegions(lines, markers)
  const regions: Region[] = []
  let cursor = 0
  for (const block of [...blocks, { start: text.length, end: text.length, kind: 'code' as const }]) {
    regions.push(...inlineRegions(text, cursor, block.start, markers))
    if (block.start < text.length) regions.push(block)
    cursor = block.end
  }
  const regionAt = (offset: number): RegionKind | undefined =>
    regions.find((region) => region.start <= offset && offset < region.end)?.kind
  for (const line of lines) {
    const callout = calloutLine.exec(line.text)
    if (!callout || regionAt(line.start)) continue
    const type = callout[1] as string
    const fold = callout[2] as string
    if (!GITHUB_ALERTS.has(type.toLowerCase()) || fold)
      markers.push({ start: line.start, kind: 'callout', text: `[!${type}]${fold}` })
  }
  markers.sort((left, right) => left.start - right.start)
  const lineAt = (offset: number): number => {
    let low = 0
    let high = lines.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if ((lines[middle] as Line).start <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }
  return { regions, markers, regionAt, lineAt }
}

/** GitHub's heading slug: rendered text, lowercased, punctuation removed and spaces hyphenated. */
const githubSlug = (heading: string): string =>
  heading
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')

/** ATX headings outside protected regions, each with its GitHub slug, duplicates numbered as GitHub numbers them. */
export const headingsOf = (text: string): Heading[] => {
  const scan = scanMarkdown(text)
  const seen = new Map<string, number>()
  const headings: Heading[] = []
  for (const line of linesOf(text)) {
    const match = atxHeading.exec(line.text.replace(/\r$/, ''))
    if (!match || scan.regionAt(line.start)) continue
    const heading = (match[1] as string).trim()
    const base = githubSlug(heading)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    headings.push({ text: heading, slug: count ? `${base}-${count}` : base })
  }
  return headings
}
