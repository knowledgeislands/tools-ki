import { realpath } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Command } from 'commander'
import { configuredRepositoryWrite, inspectUserConfiguration } from '../agents/index.ts'
import { linkManagedSkill } from '../agents/skills.ts'
import type { KiContext } from '../context.ts'
import { KiExit } from '../core/errors.ts'
import { directRepositoryLocation } from '../core/repository.ts'
import { prepareWrites, publishWrites } from '../core/transaction.ts'
import { inspectDirectRepositoryHealth } from './repository-health.ts'

export const createRepairCommand = (context: KiContext): Command =>
  new Command('repair')
    .description('reconcile proven KI-managed state in the global environment and direct repository')
    .option('--dry-run', 'report repairs without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const dryRun = Boolean(options.dryRun)
      const global = await inspectUserConfiguration(context.paths.config)
      const lines = ['ki repair', '', 'Global']
      let failed = false
      if (global.state === 'valid') lines.push(`  ✓ Configuration: ${global.path}`)
      else {
        lines.push(`  ✗ Configuration: ${global.state === 'missing' ? 'missing; run ki bootstrap' : global.errors.join('; ')}`)
        failed = true
      }

      const direct = await directRepositoryLocation(context.workingDirectory)
      if (direct.kind !== 'none') {
        lines.push('', 'Repository')
        if (direct.kind === 'invalid') {
          lines.push(`  ✗ Repository: ${direct.error}`)
          failed = true
        } else if (global.state === 'valid') {
          let registryFailed = false
          try {
            const registryWrite = await configuredRepositoryWrite(context.paths.config, direct.root)
            if (registryWrite) {
              const writes = await prepareWrites(await realpath(dirname(global.path)), [registryWrite])
              for (const write of writes) lines.push(`  ${dryRun ? 'would write' : 'write'} ${write.path}`)
              await publishWrites(writes, dryRun)
              lines.push(`  ✓ Registry: ${dryRun ? 'would register' : 'registered'} ${direct.root}`)
            } else lines.push(`  ✓ Registry: already registered ${direct.root}`)
          } catch (error) {
            lines.push(`  ✗ Registry: ${(error as Error).message}`)
            failed = true
            registryFailed = true
          }
          if (registryFailed) {
            context.stdout.write(`${lines.join('\n')}\n`)
            throw new KiExit(1)
          }
          const health = await inspectDirectRepositoryHealth(context)
          // A direct regular declaration was selected immediately above, so the health report remains present.
          /* v8 ignore next */
          if (!health) throw new KiExit(1)
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
          const repaired = dryRun ? health : await inspectDirectRepositoryHealth(context)
          // The direct declaration cannot disappear without a concurrent filesystem mutation.
          /* v8 ignore next */
          if (!repaired) throw new KiExit(1)
          if (repaired.health === 'unrepairable' || (!dryRun && repaired.health !== 'healthy')) failed = true
        }
      }
      context.stdout.write(`${lines.join('\n')}\n`)
      if (failed) throw new KiExit(1)
    })
