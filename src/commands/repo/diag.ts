import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import { presentation, renderTree } from '../presentation/index.ts'
import {
  describeRepositoryLocalProvider,
  describeRepositoryProjection,
  inspectRepositoryHealth
} from './repository-health.ts'

export const createRepoDiagCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('diag').description('report declared repository skill and projection health').action(async () => {
    const repositories = await resolveRepositoryTargets({
      ...selectedRepositories(),
      configurationDirectory: context.paths.config,
      stateDirectory: context.paths.state,
      workingDirectory: context.workingDirectory,
      homeDirectory: context.homeDirectory
    })
    const reports = await Promise.all(
      repositories.map(async (repository) => ({
        repository,
        health: await inspectRepositoryHealth(context, repository)
      }))
    )
    const counts = { healthy: 0, repairable: 0, unrepairable: 0 }
    for (const { health } of reports) counts[health.health] += 1
    context.stdout.write(
      `${renderTree({
        title: 'KI REPO DIAG',
        entries: [
          {
            label: `repositories (${reports.length})`,
            children: reports.map(({ repository, health }) => ({
              label: `${repository.root} (${health.health})`,
              children: health.diagnostic
                ? [{ label: `${presentation('status.fail').terminal} Repository: ${health.diagnostic}` }]
                : [
                    { label: `Declaration: ${health.declaration}` },
                    { label: `Status: ${health.health}` },
                    ...health.localProviders.map((skill) => ({ label: describeRepositoryLocalProvider(skill) })),
                    ...health.projections.map((projection) => ({ label: describeRepositoryProjection(projection) }))
                  ]
            }))
          },
          {
            label: `summary: REPOSITORIES=${reports.length} HEALTHY=${counts.healthy} REPAIRABLE=${counts.repairable} UNREPAIRABLE=${counts.unrepairable}`
          }
        ]
      }).join('\n')}\n`
    )
    if (counts.unrepairable) throw new KiExit(1)
  })
