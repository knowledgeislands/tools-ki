import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { readDeclaredSkills } from '../core/configuration.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses, type InstalledHarness } from '../core/harness.ts'
import { installerEnvironment, requireCurrentInstallerReceipt } from '../core/installation.ts'
import { installHarness, readHarnessRegistry } from '../core/registry.ts'
import { resolveRepositoryTargets } from '../core/repository.ts'
import { resolveDeclaredSkills } from '../core/resolution.ts'

const retainedCapabilities = (harness: InstalledHarness): readonly string[] => harness.capabilities.map((capability) => capability.name)

const refreshHarnesses = async (context: KiContext, harnesses: readonly InstalledHarness[]): Promise<readonly string[]> => {
  const registry = await readHarnessRegistry(context.paths.config)
  const configured = new Set(registry.map((release) => release.id))
  const lines: string[] = []
  for (const harness of [...harnesses].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!configured.has(harness.id)) {
      lines.push(`${harness.id}: unavailable (no configured immutable release)`)
      continue
    }
    const result = await installHarness(context.paths.config, context.paths.data, harness.id, context.fetcher, {
      replace: true,
      requiredCapabilities: retainedCapabilities(harness)
    })
    lines.push(`${harness.id}: refreshed archive ${result.archiveSha256}`)
  }
  return lines
}

const updateExecutable = async (context: KiContext): Promise<string> => {
  if (context.installation === 'local') {
    throw new KiError('CLI executable is a local development installation; update its checkout directly', 1)
  }
  const receipt = await requireCurrentInstallerReceipt(context.paths.state, context.executable)
  const result = await context.runner('bash', [receipt.installer], installerEnvironment(context.environment, receipt))
  if (result.exitCode !== 0) {
    const detail = result.output.trim()
    throw new KiError(`verified installer update failed${detail ? `: ${detail}` : ''}`, 1)
  }
  return 'CLI executable: updated with the verified installer'
}

export const createUpdateCommand = (context: KiContext): Command =>
  new Command('update')
    .description('update an installer-managed CLI and refresh installed configured harnesses')
    .option('--cli', 'update only the installer-managed CLI executable')
    .action(async (options: { cli?: boolean }) => {
      const lines = ['ki update']
      if (options.cli) {
        lines.push(await updateExecutable(context))
        context.stdout.write(`${lines.join('\n')}\n`)
        return
      }
      try {
        lines.push(await updateExecutable(context))
      } catch (error) {
        if (!(error instanceof KiError)) throw error
        lines.push(`CLI executable: unavailable (${error.message})`)
      }
      const harnesses = await discoverInstalledHarnesses(context.paths.data)
      const refreshed = await refreshHarnesses(context, harnesses)
      if (!refreshed.length) lines.push('No installed harnesses.')
      else lines.push('Harnesses:', ...refreshed.map((line) => `  ${line}`))
      context.stdout.write(`${lines.join('\n')}\n`)
    })

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
