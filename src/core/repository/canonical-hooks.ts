import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResolvedSkill } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

export type CanonicalHooks = Readonly<Record<'pre-commit' | 'commit-msg', string>>

/** The resolved ki-repo owns the shape policy and bytes; the host only publishes them. */
export const repositoryCanonicalHooks = async (root: string, skill: ResolvedSkill): Promise<CanonicalHooks | null> => {
  // Repository declaration validation has already established a declared primary shape.
  const shape = skill.declaration.configuration['primary_shape'] as string
  const modulePath = join(skill.provider.root, skill.capability.source, 'scripts/rubric/contexts/canonical-hooks.ts')
  let module: Record<string, unknown>
  try {
    module = await import(pathToFileURL(modulePath).href)
  } catch {
    throw new KiError(`${skill.identity} canonical hook data could not be loaded`, 1, `repair ${modulePath}`)
  }
  if (typeof module['canonicalHooks'] !== 'function')
    throw new KiError(`${skill.identity} canonical hook data must export canonicalHooks`, 1)
  const packaged = (await lstat(join(root, 'package.json')).catch(() => undefined)) !== undefined
  const hooks: unknown = module['canonicalHooks'](shape, packaged ? 'package' : 'no-package')
  if (hooks === null) return null
  if (
    typeof hooks !== 'object' ||
    !('pre-commit' in hooks) ||
    typeof hooks['pre-commit'] !== 'string' ||
    !('commit-msg' in hooks) ||
    typeof hooks['commit-msg'] !== 'string'
  )
    throw new KiError(`${skill.identity} canonicalHooks must return a hook pair or null`, 1)
  return { 'pre-commit': hooks['pre-commit'], 'commit-msg': hooks['commit-msg'] }
}
