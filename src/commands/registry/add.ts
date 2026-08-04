import { realpath } from 'node:fs/promises'
import { Command } from 'commander'
import { configuredRepositoryWrite } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
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
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      for (const repository of repositories) {
        const registryWrite = await configuredRepositoryWrite(context.paths.config, repository.root)
        const writes = registryWrite ? await prepareWrites(await realpath(context.paths.config), [registryWrite]) : []
        for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
        await publishWrites(writes, Boolean(options.dryRun))
        context.stdout.write(
          `ki registry add: ${registryWrite ? (options.dryRun ? 'would register' : 'registered') : 'already registered'} ${repository.root}\n`
        )
      }
    })
