import { mkdir, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../core/configuration.ts'
import { localRegistryWrite, registryEntry } from '../../core/local-registry.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { prepareWrites, publishWrites } from '../../core/transaction.ts'
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
      for (const repository of repositories) {
        const identity = declaredRepositoryIdentity(await readRepositoryDeclaration(repository.configuration))
        const registryWrite = await localRegistryWrite(context.paths.state, registryEntry(repository.root, identity))
        await mkdir(context.paths.state, { recursive: true })
        const writes = registryWrite ? await prepareWrites(await realpath(context.paths.state), [registryWrite]) : []
        for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
        await publishWrites(writes, Boolean(options.dryRun))
        context.stdout.write(
          `ki registry add: ${registryWrite ? (options.dryRun ? 'would register' : 'registered') : 'already registered'} ${repository.root}\n`
        )
      }
    })
