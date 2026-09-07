import { realpath } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import {
  declaredAgoraReferenceIdentities,
  inspectReferenceCheckout,
  referenceAssociationWrite
} from '../../../core/agora/index.ts'
import { KiError } from '../../../core/errors.ts'
import { prepareWrites, publishWrites } from '../../../core/filesystem/index.ts'
import { canonicalRepositoryIdentity } from '../../../core/storage/index.ts'

export const createAgoraReferenceSetCommand = (context: KiContext): Command =>
  new Command('set')
    .description('associate one owner-declared reference with an explicit local Git checkout')
    .argument('<repository>', 'canonical HTTPS GitHub repository identity')
    .argument('<checkout>', 'absolute local Git checkout root')
    .option('--dry-run', 'validate and report without writing')
    .action(async (repository: string, checkout: string, options: { readonly dryRun?: boolean }) => {
      if (!canonicalRepositoryIdentity(repository))
        throw new KiError('repository must be a canonical HTTPS GitHub repository', 2)
      if (!isAbsolute(checkout)) throw new KiError('checkout must be an absolute path', 2)
      const declared = await declaredAgoraReferenceIdentities(context.paths.state)
      if (!declared.includes(repository))
        throw new KiError(`${repository} is not declared as a reference by a registered Agora owner`, 2)

      const inspection = await inspectReferenceCheckout(checkout, repository, context.runner, context.environment)
      if (inspection.state !== 'available') throw new KiError(inspection.detail, 2)
      const write = await referenceAssociationWrite(context.paths.state, {
        repository,
        path: inspection.root as string
      })
      if (write) {
        const writes = await prepareWrites(await realpath(context.paths.state), [write])
        await publishWrites(writes, Boolean(options.dryRun))
      }
      context.stdout.write(
        `ki agora reference set ${repository}: ${options.dryRun ? 'would associate' : write ? 'associated' : 'unchanged'} ${inspection.root}\n`
      )
    })
