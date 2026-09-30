import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import {
  inspectLocalRegistry,
  localRegistryWrite,
  publishLocalRegistryProposal,
  registryEntryForRepository
} from '../../core/storage/index.ts'
import type { RegistrySelection } from './index.ts'

export const createRegistryAddCommand = (context: KiContext, selectedRepositories: () => RegistrySelection): Command =>
  new Command('add')
    .description('register selected KI roots by default; --dry-run previews without writing')
    .option('--dry-run', 'report registrations without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        stateDirectory: context.paths.state,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const declarations = await Promise.all(
        repositories.map(async (repository) => ({
          repository,
          declaration: await readRepositoryDeclaration(repository.declaration)
        }))
      )
      const registry = await inspectLocalRegistry(context.paths.state)
      if (registry.state === 'invalid')
        throw new KiError(`local KI repository registry is invalid: ${registry.errors.join('; ')}`, 1)
      for (const { repository, declaration } of declarations) {
        const identity = declaredRepositoryIdentity(declaration)
        const registryWrite = await localRegistryWrite(
          context.paths.state,
          registryEntryForRepository(repository.root, identity, registry.repositories)
        )
        if (registryWrite) {
          context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${registryWrite.path}\n`)
          await publishLocalRegistryProposal(context.paths.state, registryWrite, Boolean(options.dryRun))
        }
        context.stdout.write(
          `ki registry add: ${registryWrite ? (options.dryRun ? 'would register' : 'registered') : 'already registered'} ${repository.root}\n`
        )
      }
    })
