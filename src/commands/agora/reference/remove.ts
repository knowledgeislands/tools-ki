import { realpath } from 'node:fs/promises'
import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import { referenceAssociationRemoval } from '../../../core/agora/index.ts'
import { KiError } from '../../../core/errors.ts'
import { prepareWrites, publishWrites } from '../../../core/filesystem/index.ts'
import { canonicalRepositoryIdentity } from '../../../core/storage/index.ts'

export const createAgoraReferenceRemoveCommand = (context: KiContext): Command =>
  new Command('remove')
    .description('remove one local Agora reference association')
    .argument('<repository>', 'canonical HTTPS GitHub repository identity')
    .option('--dry-run', 'validate and report without writing')
    .action(async (repository: string, options: { readonly dryRun?: boolean }) => {
      if (!canonicalRepositoryIdentity(repository))
        throw new KiError('repository must be a canonical HTTPS GitHub repository', 2)
      const write = await referenceAssociationRemoval(context.paths.state, repository)
      const writes = await prepareWrites(await realpath(context.paths.state), [write])
      await publishWrites(writes, Boolean(options.dryRun))
      context.stdout.write(
        `ki agora reference remove ${repository}: ${options.dryRun ? 'would remove' : 'removed'} association\n`
      )
    })
