export type MirrorContent = 'extract' | 'pointer' | 'unknown' | null

export type SourceMirrorLabel = {
  mirror_content: MirrorContent
  source_path: string | null
  source_sha256: string | null
  word_count: number
  issues: readonly string[]
}

export const MINIMUM_MIRROR_WORDS = 40

/** Conservative eligibility check, not a YAML parser. Quoted values remain supported. */
export const ambiguousMirrorFrontmatter = (raw: string): boolean => {
  const seen = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    if (/^[ \t]/.test(line)) {
      if (/^\s*(?:<<|["']?source_(?:path|sha256)["']?)\s*:/.test(line)) return true
      continue
    }
    const match = /^([a-z][a-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (!match || seen.has(match[1]!)) return true
    seen.add(match[1]!)
    if (
      ['source_path', 'source_sha256'].includes(match[1]!) &&
      (/^[&*!>|[{]/.test(match[2]!) || match[2]!.includes('\\'))
    )
      return true
  }
  return false
}

/** Checks declarations only; callers reject duplicate YAML keys as malformed and never read source stores. */
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
  const wordCount = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  const empty: SourceMirrorLabel = {
    mirror_content: null,
    source_path: null,
    source_sha256: null,
    word_count: wordCount,
    issues: []
  }
  if (malformed || (frontmatter !== undefined && ambiguousMirrorFrontmatter(frontmatter)))
    return { ...empty, mirror_content: 'unknown', issues: ['malformed or unsupported frontmatter'] }
  if (!fields || (!Object.hasOwn(fields, 'source_path') && !Object.hasOwn(fields, 'source_sha256'))) return empty
  const path = typeof fields['source_path'] === 'string' ? fields['source_path'] : null
  const checksum = typeof fields['source_sha256'] === 'string' ? fields['source_sha256'] : null
  const issues: string[] = []
  if (
    !path ||
    path.length > 1024 ||
    /[\\:]/.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
    issues.push('missing or unsafe store-relative source_path')
  if (!checksum || !/^[0-9a-fA-F]{64}$/.test(checksum)) issues.push('missing or invalid source_sha256')
  if (wordCount < MINIMUM_MIRROR_WORDS) issues.push(`extract has fewer than ${MINIMUM_MIRROR_WORDS} words`)
  const provenanceValid = !issues.some((issue) => issue.includes('source_'))
  return {
    mirror_content: provenanceValid ? (wordCount >= MINIMUM_MIRROR_WORDS ? 'extract' : 'pointer') : 'unknown',
    source_path: path,
    source_sha256: checksum,
    word_count: wordCount,
    issues
  }
}
