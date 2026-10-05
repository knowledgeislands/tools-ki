import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { ambiguousMirrorFrontmatter, classifySourceMirror } from './source-mirrors.ts'

export const ENGINE = { name: 'qmd', version: '2.8.3', revision: 'facd35e01359e59d938bc9418e93fb9318addee3' } as const
export const ZONES = ['Calendar', 'Pillars', 'Resources', 'Streams', 'Admin', 'inbound', 'outbound'] as const
export const CANDIDATE_LIMIT = 200
export const SOURCE_BYTES = 1024 * 1024
export const RESPONSE_BYTES = 2 * 1024 * 1024
export const CORPUS_BYTES = 100 * 1024 * 1024
export const safeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value) && value.length <= 128
export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const hasControl = (value: string): boolean =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
export const safePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 1024 &&
  !/[\\:]/.test(value) &&
  !hasControl(value) &&
  value.split('/').every((part) => Boolean(part) && part !== '..' && !part.startsWith('.'))
export const fail = (message: string): never => {
  throw new Error(`KB search unavailable: ${message}`)
}
export const inside = (root: string, path: string): boolean => {
  const part = relative(root, path)
  return !isAbsolute(part) && part !== '..' && !part.startsWith('../')
}
export const loopback = (value: unknown): string => {
  if (typeof value !== 'string' || !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}$/.test(value))
    return fail('endpoint must be an explicit numeric loopback HTTP origin')
  const port = Number(value.slice(value.lastIndexOf(':') + 1))
  if (port > 65535) return fail('invalid loopback endpoint port')
  return value
}
export type SearchMode = 'query' | 'search' | 'vsearch'
export type SearchRequest = { query: string; mode: SearchMode; limit: number; zone?: string; pathPrefix?: string }
export type SearchMapping = {
  schema: 'ki/kb-search/v1'
  registry_id: string
  repository: string
  root: string
  trust_boundary: string
  index: string
  generation: string
  engine: typeof ENGINE
  collections: string[]
  purpose: { title: string; description: string }
  zones: Record<string, string>
  declaration_sha256: string
  projection: string
  config: string
  database: string
  model_cache: string
  daemon_url: string | null
  source_store_declared: boolean
  source_store_binding_declared: boolean
  documents: Record<string, { path: string; sha256: string }>
}
export const validateRequest = (request: SearchRequest): void => {
  if (
    typeof request.query !== 'string' ||
    !request.query.trim() ||
    Buffer.byteLength(request.query) > 1024 ||
    hasControl(request.query)
  )
    fail('query must contain 1–1024 bytes of plain text')
  if (!['query', 'search', 'vsearch'].includes(request.mode)) fail('mode must be query, search or vsearch')
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 50)
    fail('limit must be an integer from 1 to 50')
  if (request.zone !== undefined && !(ZONES as readonly string[]).includes(request.zone)) fail('unknown zone')
  if (request.pathPrefix !== undefined && !safePath(request.pathPrefix)) fail('unsafe path prefix')
}
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join('|') === [...keys].sort().join('|')
export const validateMapping = (value: unknown, stateDirectory: string, id: string): SearchMapping => {
  const fields = [
    'schema',
    'registry_id',
    'repository',
    'root',
    'trust_boundary',
    'index',
    'generation',
    'engine',
    'collections',
    'purpose',
    'zones',
    'declaration_sha256',
    'projection',
    'config',
    'database',
    'model_cache',
    'daemon_url',
    'source_store_declared',
    'source_store_binding_declared',
    'documents'
  ]
  if (!record(value) || !exactKeys(value, fields)) return fail('invalid mapping fields')
  const m = value as unknown as SearchMapping
  const index = `ki-kb-${id}`
  if (
    m.schema !== 'ki/kb-search/v1' ||
    !safeId(id) ||
    m.registry_id !== id ||
    !safeId(m.trust_boundary) ||
    !safeId(m.generation) ||
    m.index !== index ||
    !/^https:\/\/github\.com\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(m.repository) ||
    typeof m.root !== 'string' ||
    !isAbsolute(m.root)
  )
    return fail('invalid mapping identity')
  if (
    !record(m.engine) ||
    !exactKeys(m.engine, Object.keys(ENGINE)) ||
    Object.entries(ENGINE).some(([key, entry]) => m.engine[key as keyof typeof ENGINE] !== entry)
  )
    return fail('unsupported engine pin')
  if (!Array.isArray(m.collections) || m.collections.length !== 1 || m.collections[0] !== index)
    return fail('invalid collection assignment')
  if (
    !record(m.purpose) ||
    !exactKeys(m.purpose, ['title', 'description']) ||
    Object.values(m.purpose).some((entry) => typeof entry !== 'string' || !entry.trim() || entry.length > 4096)
  )
    return fail('invalid declared purpose')
  if (!record(m.zones) || !exactKeys(m.zones, ZONES) || Object.values(m.zones).some((entry) => !safePath(entry)))
    return fail('invalid zone map')
  const zones = Object.values(m.zones)
  if (zones.some((zone, i) => zones.some((other, j) => i !== j && (zone === other || zone.startsWith(`${other}/`)))))
    return fail('overlapping zones')
  const generation = join(stateDirectory, 'search', id, 'generations', m.generation)
  if (
    m.projection !== join(generation, 'projection') ||
    m.config !== join(generation, 'config', `${index}.yml`) ||
    m.database !== join(generation, 'index.sqlite') ||
    typeof m.model_cache !== 'string' ||
    !isAbsolute(m.model_cache) ||
    !digest(m.declaration_sha256)
  )
    return fail('invalid generation paths')
  if (m.daemon_url !== null) loopback(m.daemon_url)
  if (
    typeof m.source_store_declared !== 'boolean' ||
    typeof m.source_store_binding_declared !== 'boolean' ||
    !record(m.documents) ||
    Object.keys(m.documents).length > 10000
  )
    return fail('invalid mapping provenance')
  const paths = new Set<string>()
  for (const [key, doc] of Object.entries(m.documents)) {
    if (
      !record(doc) ||
      !exactKeys(doc, ['path', 'sha256']) ||
      !safePath(doc.path) ||
      !doc.path.endsWith('.md') ||
      !digest(doc.sha256) ||
      key !== `documents/${sha256(doc.path)}.md` ||
      paths.has(doc.path) ||
      !zones.some((zone) => doc.path.startsWith(`${zone}/`))
    )
      return fail('invalid document mapping')
    paths.add(doc.path)
  }
  return m
}

/** Checks every ancestor before opening bytes; no source-store paths participate. */
export const scopedFile = async (root: string, path: string): Promise<Buffer> => {
  if (!safePath(path)) return fail('unsafe source path')
  let current = root
  const parts = path.split('/')
  for (const [i, part] of parts.entries()) {
    current = join(current, part)
    const stat = await lstat(current).catch(() => fail('source is missing'))
    if (
      stat.isSymbolicLink() ||
      (i === parts.length - 1 ? !stat.isFile() || stat.size > SOURCE_BYTES : !stat.isDirectory())
    )
      return fail('unsafe or oversized source')
    if (
      i < parts.length - 1 &&
      ((await lstat(join(current, '.ki.toml')).catch(() => undefined)) ||
        (await lstat(join(current, '.git')).catch(() => undefined)))
    )
      return fail('nested repository source')
  }
  if (!inside(root, await realpath(current))) return fail('source escaped its root')
  const bytes = await readFile(current)
  if (bytes.length > SOURCE_BYTES || bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes))
    return fail('unsafe or oversized source bytes')
  return bytes
}
export const currentSources = async (mapping: SearchMapping): Promise<Map<string, string>> => {
  if ((await realpath(mapping.root)) !== mapping.root) return fail('root identity changed')
  const declaration = await lstat(join(mapping.root, '.ki.toml'))
  if (
    !declaration.isFile() ||
    declaration.isSymbolicLink() ||
    declaration.size > SOURCE_BYTES ||
    sha256(await readFile(join(mapping.root, '.ki.toml'))) !== mapping.declaration_sha256
  )
    return fail('declaration changed')
  const sources = new Map<string, string>()
  let total = 0
  for (const [key, document] of Object.entries(mapping.documents)) {
    const bytes = await scopedFile(mapping.root, document.path)
    total += bytes.length
    if (total > CORPUS_BYTES) return fail('corpus exceeds the bounded search allowance')
    if (sha256(bytes) !== document.sha256) return fail('source changed; refresh the index')
    sources.set(key, bytes.toString('utf8'))
  }
  return sources
}
export const modelPaths = (cache: string) => ({
  embed: join(cache, 'qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf'),
  rerank: join(cache, 'qmd/models/hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf'),
  generate: join(cache, 'qmd/models/hf_tobil_qmd-query-expansion-1.7B-q4_k_m.gguf')
})
export const requireModels = async (
  mapping: SearchMapping,
  mode: SearchMode,
  transport: 'cli' | 'http'
): Promise<void> => {
  const paths = modelPaths(mapping.model_cache)
  const names: (keyof typeof paths)[] =
    mode === 'search'
      ? []
      : mode === 'vsearch'
        ? ['embed']
        : transport === 'cli'
          ? ['embed', 'rerank', 'generate']
          : ['embed', 'rerank']
  for (const name of names) {
    const stat = await lstat(paths[name]).catch(() => undefined)
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size === 0)
      fail(`provision the pinned ${name} model explicitly`)
  }
}
const provenance = (source: string) => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!front)
    return classifySourceMirror({
      fields: null,
      body: source,
      malformed: source.startsWith('---\n') || source.startsWith('---\r\n')
    })
  if (ambiguousMirrorFrontmatter(front[1]!))
    return classifySourceMirror({ fields: null, body: source.slice(front[0].length), malformed: true })
  const parsed = parseDocument(front[1]!, { uniqueKeys: true })
  const fields: unknown = parsed.toJS()
  return classifySourceMirror({
    fields: record(fields) ? fields : null,
    body: source.slice(front[0].length),
    frontmatter: front[1],
    malformed: parsed.errors.length > 0 || !record(fields)
  })
}
const safeMirror = (path: string | null): string | null =>
  path &&
  path.length <= 1024 &&
  !/[\\:]/.test(path) &&
  !hasControl(path) &&
  path.split('/').length > 1 &&
  path.split('/')[0]!.endsWith('-sources') &&
  path.split('/').every((part) => Boolean(part) && part !== '.' && part !== '..')
    ? path
    : null
export const authenticateResults = (
  mapping: SearchMapping,
  sources: Map<string, string>,
  raw: unknown,
  request: SearchRequest,
  transport: 'cli' | 'http'
) => {
  if (!Array.isArray(raw) || raw.length > CANDIDATE_LIMIT) return fail('invalid candidate list')
  const seen = new Set<string>()
  const results = raw
    .map((candidate: unknown) => {
      if (
        !record(candidate) ||
        Object.keys(candidate).some(
          (key) => !['docid', 'score', 'file', 'line', 'title', 'context', 'snippet'].includes(key)
        ) ||
        typeof candidate['file'] !== 'string' ||
        typeof candidate['score'] !== 'number' ||
        !Number.isFinite(candidate['score']) ||
        typeof candidate['docid'] !== 'string'
      )
        return fail('invalid candidate')
      const prefix = `qmd://${mapping.index}/`
      const suffix = transport === 'cli' ? `?index=${mapping.index}` : ''
      const file = candidate['file']
      const key = file.slice(prefix.length, suffix ? -suffix.length : undefined)
      if (
        !file.startsWith(prefix) ||
        !file.endsWith(suffix) ||
        !/^documents\/[0-9a-f]{64}\.md$/.test(key) ||
        !Object.hasOwn(mapping.documents, key) ||
        seen.has(key)
      )
        return fail('candidate is outside the assigned collection')
      seen.add(key)
      const doc = mapping.documents[key]!
      if (candidate['docid'] !== `#${doc.sha256.slice(0, 6)}`) return fail('candidate content fingerprint mismatch')
      const source = sources.get(key)!
      const lines = source.split(/\r?\n/)
      const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)
      const incompleteFrontmatter = !front && /^---\r?\n/.test(source)
      const bodyStart = front ? front[0].split(/\r?\n/).length - 1 : incompleteFrontmatter ? lines.length : 0
      const terms = request.query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
      const matched = lines.findIndex(
        (line, i) => i >= bodyStart && terms.some((term) => line.toLocaleLowerCase().includes(term))
      )
      const start = incompleteFrontmatter ? 0 : matched >= 0 ? matched : Math.min(bodyStart, lines.length - 1)
      const window: string[] = []
      if (!incompleteFrontmatter)
        for (const line of lines.slice(start, start + 8)) {
          if (window.join('\n').length + line.length + 1 > 1600) break
          window.push(line)
        }
      const end = start + Math.max(1, window.length)
      const label = provenance(source)
      return {
        path: doc.path,
        title: (
          lines
            .slice(bodyStart)
            .find((line) => /^# /.test(line))
            ?.slice(2)
            .trim() || doc.path.split('/').at(-1)!.slice(0, -3)
        ).slice(0, 256),
        snippet: window.join('\n'),
        score: candidate['score'],
        docid: `#${doc.sha256.slice(0, 6)}`,
        line_start: start + 1,
        line_end: end,
        mirror_content: label.mirror_content,
        mirrors: safeMirror(label.mirrors),
        mirror_type: label.mirror_type,
        mirror_sha256: label.mirror_sha256 && /^[0-9a-fA-F]{64}$/.test(label.mirror_sha256) ? label.mirror_sha256 : null
      }
    })
    .filter(
      (result) =>
        (!request.zone || result.path.startsWith(`${mapping.zones[request.zone]}/`)) &&
        (!request.pathPrefix || result.path === request.pathPrefix || result.path.startsWith(`${request.pathPrefix}/`))
    )
  return {
    schema: 'ki/kb-search-result/v1' as const,
    registry_id: mapping.registry_id,
    trust_boundary: mapping.trust_boundary,
    index: mapping.index,
    generation: mapping.generation,
    mode: request.mode,
    profile: `${transport}-${request.mode === 'query' ? (transport === 'cli' ? 'expanded-hybrid-rerank' : 'lex-vec-rerank') : request.mode === 'search' ? 'lexical' : 'vector'}`,
    candidate_limit: CANDIDATE_LIMIT,
    exhaustive: false as const,
    truncated: raw.length === CANDIDATE_LIMIT || results.length > request.limit,
    source_store_declared: mapping.source_store_declared,
    source_store_binding_declared: mapping.source_store_binding_declared,
    results: results.slice(0, request.limit)
  }
}

export const boundedJson = async (
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  init?: RequestInit
): Promise<unknown> => {
  const response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > RESPONSE_BYTES)
    return fail('daemon transport failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.length
      if (length > RESPONSE_BYTES) fail('daemon response too large')
      chunks.push(item.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally {
    await reader.cancel()
  }
}
export const assertOwnedPath = async (state: string, path: string): Promise<void> => {
  if (!inside(state, path)) fail('derived path escaped state')
  let current = resolve(state)
  for (const part of relative(state, path).split('/')) {
    current = join(current, part)
    const stat = await lstat(current).catch(() => fail('derived state missing'))
    if (stat.isSymbolicLink()) fail('derived state symlink')
  }
  if ((await realpath(path)) !== path) fail('derived state ancestry changed')
}
