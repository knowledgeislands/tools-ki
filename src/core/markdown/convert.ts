import { posix } from 'node:path'
import { type Heading, type RegionKind, scanMarkdown } from './scan.ts'
import { type Resolution, resolveTarget, type Vault } from './vault.ts'

/** What the converter could not carry without an owner's judgement, left untouched and listed. */
export type ItemKind =
  | 'ambiguous'
  | 'unresolved'
  | 'heading-link'
  | 'missing-heading'
  | 'block-reference'
  | 'sized-embed'
  | 'transclusion'
  | 'front-matter-link'
  | 'template-destination'
  | 'comment-link'
  | 'callout'
  | 'dataview'
  | 'protected'
  | 'generated'
  | 'encoding'

export interface Item {
  readonly line: number
  readonly kind: ItemKind
  readonly text: string
  readonly candidates?: readonly string[]
  /** How the owner decided it; an undecided item refuses the batch at apply. */
  readonly decision?: 'keep' | 'convert'
}

export interface Conversion {
  readonly line: number
  readonly start: number
  readonly end: number
  readonly before: string
  readonly after: string
}

export interface FilePlan {
  readonly path: string
  readonly input: string
  readonly output: string
  readonly conversions: readonly Conversion[]
  readonly items: readonly Item[]
}

/** The owner's per-batch decisions, keyed by file and the item's exact text. */
export interface Decisions {
  readonly headingFragments: boolean
  readonly protectedPaths: readonly string[]
  readonly find: (
    path: string,
    text: string
  ) => { readonly action: 'keep' | 'convert'; readonly target?: string } | undefined
}

export interface PlanContext {
  readonly vault: Vault
  readonly decisions: Decisions
  readonly headings: (path: string) => Promise<readonly Heading[] | undefined>
}

const IMAGE = /\.(?:png|jpe?g|gif|svg|webp|bmp|avif)$/i
const SIZE = /^\s*\d+(?:\s*x\s*\d+)?\s*$/
const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g
/** A Markdown link whose bare destination may hold one level of balanced parentheses, as Obsidian writes it. */
const MARKDOWN_LINK = /(!?)\[((?:\\.|[^\\[\]\n])*)\]\(((?:[^()\s<>]|\([^()\s<>]*\))+)\)/g
const REGION_ITEMS: Partial<Record<RegionKind, ItemKind>> = {
  'front-matter': 'front-matter-link',
  comment: 'comment-link',
  template: 'template-destination'
}

/** The link text a reader sees, escaped so GitHub renders it literally. */
const escapeLabel = (label: string): string =>
  [...label]
    .map((character, index, characters) => {
      if ('\\[]*`<~'.includes(character)) return `\\${character}`
      if (character !== '_') return character
      const word = /[\p{L}\p{N}]/u
      return word.test(characters[index - 1] ?? ' ') && word.test(characters[index + 1] ?? ' ') ? '_' : '\\_'
    })
    .join('')

/** A document-relative destination, percent-encoding what a URL would misread, bracketed when it holds a space. */
const destination = (source: string, target: string, fragment: string | undefined): string => {
  const relative = target === source && fragment !== undefined ? '' : posix.relative(posix.dirname(source), target)
  const path = relative.replace(/[%#?<>]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  const full = `${path}${fragment === undefined ? '' : `#${fragment}`}`
  return /[\s()]/.test(full) ? `<${full}>` : full
}

interface Link {
  readonly image: boolean
  /** The text a reader sees, unescaped. */
  readonly label: string
  readonly target: string
  readonly fragment?: string
}

/* v8 ignore start -- Defence in depth: the renderers below always produce links this check accepts; it guards
   a future change to label escaping or destination encoding from writing a link that points elsewhere. */
const verify = (vault: Vault, source: string, after: string, link: Link): string => {
  const parsed = /^(!?)\[((?:\\.|[^\\[\]])*)\]\((?:<((?:\\.|[^\\<>])*)>|([^\s<>]*))\)$/.exec(after)
  const written = parsed?.[3] ?? parsed?.[4] ?? ''
  const hash = written.indexOf('#')
  const path = decodeURIComponent(hash < 0 ? written : written.slice(0, hash))
  const target = path ? posix.normalize(posix.join(posix.dirname(source), path)) : source
  const actual: Link = {
    image: parsed?.[1] === '!',
    label: parsed?.[2]?.replace(/\\(.)/g, '$1') ?? '',
    target: vault.files.has(target) ? target : '',
    ...(hash < 0 ? {} : { fragment: written.slice(hash + 1) })
  }
  if (JSON.stringify(actual) !== JSON.stringify(link))
    throw new Error(`ki markdown gfm: verification failed in ${source}: ${after}`)
  return after
}
/* v8 ignore stop */

const render = (vault: Vault, source: string, link: Link): string =>
  verify(
    vault,
    source,
    `${link.image ? '!' : ''}[${escapeLabel(link.label)}](${destination(source, link.target, link.fragment)})`,
    link
  )

interface Wikilink {
  readonly image: boolean
  readonly path: string
  readonly subpath?: string
  readonly alias?: string
}

const parseWikilink = (image: boolean, body: string): Wikilink => {
  const separator = body.indexOf('|')
  const escaped = separator > 0 && body[separator - 1] === '\\'
  const reference = separator < 0 ? body : body.slice(0, escaped ? separator - 1 : separator)
  const hash = reference.indexOf('#')
  return {
    image,
    path: (hash < 0 ? reference : reference.slice(0, hash)).trim(),
    ...(hash < 0 ? {} : { subpath: reference.slice(hash + 1).trim() }),
    ...(separator < 0 ? {} : { alias: body.slice(separator + 1).trim() })
  }
}

type Outcome = { readonly link: Link } | { readonly kind: ItemKind; readonly candidates?: readonly string[] }

const resolved = (resolution: Resolution): Outcome | string =>
  resolution.kind === 'resolved'
    ? resolution.path
    : resolution.kind === 'ambiguous'
      ? { kind: 'ambiguous', candidates: resolution.candidates }
      : { kind: 'unresolved' }

/** Decides how one wikilink converts, or which item kind lists it. */
const classify = async (
  context: PlanContext,
  source: string,
  wikilink: Wikilink,
  chosen?: string
): Promise<Outcome> => {
  const { image, path, subpath, alias } = wikilink
  if (subpath?.startsWith('^')) return { kind: 'block-reference' }
  if (image && (subpath !== undefined || !IMAGE.test(path))) return { kind: 'transclusion' }
  if (image && alias?.split('|').some((part) => SIZE.test(part))) return { kind: 'sized-embed' }
  if (subpath !== undefined && !context.decisions.headingFragments) return { kind: 'heading-link' }
  const target = chosen ?? (path ? resolved(resolveTarget(context.vault, source, path)) : source)
  if (typeof target !== 'string') return target
  if (image) return { link: { image, label: alias ?? posix.basename(path), target } }
  if (subpath === undefined) return { link: { image, label: alias ?? path, target } }
  const headings = (await context.headings(target)) ?? []
  const heading =
    headings.find((candidate) => candidate.text === subpath) ??
    headings.find((candidate) => candidate.text.toLowerCase() === subpath.toLowerCase())
  if (!heading) return { kind: 'missing-heading' }
  return { link: { image, label: alias ?? (path ? `${path} > ${subpath}` : subpath), target, fragment: heading.slug } }
}

/** Respells a relative Markdown link's Obsidian `%20` as a bracketed space, keeping other escapes and the fragment. */
const percentLink = (vault: Vault, source: string, match: RegExpExecArray): string | undefined => {
  const bang = match[1] as string
  const label = match[2] as string
  const written = match[3] as string
  const hash = written.indexOf('#')
  const path = hash < 0 ? written : written.slice(0, hash)
  let target: string
  try {
    target = posix.normalize(posix.join(posix.dirname(source), decodeURIComponent(path)))
  } catch {
    return undefined
  }
  if (!vault.files.has(target)) return undefined
  return verify(vault, source, `${bang}[${label}](<${path.replaceAll('%20', ' ')}${written.slice(path.length)}>)`, {
    image: bang === '!',
    label: label.replace(/\\(.)/g, '$1'),
    target,
    ...(hash < 0 ? {} : { fragment: written.slice(hash + 1) })
  })
}

/** Plans one file: its converted text, every conversion, and every item left for judgement. */
export const planFile = async (context: PlanContext, path: string, bytes: Buffer): Promise<FilePlan> => {
  const input = bytes.toString('utf8')
  const unconverted = (kind: ItemKind): FilePlan => ({
    path,
    input,
    output: input,
    conversions: [],
    items: [{ line: 1, kind, text: path }]
  })
  if (!Buffer.from(input, 'utf8').equals(bytes)) return unconverted('encoding')
  if (
    path.split('/').includes('_Voice Notes') ||
    context.decisions.protectedPaths.some((entry) => path === entry || path.startsWith(`${entry}/`))
  )
    return unconverted('protected')
  if (/^\uFEFF?<!--\s*generated\b/i.test(input)) return unconverted('generated')

  const scan = scanMarkdown(input)
  const conversions: Conversion[] = []
  const items: Item[] = []
  const note = (start: number, kind: ItemKind, text: string, candidates?: readonly string[]): void => {
    const decided = context.decisions.find(path, text)
    items.push({
      line: scan.lineAt(start),
      kind,
      text,
      ...(candidates ? { candidates } : {}),
      ...(decided?.action === 'keep' ? { decision: 'keep' } : {})
    })
  }
  for (const marker of scan.markers) note(marker.start, marker.kind, marker.text)

  for (const match of input.matchAll(WIKILINK)) {
    const start = match.index
    const before = match[0]
    if (escapedAt(input, start)) continue
    const region = scan.regionAt(start)
    if (region === 'code') continue
    const regionItem = region ? REGION_ITEMS[region] : undefined
    if (regionItem || /\{\{|<%/.test(before)) {
      note(start, regionItem ?? 'template-destination', before)
      continue
    }
    const wikilink = parseWikilink(match[1] === '!', match[2] as string)
    const decided = context.decisions.find(path, before)
    let outcome = await classify(context, path, wikilink)
    if (
      'kind' in outcome &&
      decided?.action === 'convert' &&
      (outcome.kind === 'ambiguous' || outcome.kind === 'unresolved')
    )
      outcome = await classify(context, path, wikilink, decided.target)
    if ('kind' in outcome) {
      note(start, outcome.kind, before, outcome.candidates)
      continue
    }
    conversions.push({
      line: scan.lineAt(start),
      start,
      end: start + before.length,
      before,
      after: render(context.vault, path, outcome.link)
    })
  }
  for (const match of input.matchAll(MARKDOWN_LINK)) {
    const start = match.index
    const written = match[3] as string
    if (!written.includes('%20') || escapedAt(input, start) || scan.regionAt(start)) continue
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(written)) continue
    const after = percentLink(context.vault, path, match)
    if (after === undefined) note(start, 'unresolved', match[0])
    else conversions.push({ line: scan.lineAt(start), start, end: start + match[0].length, before: match[0], after })
  }
  conversions.sort((left, right) => left.start - right.start)
  items.sort((left, right) => left.line - right.line)
  return { path, input, output: splice(input, conversions), conversions, items }
}

/** Replaces each converted span, then checks every byte outside the spans is unchanged. */
const splice = (input: string, conversions: readonly Conversion[]): string => {
  let output = ''
  let cursor = 0
  const outside: string[] = []
  for (const conversion of conversions) {
    outside.push(input.slice(cursor, conversion.start))
    output += `${input.slice(cursor, conversion.start)}${conversion.after}`
    cursor = conversion.end
  }
  output += input.slice(cursor)
  outside.push(input.slice(cursor))
  /* v8 ignore start -- Defence in depth: the splice above copies every unconverted byte, so this cannot fail today. */
  let position = 0
  for (const [index, text] of outside.entries()) {
    if (output.slice(position, position + text.length) !== text)
      throw new Error('ki markdown gfm: preservation check failed outside the converted spans')
    position += text.length + (conversions[index]?.after.length ?? 0)
  }
  /* v8 ignore stop */
  return output
}

const escapedAt = (text: string, offset: number): boolean => {
  let count = 0
  while (text[offset - count - 1] === '\\') count++
  return count % 2 === 1
}
