import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration
} from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import {
  externalStoreRoles,
  inspectLocalRegistry,
  invalidRegistryError,
  knowledgeBaseStoreAvailability
} from '../../core/storage/index.ts'
import {
  type OpenTargetName,
  openLocalTarget,
  openTargetNames,
  repositoryStoreFix
} from '../../core/territory/index.ts'

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
  selectedRepositories: () => {
    readonly repositories: readonly string[]
    readonly territory?: string
    readonly filters?: readonly string[]
  }
): Command =>
  new Command('open')
    .description('open selected repositories through an explicit local target')
    .addOption(new Option('--target <target>', 'local target to open').choices(openTargetNames).makeOptionMandatory())
    .option('--stores', 'include declared local stores (default for zed and vscode)')
    .option('--no-stores', 'open canonical repository roots only')
    .action(async (options: OpenOptions, command: Command) => {
      if (supplied(command, '--stores') && supplied(command, '--no-stores'))
        throw new KiError('ki repo open --stores and --no-stores are mutually exclusive', 2)
      if (options.target === 'delta' && supplied(command, '--stores'))
        throw new KiError('ki repo open --target delta accepts repository roots only; omit --stores', 2)
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        stateDirectory: context.paths.state,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const includeStores = options.target !== 'delta' && options.stores !== false
      const roots: string[] = []
      for (const repository of repositories) {
        roots.push(repository.root)
        if (!includeStores) continue
        const declaration = await readRepositoryDeclaration(repository.declaration)
        const roles = externalStoreRoles(declaredKnowledgeBaseStoreRoles(declaration))
        if (!roles.length) continue
        const registry = await inspectLocalRegistry(context.paths.state)
        if (registry.state === 'invalid') throw invalidRegistryError(context.paths.state, registry.errors)
        const identity = declaredRepositoryIdentity(declaration)
        const entry = registry.repositories.find(
          (candidate) => candidate.repository === identity && candidate.path === repository.root
        )
        // An unavailable store is skipped with its fix, an absent one silently; the repository still opens.
        for (const store of await knowledgeBaseStoreAvailability(entry, roles, context.platform))
          if ('root' in store) roots.push(store.root)
          else if ('unavailable' in store)
            context.stderr.write(
              `ki: warning: Knowledge Base ${repository.root} opens without its ${store.role} store, unavailable on this host (${store.unavailable}); fix: ${await repositoryStoreFix(context.homeDirectory, repository.root, entry?.key, store.role, Boolean(entry?.stores?.[store.role]))}\n`
            )
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
