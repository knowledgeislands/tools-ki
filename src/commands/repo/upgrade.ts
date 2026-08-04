import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { readDeclaredSkills } from '../../core/configuration.ts'
import { discoverInstalledHarnesses } from '../../core/harness.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { resolveDeclaredSkills } from '../../core/resolution.ts'
import { refreshHarnesses } from '../harness-refresh.ts'

export const createUpgradeCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly workspace?: string }
): Command =>
  new Command('upgrade').description('refresh uniquely resolved capabilities declared by one or more KI repositories').action(async () => {
    const repositories = await resolveRepositoryTargets({
      ...selectedRepositories(),
      workingDirectory: context.workingDirectory,
      homeDirectory: context.homeDirectory
    })
    const harnesses = await discoverInstalledHarnesses(context.paths.data)
    const lines = ['ki repo upgrade']
    for (const repository of repositories) {
      const skills = resolveDeclaredSkills(await readDeclaredSkills(repository.configuration), harnesses)
      const selected = [...new Map(skills.map((skill) => [skill.harness.id, skill.harness])).values()]
      if (!selected.length) {
        lines.push('No declared capabilities.')
        continue
      }
      const refreshed = await refreshHarnesses(context, selected)
      lines.push(`Repository: ${repository.root}`, 'Providers:', ...refreshed.map((line) => `  ${line}`))
    }
    context.stdout.write(`${lines.join('\n')}\n`)
  })
