import {
  inspectRepositoryHealth as inspectAgentRepositoryHealth,
  type RepositoryHealth,
  type RepositoryLocation,
  type RepositoryProjection
} from '../../../agents/index.ts'
import type { KiContext } from '../../../context.ts'
import { presentation } from '../../presentation/index.ts'

const stateDescription: Record<RepositoryProjection['state'], string> = {
  linked: 'linked',
  missing: 'projection is missing',
  dangling: 'projection is dangling',
  stale: 'projection target is stale',
  foreign: 'projection is not a KI-managed link'
}

export const describeRepositoryProjection = (projection: RepositoryProjection): string =>
  `${presentation(projection.state === 'linked' ? 'status.pass' : 'status.fail').terminal} ${projection.agent.descriptor.id} ${projection.skill.declaration.name}: ${stateDescription[projection.state]}`

export const describeRepositoryLocalProvider = (skill: RepositoryHealth['localProviders'][number]): string =>
  `${presentation('status.pass').terminal} ${skill.identity}: canonical repository source`

export const inspectRepositoryHealth = (context: KiContext, location: RepositoryLocation): Promise<RepositoryHealth> =>
  inspectAgentRepositoryHealth(
    {
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data,
      homeDirectory: context.homeDirectory
    },
    location
  )

export type { RepositoryHealth, RepositoryProjection }
