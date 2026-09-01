import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { type OpenTargetName, openLocalTarget, openTargetNames } from '../../core/agora/index.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration
} from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import { inspectLocalRegistry, registeredKnowledgeBaseStoreRoots } from '../../core/storage/index.ts'

interface OpenOptions {
  readonly target: OpenTargetName
  readonly stores?: boolean
}

type RawArgsCommand = Command & { readonly rawArgs: readonly string[] }

const supplied = (command: Command, option: string): boolean => {
  let root = command
  while (root.parent) root = root.parent
  return (root as RawArgsCommand).rawArgs.includes(option)
}

export const createRepoOpenCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('open')
    .description('open selected repositories with their declared local stores')
    .addOption(new Option('--target <target>', 'local target to open').choices(openTargetNames).makeOptionMandatory())
    .option('--stores', 'include declared local stores (default)')
    .option('--no-stores', 'open canonical repository roots only')
    .action(async (options: OpenOptions, command: Command) => {
      if (supplied(command, '--stores') && supplied(command, '--no-stores'))
        throw new KiError('ki repo open --stores and --no-stores are mutually exclusive', 2)
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        stateDirectory: context.paths.state,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const includeStores = options.stores !== false
      const roots: string[] = []
      for (const repository of repositories) {
        roots.push(repository.root)
        if (!includeStores) continue
        const declaration = await readRepositoryDeclaration(repository.declaration)
        if (!declaredKnowledgeBaseStoreRoles(declaration).includes('sources')) continue
        const registry = await inspectLocalRegistry(context.paths.state)
        if (registry.state === 'invalid')
          throw new KiError(`local KI repository registry is invalid: ${registry.errors.join('; ')}`, 1)
        const identity = declaredRepositoryIdentity(declaration)
        const entry = registry.repositories.find(
          (candidate) => candidate.repository === identity && candidate.path === repository.root
        )
        try {
          roots.push(...(await registeredKnowledgeBaseStoreRoots(entry)))
        } catch {
          throw new KiError(
            `Knowledge Base ${repository.root} declares sources; run ki registry add --repo ${repository.root} --sources <absolute-path>`,
            1
          )
        }
      }
      const result = await openLocalTarget(options.target, roots, {
        runner: context.runner,
        environment: context.environment
      })
      if (result.exitCode)
        throw new KiError(
          `could not open repositories: ${result.output.trim() || result.failureMessage}`,
          result.exitCode
        )

      context.stdout.write(`ki repo open --target ${options.target}: opened ${repositories.length} repositories\n`)
    })
