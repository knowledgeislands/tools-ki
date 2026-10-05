export type MirrorContent = 'extract' | 'pointer' | 'unknown' | null

export const MIRROR_TYPES = ['verbatim', 'annotated', 'summarised', 'indexed'] as const
export type MirrorType = (typeof MIRROR_TYPES)[number]

export type SourceMirrorLabel = {
  mirror_content: MirrorContent
  mirrors: string | null
  mirror_type: MirrorType | null
  mirror_sha256: string | null
  word_count: number
  issues: readonly string[]
}

const MIRROR_KEYS = ['mirrors', 'mirror_type', 'mirror_sha256']

/** Conservative eligibility check, not a YAML parser. Quoted values remain supported. */
export const ambiguousMirrorFrontmatter = (raw: string): boolean => {
  const seen = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    if (/^[ \t]/.test(line)) {
      if (/^\s*(?:<<|["']?mirror(?:s|_type|_sha256)["']?)\s*:/.test(line)) return true
      continue
    }
    const match = /^([a-z][a-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (!match || seen.has(match[1]!)) return true
    seen.add(match[1]!)
    if (MIRROR_KEYS.includes(match[1]!) && (/^[&*!>|[{]/.test(match[2]!) || match[2]!.includes('\\'))) return true
  }
  return false
}

/** Checks mirror declarations only; `source_*` provenance is a separate relationship and never makes a mirror. */
export const classifySourceMirror = ({
  fields,
  body,
  malformed = false,
  frontmatter
}: {
  fields: Record<string, unknown> | null
  body: string
  malformed?: boolean
  frontmatter?: string
}): SourceMirrorLabel => {
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!?\[\[[\s\S]*?\]\]/g, '')
    .replace(/^\s*\[[^\]]+\]:.*$/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/^\s*[*_]*[\p{L}\p{N} ]{1,40}:[*_]*\s*$/gmu, '')
  const wordCount = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  const empty: SourceMirrorLabel = {
    mirror_content: null,
    mirrors: null,
    mirror_type: null,
    mirror_sha256: null,
    word_count: wordCount,
    issues: []
  }
  if (malformed || (frontmatter !== undefined && ambiguousMirrorFrontmatter(frontmatter)))
    return { ...empty, mirror_content: 'unknown', issues: ['malformed or unsupported frontmatter'] }
  if (!fields || !MIRROR_KEYS.some((key) => Object.hasOwn(fields, key))) return empty
  const path = typeof fields['mirrors'] === 'string' ? fields['mirrors'] : null
  const type = MIRROR_TYPES.find((value) => value === fields['mirror_type']) ?? null
  const checksum = typeof fields['mirror_sha256'] === 'string' ? fields['mirror_sha256'] : null
  const issues: string[] = []
  const segments = path?.split('/') ?? []
  if (
    !path ||
    path.length > 1024 ||
    /[\\:]/.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    segments.length < 2 ||
    !segments[0]!.endsWith('-sources') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  )
    issues.push('mirrors must name one file as <store-alias>-sources/<store-relative path>')
  if (!type) issues.push(`mirror_type must be one of ${MIRROR_TYPES.join(', ')}`)
  if (!checksum || !/^[0-9a-fA-F]{64}$/.test(checksum)) issues.push('missing or invalid mirror_sha256')
  const declarationValid = !issues.length
  if (type !== 'indexed' && !wordCount) issues.push('mirror body has no content')
  return {
    mirror_content: !declarationValid ? 'unknown' : type !== 'indexed' && wordCount ? 'extract' : 'pointer',
    mirrors: path,
    mirror_type: type,
    mirror_sha256: checksum,
    word_count: wordCount,
    issues
  }
}
