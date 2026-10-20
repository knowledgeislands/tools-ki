// An island's condition pairs its declared maturity with its recorded audit health. The scale and
// the decline rule belong to the `ki-repo` standard; this reader reports what is declared and
// recorded, and reports anything else as unknown rather than guessing a level.

import { join } from 'node:path'
import { REPOSITORY_DECLARATION_FILE, readRepositoryDeclaration } from '../configuration/index.ts'
import { type AuditHealth, readAuditHealth } from '../repository/audit-health.ts'
import type { TerritoryProfile, TerritoryRootKind } from './types.ts'

export type { AuditHealth } from '../repository/audit-health.ts'

const TERRITORY_SCHEMA = 'ki/territory/v1' as const

/** The `ki-repo` standard's fixed maturity scale, lowest first. */
export const MATURITY_LEVELS = ['founding', 'growing', 'settled', 'thriving'] as const

export type MaturityLevel = (typeof MATURITY_LEVELS)[number]

export interface IslandMaturity {
  readonly level: MaturityLevel | null
  readonly declaration: 'declared' | 'absent' | 'invalid' | 'unreadable'
}

export interface TerritoryReport {
  readonly schema: typeof TERRITORY_SCHEMA
  readonly territory: { readonly id: string; readonly title: string }
  readonly repositories: readonly {
    readonly key: string
    readonly identity: string
    readonly root: string
    readonly kind: TerritoryRootKind
    readonly maturity: IslandMaturity
    readonly health: AuditHealth
  }[]
  readonly unregistered: readonly string[]
}

const isLevel = (value: unknown): value is MaturityLevel => MATURITY_LEVELS.some((level) => level === value)

const readMaturity = async (root: string): Promise<IslandMaturity> => {
  try {
    const declaration = await readRepositoryDeclaration(join(root, REPOSITORY_DECLARATION_FILE))
    const declared = declaration.skills.flatMap((skill) =>
      skill.name === 'ki-repo' && Object.hasOwn(skill.configuration, 'maturity')
        ? [skill.configuration['maturity']]
        : []
    )
    if (!declared.length) return { level: null, declaration: 'absent' }
    const [value] = declared
    return isLevel(value) ? { level: value, declaration: 'declared' } : { level: null, declaration: 'invalid' }
  } catch {
    return { level: null, declaration: 'unreadable' }
  }
}

const identity = (repository: string): string => repository.replace(/^https:\/\/github\.com\//u, '')

/** Reads every selected island's declared maturity and recorded audit health. */
export const territoryReport = async (profile: TerritoryProfile, stateDirectory: string): Promise<TerritoryReport> => ({
  schema: TERRITORY_SCHEMA,
  territory: { id: profile.id, title: profile.title },
  repositories: await Promise.all(
    profile.roots.map(async (member) => ({
      key: member.key,
      identity: identity(member.repository),
      root: member.root,
      kind: member.kind,
      maturity: await readMaturity(member.root),
      health: await readAuditHealth(stateDirectory, member.root)
    }))
  ),
  unregistered: profile.unregistered ?? []
})
