import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { readRepositoryDeclaration } from '../../core/configuration.ts'
import { discoverInstalledHarnesses } from '../../core/harness.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { resolveDeclaredSkills } from '../../core/resolution.ts'
import { refreshHarnesses } from '../harness/refresh.ts'

export const createUpgradeCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('upgrade')
    .description('refresh uniquely resolved capabilities declared by one or more KI repositories')
    .action(async () => {
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const harnesses = await discoverInstalledHarnesses(context.paths.data)
      const reports: { readonly root: string; readonly providers: readonly string[] }[] = []
      for (const repository of repositories) {
        const skills = resolveDeclaredSkills(await readRepositoryDeclaration(repository.configuration), harnesses)
        const selected = [...new Map(skills.map((skill) => [skill.harness.id, skill.harness])).values()]
        reports.push({
          root: repository.root,
          providers: selected.length ? await refreshHarnesses(context, selected) : []
        })
      }
      const providers = reports.reduce((total, report) => total + report.providers.length, 0)
      const lines = ['╭─ KI REPO UPGRADE', `├─ repositories (${reports.length})`]
      lines.push(
        ...reports.flatMap((report, reportIndex) => {
          const lastReport = reportIndex === reports.length - 1
          const itemPrefix = `│  ${lastReport ? '   ' : '│  '}`
          return [
            `│  ${lastReport ? '╰─' : '├─'} ${report.root}`,
            `${itemPrefix}╰─ providers (${report.providers.length})`,
            ...(report.providers.length
              ? report.providers.map(
                  (provider, providerIndex) =>
                    `${itemPrefix}   ${providerIndex === report.providers.length - 1 ? '╰─' : '├─'} ${provider}`
                )
              : [`${itemPrefix}   ╰─ none`])
          ]
        })
      )
      lines.push(`╰─ summary: REPOSITORIES=${reports.length} PROVIDERS=${providers}`)
      context.stdout.write(`${lines.join('\n')}\n`)
    })
