import { realpath } from 'node:fs/promises'
import { Command } from 'commander'
import { configuredRepositoryWrite, inspectUserConfiguration } from '../../agents/index.ts'
import { linkManagedSkill } from '../../agents/skills.ts'
import type { KiContext } from '../../context.ts'
import { KiError, KiExit } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { prepareWrites, publishWrites } from '../../core/transaction.ts'
import { inspectRepositoryHealth } from './repository-health.ts'

export const createRepairCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly workspace?: string }
): Command =>
  new Command('repair')
    .description('reconcile proven KI-managed projections in selected repositories')
    .option('--dry-run', 'report repairs without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const dryRun = Boolean(options.dryRun)
      const global = await inspectUserConfiguration(context.paths.config)
      if (global.state === 'missing') throw new KiError('local KI configuration is missing; run ki bootstrap first', 1)
      if (global.state === 'invalid') throw new KiError(`local KI configuration is invalid: ${global.errors.join('; ')}`, 1)
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const lines = ['ki repo repair']
      let failed = false
      for (const repository of repositories) {
        lines.push('', `Repository: ${repository.root}`)
        try {
          const registryWrite = await configuredRepositoryWrite(context.paths.config, repository.root)
          if (registryWrite) {
            const writes = await prepareWrites(await realpath(context.paths.config), [registryWrite])
            for (const write of writes) lines.push(`  ${dryRun ? 'would write' : 'write'} ${write.path}`)
            await publishWrites(writes, dryRun)
            lines.push(`  ✓ Registry: ${dryRun ? 'would register' : 'registered'} ${repository.root}`)
          } else lines.push(`  ✓ Registry: already registered ${repository.root}`)
        } catch (error) {
          lines.push(`  ✗ Registry: ${(error as Error).message}`)
          failed = true
          continue
        }
        const health = await inspectRepositoryHealth(context, repository)
        lines.push(...health.lines)
        for (const projection of health.projections) {
          if (projection.state === 'linked' || projection.state === 'foreign') continue
          lines.push(`  ${dryRun ? 'would link' : 'link'} ${projection.path} -> ${projection.expected}`)
          if (!dryRun) {
            try {
              await linkManagedSkill(
                projection.agent,
                { scope: 'repo', repository: health.root },
                { name: projection.skill.declaration.name, source: projection.expected },
                true
              )
            } catch (error) {
              // The preflight just proved this is a repairable KI-managed link; this is reachable only if it changes concurrently.
              /* v8 ignore next */
              lines.push(`  ✗ Repair: ${(error as Error).message}`)
              /* v8 ignore next */
              failed = true
            }
          }
        }
        const repaired = dryRun ? health : await inspectRepositoryHealth(context, repository)
        if (repaired.health === 'unrepairable' || (!dryRun && repaired.health !== 'healthy')) failed = true
      }
      context.stdout.write(`${lines.join('\n')}\n`)
      if (failed) throw new KiExit(1)
    })
