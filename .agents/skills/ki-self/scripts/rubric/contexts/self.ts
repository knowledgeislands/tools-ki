import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RubricContextOptions, RubricPublication, RubricSession } from '../../shared/rubric.ts'

export const SELF_SOURCE_PATHS = [
  'src/agents/bootstrap.ts',
  'src/commands/agora/list.ts',
  'src/commands/manage/diag.ts',
  'src/commands/manage/list.ts',
  'src/commands/manage/repair.ts',
  'src/commands/manage/update.ts',
  'src/commands/repo/diag.ts',
  'src/commands/repo/repair.ts',
  'src/commands/repo/upgrade.ts',
  'src/commands/trade/records.ts',
  'src/core/harness/bootstrap-capabilities.ts',
  'src/core/manage/doctor.ts',
  'src/core/manage/repair.ts',
  'src/core/storage/registry.ts'
] as const

export interface SelfRubricContext {
  readonly repository: string
  readonly publication: RubricPublication
  readonly sources: ReadonlyMap<string, string | undefined>
}

const readSource = async (repository: string, path: string): Promise<string | undefined> =>
  readFile(join(repository, path), 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })

export const createSelfSession = async (
  options: RubricContextOptions
): Promise<RubricSession<SelfRubricContext>> => {
  const sources = new Map(
    await Promise.all(
      SELF_SOURCE_PATHS.map(async (path) => [path, await readSource(options.repository, path)] as const)
    )
  )
  const context = { repository: options.repository, publication: options.publication, sources }
  return {
    subjects: [{ families: ['RUBRIC', 'CLASSIFICATION', 'REPAIR', 'PRESENTATION'], context: () => context }],
    proposal: () => ({ writes: [] })
  }
}
