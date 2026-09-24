import { join } from 'node:path'
import { declaredRepositoryMetadata, readRepositoryDeclaration } from '../configuration/index.ts'
import type { LocalRegistryEntry } from './local-registry.ts'

const REGISTRY_REPORT_SCHEMA = 'ki/registry/v1' as const

export interface RegistryReport {
  readonly schema: typeof REGISTRY_REPORT_SCHEMA
  readonly repositories: readonly {
    readonly key: string
    readonly identity: string
    readonly repository: string
    readonly state: 'available' | 'unavailable'
    readonly title: string | null
    readonly description: string | null
    readonly repoCode: string | null
    readonly visibility: 'public' | 'private' | null
  }[]
}

const identity = (repository: string): string => repository.slice('https://github.com/'.length)

/** Projects registered identities and declared metadata without exposing machine-local paths. */
export const registryReport = async (
  repositories: readonly LocalRegistryEntry[]
): Promise<{ readonly report: RegistryReport; readonly unavailable: boolean }> => {
  let unavailable = false
  const projected = await Promise.all(
    repositories.map(async (entry): Promise<RegistryReport['repositories'][number]> => {
      try {
        const metadata = declaredRepositoryMetadata(await readRepositoryDeclaration(join(entry.path, '.ki.toml')))
        if (metadata.repository !== entry.repository) throw new Error('registry identity mismatch')
        return {
          key: entry.key,
          identity: identity(entry.repository),
          repository: entry.repository,
          state: 'available',
          title: metadata.title,
          description: metadata.description,
          repoCode: metadata.repoCode,
          visibility: metadata.visibility
        }
      } catch {
        unavailable = true
        return {
          key: entry.key,
          identity: identity(entry.repository),
          repository: entry.repository,
          state: 'unavailable',
          title: null,
          description: null,
          repoCode: null,
          visibility: null
        }
      }
    })
  )
  return { report: { schema: REGISTRY_REPORT_SCHEMA, repositories: projected }, unavailable }
}
