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
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('repair')
    .description('reconcile proven KI-managed projections in selected repositories')
    .option('--dry-run', 'report repairs without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const dryRun = Boolean(options.dryRun)
      const global = await inspectUserConfiguration(context.paths.config)
      if (global.state === 'missing') throw new KiError('local KI configuration is missing; run ki bootstrap first', 1)
      if (global.state === 'invalid')
        throw new KiError(`local KI configuration is invalid: ${global.errors.join('; ')}`, 1)
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const reports: { readonly root: string; readonly entries: string[] }[] = []
      let failed = false
      for (const repository of repositories) {
        const entries: string[] = []
        try {
          const registryWrite = await configuredRepositoryWrite(context.paths.config, repository.root)
          if (registryWrite) {
            const writes = await prepareWrites(await realpath(context.paths.config), [registryWrite])
            for (const write of writes) entries.push(`${dryRun ? 'would write' : 'write'} ${write.path}`)
            await publishWrites(writes, dryRun)
            entries.push(`✓ Registry: ${dryRun ? 'would register' : 'registered'} ${repository.root}`)
          } else entries.push(`✓ Registry: already registered ${repository.root}`)
        } catch (error) {
          entries.push(`✗ Registry: ${(error as Error).message}`)
          reports.push({ root: repository.root, entries })
          failed = true
          continue
        }
        const health = await inspectRepositoryHealth(context, repository)
        const healthLines = health.lines.map((line) => line.trimStart())
        entries.push(...(healthLines[0]?.startsWith('Root') ? healthLines.slice(1) : healthLines))
        for (const projection of health.projections) {
          if (projection.state === 'linked' || projection.state === 'foreign') continue
          entries.push(`${dryRun ? 'would link' : 'link'} ${projection.path} -> ${projection.expected}`)
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
              entries.push(`✗ Repair: ${(error as Error).message}`)
              /* v8 ignore next */
              failed = true
            }
          }
        }
        const repaired = dryRun ? health : await inspectRepositoryHealth(context, repository)
        entries.push(`${dryRun ? 'would result' : 'result'}: ${repaired.health}`)
        if (repaired.health === 'unrepairable' || (!dryRun && repaired.health !== 'healthy')) failed = true
        reports.push({ root: repository.root, entries })
      }
      const lines = ['╭─ KI REPO REPAIR', `├─ repositories (${reports.length})`]
      lines.push(
        ...reports.flatMap((report, reportIndex) => {
          const lastReport = reportIndex === reports.length - 1
          const itemPrefix = `│  ${lastReport ? '   ' : '│  '}`
          return [
            `│  ${lastReport ? '╰─' : '├─'} ${report.root}`,
            ...report.entries.map(
              (entry, entryIndex) => `${itemPrefix}${entryIndex === report.entries.length - 1 ? '╰─' : '├─'} ${entry}`
            )
          ]
        })
      )
      lines.push(`╰─ summary: REPOSITORIES=${reports.length} RESULT=${failed ? 'FAIL' : 'PASS'}`)
      context.stdout.write(`${lines.join('\n')}\n`)
      if (failed) throw new KiExit(1)
    })
