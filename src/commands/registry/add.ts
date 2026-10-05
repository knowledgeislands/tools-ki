import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  declaredRepositoryIdentity,
  declaredRepositoryKind,
  readRepositoryDeclaration
} from '../../core/configuration/index.ts'
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
    .option('--search-boundary <id>', 'explicit unique trust-boundary assignment for exactly one KB')
    .action(async (options: { dryRun?: boolean; searchBoundary?: string }) => {
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
      if (
        options.searchBoundary !== undefined &&
        (declarations.length !== 1 ||
          declaredRepositoryKind(declarations[0]!.declaration) !== 'kb' ||
          !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(options.searchBoundary) ||
          options.searchBoundary.length > 128)
      )
        throw new KiError('--search-boundary requires one KB and a safe explicit boundary ID', 2)
      const registry = await inspectLocalRegistry(context.paths.state)
      if (registry.state === 'invalid')
        throw new KiError(`local KI repository registry is invalid: ${registry.errors.join('; ')}`, 1)
      for (const { repository, declaration } of declarations) {
        const identity = declaredRepositoryIdentity(declaration)
        const registryWrite = await localRegistryWrite(context.paths.state, {
          ...registryEntryForRepository(repository.root, identity, registry.repositories),
          ...(options.searchBoundary !== undefined ? { searchBoundary: options.searchBoundary } : {})
        })
        if (registryWrite) {
          context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${registryWrite.path}\n`)
          await publishLocalRegistryProposal(context.paths.state, registryWrite, Boolean(options.dryRun))
        }
        context.stdout.write(
          `ki registry add: ${registryWrite ? (options.dryRun ? 'would register' : 'registered') : 'already registered'} ${repository.root}\n`
        )
      }
    })
