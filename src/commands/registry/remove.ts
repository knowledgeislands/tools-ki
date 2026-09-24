import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { prepareWrites, publishWrites } from '../../core/filesystem/index.ts'
import { type LocalRegistryRemovalSelector, localRegistryRemoval } from '../../core/storage/index.ts'
import type { RegistrySelection } from './index.ts'

const removalSelector = async (
  context: KiContext,
  key: string | undefined,
  selection: RegistrySelection
): Promise<LocalRegistryRemovalSelector> => {
  if (selection.agora || selection.estate) throw grammarError('ki registry remove does not accept --agora or --estate')
  if (selection.repositories.length > 1) throw grammarError('ki registry remove accepts exactly one --repo path')
  const repository = selection.repositories[0]
  if (key !== undefined) {
    if (repository !== undefined)
      throw grammarError('ki registry remove requires exactly one registry key or --repo path')
    return { kind: 'key', value: key }
  }
  if (repository === undefined)
    throw grammarError('ki registry remove requires exactly one registry key or --repo path')
  const absolutePath = resolve(context.workingDirectory, repository)
  return { kind: 'path', value: await realpath(absolutePath).catch(() => absolutePath) }
}

export const createRegistryRemoveCommand = (
  context: KiContext,
  selectedRepositories: () => RegistrySelection
): Command =>
  new Command('remove')
    .description('remove one KI repository from the machine-local registry')
    .argument('[key]', 'registered repository key')
    .option('--dry-run', 'report removal without writing')
    .action(async (key: string | undefined, options: { readonly dryRun?: boolean }) => {
      const result = await localRegistryRemoval(
        context.paths.state,
        await removalSelector(context, key, selectedRepositories())
      )
      const writes = await prepareWrites(await realpath(context.paths.state), [result.write])
      for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
      await publishWrites(writes, Boolean(options.dryRun))
      context.stdout.write(
        `ki registry remove: ${options.dryRun ? 'would remove' : 'removed'} ${result.removed.key} ${result.removed.repository} at ${result.removed.path}\n`
      )
    })
