import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration
} from '../../core/configuration.ts'
import { KiError } from '../../core/errors.ts'
import { inspectLocalRegistry } from '../../core/local-registry.ts'
import { registeredKnowledgeBaseStoreRoots } from '../../core/local-stores.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'

interface OpenOptions {
  readonly target: string
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
    .requiredOption('--target <target>', 'local target to open')
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
        const declaration = await readRepositoryDeclaration(repository.configuration)
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
      if (options.target === 'zed') {
        const window = await context.runner('zed', ['-n'], context.environment)
        if (window.exitCode)
          throw new KiError(`could not open repositories: ${window.output.trim() || 'zed failed'}`, window.exitCode)
        for (const root of roots) {
          const result = await context.runner('zed', ['-e', root], context.environment)
          if (result.exitCode)
            throw new KiError(`could not open repositories: ${result.output.trim() || 'zed failed'}`, result.exitCode)
        }
      } else if (options.target === 'vscode') {
        const result = await context.runner('code', ['--new-window', ...roots], context.environment)
        if (result.exitCode)
          throw new KiError(`could not open repositories: ${result.output.trim() || 'code failed'}`, result.exitCode)
      } else throw new KiError('ki repo open --target supports zed or vscode', 2)
      context.stdout.write(`ki repo open --target ${options.target}: opened ${repositories.length} repositories\n`)
    })
