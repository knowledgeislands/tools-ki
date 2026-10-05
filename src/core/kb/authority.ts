import { lstat, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryKind,
  declaredRepositoryMetadata,
  parseRepositoryDeclaration
} from '../configuration/declaration.ts'
import { requiredLocalRegistry } from '../storage/local-registry.ts'
import { fail, record, safeId, sha256, ZONES } from './contract.ts'

export const kbAuthority = async (state: string, id: string | undefined, cwd: string) => {
  if (id !== undefined && !safeId(id)) return fail('invalid registry ID')
  const entries = await requiredLocalRegistry(state)
  const entry = entries.find((candidate) => (id ? candidate.key === id : candidate.path === cwd))
  if (!entry || !entry.searchBoundary) return fail('explicit registered KB boundary required')
  if ((await realpath(entry.path)) !== entry.path) return fail('registry physical root mismatch')
  const file = join(entry.path, '.ki.toml')
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) return fail('unsafe declaration')
  const bytes = await readFile(file)
  const declaration = parseRepositoryDeclaration(bytes.toString('utf8'), file)
  if (declaredRepositoryKind(declaration) !== 'kb') return fail('registry entry is not a KB')
  const metadata = declaredRepositoryMetadata(declaration)
  if (metadata.repository !== entry.repository) return fail('registry repository identity mismatch')
  const parsed = parse(bytes.toString('utf8'))
  const kb = declaration.skills.find((skill) => skill.name === 'ki-repo-kb')!.configuration
  const retired = parsed['knowledgeislands-kb']
  if (record(retired) && retired['zones'] !== undefined)
    return fail('migrate retired zone authority to skills.ki-repo-kb.zones')
  const configured = kb['zones']
  if (configured !== undefined && !record(configured)) return fail('invalid declared zones')
  const canonical = ZONES.map((name) => (name === 'inbound' ? '+' : name === 'outbound' ? '-' : name))
  if (record(configured) && Object.keys(configured).some((name) => !(canonical as readonly string[]).includes(name)))
    return fail('unknown declared zone')
  const zones = Object.fromEntries(
    ZONES.map((name, i) => [
      name,
      record(configured) && configured[canonical[i]!] !== undefined ? configured[canonical[i]!] : canonical[i]
    ])
  ) as Record<string, string>
  return {
    entry,
    purpose: { title: metadata.title, description: metadata.description },
    zones,
    declaration_sha256: sha256(bytes),
    source_store_declared: declaredKnowledgeBaseStoreRoles(declaration).includes('sources'),
    source_store_binding_declared: Boolean(entry.stores?.sources)
  }
}
