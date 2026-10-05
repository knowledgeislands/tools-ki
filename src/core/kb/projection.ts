import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { stringify } from 'yaml'
import { prepareWrites, publishWrites } from '../filesystem/index.ts'
import { kbAuthority } from './authority.ts'
import {
  assertOwnedPath,
  CORPUS_BYTES,
  ENGINE,
  fail,
  modelPaths,
  type SearchMapping,
  safePath,
  scopedFile,
  sha256,
  validateMapping
} from './contract.ts'

const OWNER = 'ki/kb-search-owned/v1\n'
export const qmdConfiguration = (mapping: SearchMapping): string =>
  stringify({
    collections: {
      [mapping.index]: {
        path: mapping.projection,
        pattern: '**/*.md',
        context: { '/': `${mapping.purpose.title}: ${mapping.purpose.description}` },
        includeByDefault: true
      }
    },
    models: modelPaths(mapping.model_cache)
  })
const privateDirectory = async (path: string): Promise<void> => {
  const stat = await lstat(path).catch(() => undefined)
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) return fail('unsafe derived directory')
  if (!stat) await mkdir(path, { mode: 0o700 })
}
export const ownedDirectory = async (state: string, id: string): Promise<string> => {
  await mkdir(state, { recursive: true })
  if ((await realpath(state)) !== state) return fail('unsafe state ancestry')
  const search = join(state, 'search')
  const base = join(search, id)
  await privateDirectory(search)
  const existing = await lstat(base).catch(() => undefined)
  if (existing) {
    await assertOwnedPath(state, base)
    const marker = await lstat(join(base, '.owner')).catch(() => undefined)
    if (!marker?.isFile() || marker.isSymbolicLink() || (await readFile(join(base, '.owner'), 'utf8')) !== OWNER)
      return fail('unmanaged search state collision')
    if (!existing.isDirectory() || existing.mode & 0o077) return fail('search state must be a private owned directory')
  } else {
    await mkdir(base, { mode: 0o700 })
    await writeFile(join(base, '.owner'), OWNER, { flag: 'wx', mode: 0o600 })
  }
  await privateDirectory(join(base, 'generations'))
  return base
}
export const createProjection = async (
  state: string,
  cache: string,
  id: string | undefined,
  cwd: string,
  daemon: string | null
): Promise<SearchMapping> => {
  const authority = await kbAuthority(state, id, cwd)
  const registry_id = authority.entry.key
  const index = `ki-kb-${registry_id}`
  const generation = randomUUID()
  const base = await ownedDirectory(state, registry_id)
  const directory = join(base, 'generations', generation)
  await mkdir(directory, { mode: 0o700 })
  const mapping = validateMapping(
    {
      schema: 'ki/kb-search/v1',
      registry_id,
      repository: authority.entry.repository,
      root: authority.entry.path,
      trust_boundary: authority.entry.searchBoundary,
      index,
      generation,
      engine: ENGINE,
      collections: [index],
      purpose: authority.purpose,
      zones: authority.zones,
      declaration_sha256: authority.declaration_sha256,
      projection: join(directory, 'projection'),
      config: join(directory, 'config', `${index}.yml`),
      database: join(directory, 'index.sqlite'),
      model_cache: cache,
      daemon_url: daemon,
      source_store_declared: authority.source_store_declared,
      source_store_binding_declared: authority.source_store_binding_declared,
      documents: {}
    },
    state,
    registry_id
  )
  await mkdir(join(directory, 'config'), { mode: 0o700 })
  await mkdir(mapping.projection, { mode: 0o700 })
  await mkdir(join(mapping.projection, 'documents'), { mode: 0o700 })
  let corpusBytes = 0
  let entries = 0
  let documentCount = 0
  const visit = async (path: string): Promise<void> => {
    if (++entries > 20000) return fail('projection walk exceeds its bounded allowance')
    const stat = await lstat(path).catch(() => undefined)
    if (!stat || stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      if (
        (await lstat(join(path, '.ki.toml')).catch(() => undefined)) ||
        (await lstat(join(path, '.git')).catch(() => undefined))
      )
        return
      for (const entry of await readdir(path)) if (!entry.startsWith('.')) await visit(join(path, entry))
    } else if (stat.isFile() && path.endsWith('.md')) {
      const original = relative(mapping.root, path)
      if (!safePath(original)) return
      if (++documentCount > 10000) return fail('too many source documents')
      const bytes = await scopedFile(mapping.root, original)
      corpusBytes += bytes.length
      if (corpusBytes > CORPUS_BYTES) return fail('corpus exceeds the bounded search allowance')
      const projected = `documents/${sha256(original)}.md`
      mapping.documents[projected] = { path: original, sha256: sha256(bytes) }
      await writeFile(join(mapping.projection, projected), bytes, { flag: 'wx', mode: 0o600 })
    }
  }
  for (const zone of Object.values(mapping.zones)) {
    // Configured multi-segment zones receive the same ancestry checks as documents.
    let ancestor = mapping.root
    let eligible = true
    for (const part of zone.split('/')) {
      ancestor = join(ancestor, part)
      const stat = await lstat(ancestor).catch(() => undefined)
      if (stat?.isSymbolicLink()) return fail('configured zone ancestry contains a symlink')
      if (
        !stat?.isDirectory() ||
        (await lstat(join(ancestor, '.ki.toml')).catch(() => undefined)) ||
        (await lstat(join(ancestor, '.git')).catch(() => undefined))
      ) {
        eligible = false
        break
      }
    }
    if (eligible) await visit(join(mapping.root, zone))
  }
  await writeFile(mapping.config, qmdConfiguration(mapping), { flag: 'wx', mode: 0o600 })
  return mapping
}
export const publishMapping = async (state: string, mapping: SearchMapping): Promise<string> => {
  const base = join(state, 'search', mapping.registry_id)
  await assertOwnedPath(state, base)
  await assertOwnedPath(state, join(base, '.owner'))
  if ((await readFile(join(base, '.owner'), 'utf8')) !== OWNER)
    return fail('search ownership changed before publication')
  if ((await lstat(base)).mode & 0o077) return fail('search state must remain private')
  const path = join(base, 'mapping.json')
  const previous = await lstat(path).catch(() => undefined)
  if (previous && (!previous.isFile() || previous.isSymbolicLink())) return fail('unsafe mapping destination')
  if (previous) {
    if (previous.size > 4 * 1024 * 1024) return fail('unmanaged mapping collision')
    let value: unknown
    try {
      value = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return fail('unmanaged mapping collision')
    }
    validateMapping(value, state, mapping.registry_id)
  }
  const writes = await prepareWrites(base, [
    {
      path: 'mapping.json',
      content: `${JSON.stringify(mapping, null, 2)}\n`,
      mode: 0o600,
      ...(!previous ? { create: true } : {})
    }
  ])
  await publishWrites(writes, false)
  return path
}
export const loadMapping = async (state: string, id: string | undefined, cwd: string): Promise<SearchMapping> => {
  const authority = await kbAuthority(state, id, cwd)
  const base = join(state, 'search', authority.entry.key)
  await assertOwnedPath(state, base)
  await assertOwnedPath(state, join(base, '.owner'))
  if ((await lstat(base)).mode & 0o077) return fail('search state must remain private')
  if ((await readFile(join(base, '.owner'), 'utf8')) !== OWNER) return fail('unmanaged search state')
  const path = join(base, 'mapping.json')
  await assertOwnedPath(state, path)
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) return fail('invalid mapping file')
  const mapping = validateMapping(JSON.parse(await readFile(path, 'utf8')), state, authority.entry.key)
  if (
    mapping.root !== authority.entry.path ||
    mapping.repository !== authority.entry.repository ||
    mapping.trust_boundary !== authority.entry.searchBoundary ||
    mapping.declaration_sha256 !== authority.declaration_sha256 ||
    JSON.stringify(mapping.zones) !== JSON.stringify(authority.zones) ||
    mapping.source_store_declared !== authority.source_store_declared ||
    mapping.source_store_binding_declared !== authority.source_store_binding_declared
  )
    return fail('mapping authority changed; refresh the index')
  for (const path of [mapping.projection, mapping.config, mapping.database]) await assertOwnedPath(state, path)
  const configStat = await lstat(mapping.config)
  if (
    !configStat.isFile() ||
    configStat.size > 65536 ||
    (await readFile(mapping.config, 'utf8')) !== qmdConfiguration(mapping)
  )
    return fail('derived config changed')
  if (!(await lstat(mapping.database)).isFile()) return fail('missing derived database')
  // Projection is still the exact private authorised input, including no unexpected files.
  await assertOwnedPath(state, join(mapping.projection, 'documents'))
  const names = await readdir(join(mapping.projection, 'documents'))
  if (
    (await readdir(mapping.projection)).join('|') !== 'documents' ||
    names.length !== Object.keys(mapping.documents).length
  )
    return fail('projection changed')
  for (const [key, document] of Object.entries(mapping.documents)) {
    await assertOwnedPath(state, join(mapping.projection, key))
    const stat = await lstat(join(mapping.projection, key))
    if (
      !stat.isFile() ||
      stat.size > 1024 * 1024 ||
      sha256(await readFile(join(mapping.projection, key))) !== document.sha256
    )
      return fail('projection content changed')
  }
  return mapping
}
export const privatizeDatabase = async (mapping: SearchMapping): Promise<void> => {
  await chmod(mapping.database, 0o600)
}
