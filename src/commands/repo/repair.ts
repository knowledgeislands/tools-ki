import { unlink } from 'node:fs/promises'
import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import { linkManagedSkill } from '../../agents/skills.ts'
import type { KiContext } from '../../context.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration
} from '../../core/configuration/index.ts'
import { KiError, KiExit } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import {
  externalStoreRoles,
  inspectLocalRegistry,
  knowledgeBaseStoreAvailability,
  localRegistryWrite,
  publishLocalRegistryProposal,
  registryEntryForRepository
} from '../../core/storage/index.ts'
import { repositoryStoreFix } from '../../core/territory/index.ts'
import { presentation, renderTree } from '../presentation/index.ts'
import {
  describeRepositoryOrphan,
  describeRepositoryProjection,
  inspectRepositoryHealth
} from './shared/repository-health.ts'

export const createRepairCommand = (
  context: KiContext,
  selectedRepositories: () => {
    readonly repositories: readonly string[]
    readonly territory?: string
    readonly filters?: readonly string[]
  }
): Command =>
  new Command('repair')
    .description('reconcile KI-managed projections by default; --dry-run previews without writing')
    .option('--dry-run', 'report repairs without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const failedMark = presentation('status.fail').terminal
      const passedMark = presentation('status.pass').terminal
      const warnMark = presentation('status.warn').terminal
      const infoMark = presentation('status.info').terminal
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
          const declaration = await readRepositoryDeclaration(repository.declaration)
          const identity = declaredRepositoryIdentity(declaration)
          const roles = externalStoreRoles(declaredKnowledgeBaseStoreRoles(declaration))
          // An invalid registry lists no entries; writing the proposal then reports it as invalid.
          const registry = await inspectLocalRegistry(context.paths.state)
          const entry = registryEntryForRepository(repository.root, identity, registry.repositories)
          const registryWrite = await localRegistryWrite(context.paths.state, entry)
          if (registryWrite) {
            entries.push(`${dryRun ? 'would write' : 'write'} ${registryWrite.path}`)
            await publishLocalRegistryProposal(context.paths.state, registryWrite, dryRun)
            entries.push(`${passedMark} Registry: ${dryRun ? 'would register' : 'registered'} ${repository.root}`)
          } else if (!roles.length) entries.push(`${passedMark} Registry: already registered ${repository.root}`)
          // An unavailable store is a finding about this host, not a repair failure: registration,
          // projection and health still run, and only commands that need originals fail.
          const stores = await knowledgeBaseStoreAvailability(entry, roles)
          const unavailable = stores.filter((store) => 'unavailable' in store)
          for (const store of stores)
            if ('absent' in store)
              entries.push(`${infoMark} Store: ${store.role} store is absent on this host by choice`)
            else if ('unavailable' in store)
              entries.push(
                `${warnMark} Store: ${store.role} store is unavailable on this host (${store.unavailable}); commands that need originals will fail; fix: ${await repositoryStoreFix(context.homeDirectory, repository.root, entry.key, store.role)}`
              )
          if (roles.length && !unavailable.length) entries.push(`${passedMark} Registry: complete ${repository.root}`)
        } catch (error) {
          entries.push(`${failedMark} Registry: ${(error as Error).message}`)
          reports.push({ root: repository.root, entries })
          failed = true
          continue
        }
        const health = await inspectRepositoryHealth(context, repository)
        if (health.diagnostic) entries.push(`${failedMark} Repository: ${health.diagnostic}`)
        else
          entries.push(
            ...health.projections.map(describeRepositoryProjection),
            ...health.orphans.map(describeRepositoryOrphan)
          )
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
              entries.push(`${failedMark} Repair: ${(error as Error).message}`)
              failed = true
            }
          }
        }
        for (const orphan of health.orphans) {
          entries.push(`${dryRun ? 'would remove' : 'remove'} ${orphan.path}`)
          if (!dryRun) await unlink(orphan.path)
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
