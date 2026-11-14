import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { discoverInstalledBackpacks } from '../../core/backpack/index.ts'
import { readRepositoryDeclaration, resolveRepositoryDeclaredSkills } from '../../core/configuration/index.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import { renderTree } from '../presentation/index.ts'
import { refreshBackpacks } from '../shared/backpack-refresh.ts'

export const createUpgradeCommand = (
  context: KiContext,
  selectedRepositories: () => {
    readonly repositories: readonly string[]
    readonly territory?: string
    readonly filters?: readonly string[]
  }
): Command =>
  new Command('upgrade')
    .description('refresh uniquely resolved capabilities declared by one or more KI repositories')
    .action(async () => {
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        stateDirectory: context.paths.state,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const backpacks = await discoverInstalledBackpacks(context.paths.data)
      const reports: { readonly root: string; readonly providers: readonly string[] }[] = []
      for (const repository of repositories) {
        const skills = await resolveRepositoryDeclaredSkills(
          repository.root,
          await readRepositoryDeclaration(repository.declaration),
          backpacks,
          context.paths.data
        )
        const selected = [
          ...new Map(
            skills.flatMap((skill) =>
              skill.provider.kind === 'installed-backpack'
                ? [[skill.provider.backpack.id, skill.provider.backpack] as const]
                : []
            )
          ).values()
        ]
        reports.push({
          root: repository.root,
          providers: selected.length ? await refreshBackpacks(context, selected) : []
        })
      }
      const providers = reports.reduce((total, report) => total + report.providers.length, 0)
      context.stdout.write(
        `${renderTree({
          title: 'KI REPO UPGRADE',
          entries: [
            {
              label: `repositories (${reports.length})`,
              children: reports.map((report) => ({
                label: report.root,
                children: [
                  {
                    label: `providers (${report.providers.length})`,
                    children: report.providers.length
                      ? report.providers.map((label) => ({ label }))
                      : [{ label: 'none' }]
                  }
                ]
              }))
            },
            { label: `summary: REPOSITORIES=${reports.length} PROVIDERS=${providers}` }
          ]
        }).join('\n')}\n`
      )
    })
