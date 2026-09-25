import { mkdir, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { prepareWrites, publishWrites } from '../../core/filesystem/index.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import { inspectLocalRegistry, localRegistryWrite, registryEntryForRepository } from '../../core/storage/index.ts'
import type { RegistrySelection } from './index.ts'

export const createRegistryAddCommand = (context: KiContext, selectedRepositories: () => RegistrySelection): Command =>
  new Command('add')
    .description('add explicitly selected local KI repository roots without applying repairs')
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
        await mkdir(context.paths.state, { recursive: true })
        const writes = registryWrite ? await prepareWrites(await realpath(context.paths.state), [registryWrite]) : []
        for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
        await publishWrites(writes, Boolean(options.dryRun))
        context.stdout.write(
          `ki registry add: ${registryWrite ? (options.dryRun ? 'would register' : 'registered') : 'already registered'} ${repository.root}\n`
        )
      }
    })
