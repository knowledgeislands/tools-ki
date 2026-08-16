import { mkdir, realpath, rm } from 'node:fs/promises'
import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { REPOSITORY_CONFIGURATION_FILE, renderRepositoryConfiguration } from '../../core/configuration.ts'
import { KiError } from '../../core/errors.ts'
import { localRegistryWrite, registryEntry } from '../../core/local-registry.ts'
import { resolveRepositoryInitialisationTarget } from '../../core/repository/index.ts'
import { prepareWrites, publishWrites } from '../../core/transaction.ts'

export const createRepoInitCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('init')
    .description('initialize one existing Git repository with an explicit KI identity')
    .argument('[directory]', 'existing Git repository root (default: current directory)')
    .option('--title <title>', 'repository title')
    .option('--description <description>', 'repository description')
    .option('--repo-code <code>', 'stable uppercase repository identifier')
    .option('--repository <url>', 'canonical HTTPS GitHub repository identity')
    .option(
      '--runtime <runtime>',
      'supported runtime: claude-code, claude-desktop, or chatgpt-codex',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('--visibility <visibility>', 'repository visibility: public or private')
    .action(
      async (
        directory: string | undefined,
        options: {
          title?: string
          description?: string
          repoCode?: string
          repository: string
          runtime: readonly string[]
          visibility?: string
        }
      ) => {
        const selection = selectedRepositories()
        if (selection.repositories.length || selection.agora)
          throw new KiError('ki repo init does not accept --repo or --agora', 2)
        const configuration = renderRepositoryConfiguration({
          title: options.title ?? '',
          description: options.description ?? '',
          repoCode: options.repoCode ?? '',
          repository: options.repository,
          supportedRuntimes: options.runtime,
          visibility: options.visibility ?? ''
        })
        const repository = await resolveRepositoryInitialisationTarget({
          directory,
          workingDirectory: context.workingDirectory,
          environment: context.environment,
          runner: context.runner
        })
        // Resolve every write before changing state: a missing or invalid user
        // configuration cannot leave a new repository declaration behind.
        const local = await inspectUserConfiguration(context.paths.config)
        if (local.state === 'missing')
          throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
        if (local.state === 'invalid') throw new KiError(`ki configuration is invalid: ${local.errors.join('; ')}`, 1)
        const registryWrite = await localRegistryWrite(
          context.paths.state,
          registryEntry(repository.root, options.repository)
        )
        const declarationWrites = await prepareWrites(repository.root, [
          { path: REPOSITORY_CONFIGURATION_FILE, content: configuration, create: true }
        ])
        if (registryWrite) await mkdir(context.paths.state, { recursive: true })
        const registryWrites = registryWrite
          ? await prepareWrites(await realpath(context.paths.state), [registryWrite])
          : []
        await publishWrites(declarationWrites, false)
        try {
          await publishWrites(registryWrites, false)
        } catch (error) {
          await rm(repository.configuration)
          throw error
        }
        for (const write of [...declarationWrites, ...registryWrites]) context.stdout.write(`write ${write.path}\n`)
        context.stdout.write(`ki repo init: initialized ${repository.root}\n`)
      }
    )
