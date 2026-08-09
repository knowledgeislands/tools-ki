import { mkdir, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import { linkManagedSkill } from '../../agents/skills.ts'
import type { KiContext } from '../../context.ts'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../core/configuration.ts'
import { KiError, KiExit } from '../../core/errors.ts'
import { localRegistryWrite, registryEntry } from '../../core/local-registry.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { prepareWrites, publishWrites } from '../../core/transaction.ts'
import { renderTree } from '../../core/tree-rendering.ts'
import { describeRepositoryProjection, inspectRepositoryHealth } from './repository-health.ts'

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
        stateDirectory: context.paths.state,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const reports: { readonly root: string; readonly entries: string[] }[] = []
      let failed = false
      for (const repository of repositories) {
        const entries: string[] = []
        try {
          const identity = declaredRepositoryIdentity(await readRepositoryDeclaration(repository.configuration))
          const registryWrite = await localRegistryWrite(context.paths.state, registryEntry(repository.root, identity))
          if (registryWrite) {
            await mkdir(context.paths.state, { recursive: true })
            const writes = await prepareWrites(await realpath(context.paths.state), [registryWrite])
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
        if (health.diagnostic) entries.push(`✗ Repository: ${health.diagnostic}`)
        else entries.push(...health.projections.map(describeRepositoryProjection))
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
              // Health classifies the projection path; linking also validates the directory
              // containing it, about which classification says nothing.
              entries.push(`✗ Repair: ${(error as Error).message}`)
              failed = true
            }
          }
        }
        const repaired = dryRun ? health : await inspectRepositoryHealth(context, repository)
        entries.push(`${dryRun ? 'would result' : 'result'}: ${repaired.health}`)
        if (repaired.health === 'unrepairable' || (!dryRun && repaired.health !== 'healthy')) failed = true
        reports.push({ root: repository.root, entries })
      }
      context.stdout.write(
        `${renderTree({
          title: 'KI REPO REPAIR',
          entries: [
            {
              label: `repositories (${reports.length})`,
              children: reports.map((report) => ({
                label: report.root,
                children: report.entries.map((label) => ({ label }))
              }))
            },
            { label: `summary: REPOSITORIES=${reports.length} RESULT=${failed ? 'FAIL' : 'PASS'}` }
          ]
        }).join('\n')}\n`
      )
      if (failed) throw new KiExit(1)
    })
