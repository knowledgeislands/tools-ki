import { lstat, mkdir, realpath } from 'node:fs/promises'
import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import type { KnowledgeBaseStoreRole } from '../../core/configuration/declaration.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration
} from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { prepareWrites, publishWrites } from '../../core/filesystem/index.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import {
  bindRepositoryStore,
  type ExternalStoreRole,
  inspectLocalRegistry,
  localRegistryWrite,
  managedSourcesStore,
  repositoryStoreInventory,
  unbindRepositoryStore,
  validateRepositoryStore
} from '../../core/storage/index.ts'
import { renderTree } from '../presentation/index.ts'
import type { RepositorySelection } from './selection.ts'

type SelectRepositories = () => RepositorySelection

interface SelectedStoreRepository {
  readonly root: string
  readonly identity: string
  readonly roles: readonly KnowledgeBaseStoreRole[]
}

const selected = async (
  context: KiContext,
  selection: SelectRepositories
): Promise<readonly SelectedStoreRepository[]> => {
  const repositories = await resolveRepositoryTargets({
    ...selection(),
    configurationDirectory: context.paths.config,
    stateDirectory: context.paths.state,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })
  return Promise.all(
    repositories.map(async (repository) => {
      const declaration = await readRepositoryDeclaration(repository.declaration)
      const roles = declaredKnowledgeBaseStoreRoles(declaration)
      if (!roles.length)
        throw new KiError(`repository does not declare Knowledge Base store roles: ${repository.root}`, 1)
      return {
        root: repository.root,
        identity: declaredRepositoryIdentity(declaration),
        roles
      }
    })
  )
}

const selectedOne = async (context: KiContext, selection: SelectRepositories): Promise<SelectedStoreRepository> => {
  const repositories = await selected(context, selection)
  if (repositories.length !== 1) throw new KiError('ki repo store mutation requires exactly one repository', 2)
  return repositories[0] as SelectedStoreRepository
}

const requiredExternalRole = (repository: SelectedStoreRepository, role: KnowledgeBaseStoreRole): ExternalStoreRole => {
  if (!repository.roles.includes(role))
    throw new KiError(`repository does not declare ${role} store: ${repository.root}`, 2)
  if (role === 'notes') throw new KiError('notes store is the repository root and cannot be changed', 2)
  return role
}

const registryEntries = async (context: KiContext) => {
  const inspection = await inspectLocalRegistry(context.paths.state)
  if (inspection.state === 'invalid')
    throw new KiError(`local KI repository registry is invalid: ${inspection.errors.join('; ')}`, 1)
  return inspection.repositories
}

const publishRegistry = async (
  context: KiContext,
  entry: Parameters<typeof localRegistryWrite>[1],
  write: boolean
): Promise<boolean> => {
  const proposal = await localRegistryWrite(context.paths.state, entry)
  if (!proposal) return false
  context.stdout.write(`${write ? 'write' : 'would write'} ${proposal.path}\n`)
  if (write) {
    await mkdir(context.paths.state, { recursive: true })
    const writes = await prepareWrites(await realpath(context.paths.state), [proposal])
    await publishWrites(writes, false)
  }
  return true
}

const createStoreListCommand = (context: KiContext, selection: SelectRepositories): Command =>
  new Command('list')
    .description('list declared repository stores and their local bindings')
    .addOption(new Option('--format <format>', 'output format').choices(['text', 'json']).default('text'))
    .action(async (options: { format: 'text' | 'json' }) => {
      const [repositories, entries] = await Promise.all([selected(context, selection), registryEntries(context)])
      const inventory = repositories.map((repository) =>
        repositoryStoreInventory(repository.root, repository.identity, repository.roles, entries)
      )
      if (options.format === 'json') {
        context.stdout.write(
          `${JSON.stringify({ schema: 'ki/repository-stores/v1', repositories: inventory }, null, 2)}\n`
        )
        return
      }
      context.stdout.write(
        `${renderTree({
          title: 'KI REPO STORE',
          entries: [
            {
              label: `repositories (${inventory.length})`,
              children: inventory.map((repository) => ({
                label: repository.repository,
                children: repository.stores.map((store) => ({
                  label: `${store.role}: ${store.state}${store.path ? ` ${store.path}` : ''}`
                }))
              }))
            },
            {
              label: `summary: REPOSITORIES=${inventory.length} STORES=${inventory.reduce((total, repository) => total + repository.stores.length, 0)} BOUND=${inventory.reduce((total, repository) => total + repository.stores.filter((store) => store.state === 'bound').length, 0)}`
            }
          ]
        }).join('\n')}\n`
      )
    })

const createStoreCreateCommand = (context: KiContext, selection: SelectRepositories): Command =>
  new Command('create')
    .description('create and bind a store at its managed local location')
    .argument('<role>', 'declared store role')
    .addOption(new Option('--write', 'create the store and publish its binding'))
    .action(async (rawRole: string, options: { write?: boolean }) => {
      const role = rawRole as KnowledgeBaseStoreRole
      const repository = await selectedOne(context, selection)
      const externalRole = requiredExternalRole(repository, role)
      if (externalRole !== 'sources')
        throw new KiError('legacy store has no managed creation location; bind an existing directory instead', 2)
      const entries = await registryEntries(context)
      const current = repositoryStoreInventory(
        repository.root,
        repository.identity,
        repository.roles,
        entries
      ).stores.find((store) => store.role === role)
      const path = await managedSourcesStore(context.homeDirectory, repository.root)
      if (current?.path && current.path !== path)
        throw new KiError(`sources store is already bound to ${current.path}; use ki repo store bind to replace it`, 2)
      const exists = Boolean(await lstat(path).catch(() => undefined))
      const entry = bindRepositoryStore(repository.root, repository.identity, externalRole, path, entries)
      const write = Boolean(options.write)
      if (!exists) {
        context.stdout.write(`${write ? 'create' : 'would create'} ${path}\n`)
        if (write) await mkdir(path)
      }
      const registryChanged = await publishRegistry(context, entry, write)
      context.stdout.write(
        `ki repo store create ${role}: ${exists ? 'store exists' : write ? 'created' : 'previewed'}${registryChanged ? (write ? ' and bound' : ' with binding change') : ' and already bound'} ${path}\n`
      )
    })

const createStoreBindCommand = (context: KiContext, selection: SelectRepositories): Command =>
  new Command('bind')
    .description('bind a declared external store to an existing local directory')
    .argument('<role>', 'declared external store role')
    .argument('<absolute-path>', 'existing direct directory')
    .option('--write', 'publish the local binding')
    .action(async (rawRole: string, path: string, options: { write?: boolean }) => {
      const role = rawRole as KnowledgeBaseStoreRole
      const repository = await selectedOne(context, selection)
      const externalRole = requiredExternalRole(repository, role)
      const validatedPath = await validateRepositoryStore(externalRole, path)
      const entries = await registryEntries(context)
      const entry = bindRepositoryStore(repository.root, repository.identity, externalRole, validatedPath, entries)
      const changed = await publishRegistry(context, entry, Boolean(options.write))
      context.stdout.write(
        `ki repo store bind ${role}: ${changed ? (options.write ? 'bound' : 'would bind') : 'already bound'} ${validatedPath}\n`
      )
    })

const createStoreUnbindCommand = (context: KiContext, selection: SelectRepositories): Command =>
  new Command('unbind')
    .description('remove a local store binding without deleting store content')
    .argument('<role>', 'declared external store role')
    .option('--write', 'publish removal of the local binding')
    .action(async (rawRole: string, options: { write?: boolean }) => {
      const role = rawRole as KnowledgeBaseStoreRole
      const repository = await selectedOne(context, selection)
      const externalRole = requiredExternalRole(repository, role)
      const entries = await registryEntries(context)
      const current = repositoryStoreInventory(
        repository.root,
        repository.identity,
        repository.roles,
        entries
      ).stores.find((store) => store.role === role)
      if (!current?.path) {
        context.stdout.write(`ki repo store unbind ${role}: already unbound\n`)
        return
      }
      const entry = unbindRepositoryStore(repository.root, repository.identity, externalRole, entries)
      await publishRegistry(context, entry, Boolean(options.write))
      context.stdout.write(
        `ki repo store unbind ${role}: ${options.write ? 'unbound' : 'would unbind'} ${current.path}; content is unchanged\n`
      )
    })

export const createRepoStoreCommand = (context: KiContext, selection: SelectRepositories): Command =>
  new Command('store')
    .description('manage declared stores for selected KI repositories')
    .addCommand(createStoreListCommand(context, selection))
    .addCommand(createStoreCreateCommand(context, selection))
    .addCommand(createStoreBindCommand(context, selection))
    .addCommand(createStoreUnbindCommand(context, selection))
