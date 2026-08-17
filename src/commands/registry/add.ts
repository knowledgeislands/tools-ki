import { mkdir, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration
} from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import { localRegistryWrite, registryEntry, sourceStoreDirectory } from '../../core/storage/index.ts'
import { prepareWrites, publishWrites } from '../../core/transaction.ts'
import type { RegistrySelection } from './index.ts'

export const createRegistryAddCommand = (context: KiContext, selectedRepositories: () => RegistrySelection): Command =>
  new Command('add')
    .description('add explicitly selected local KI repository roots without applying repairs')
    .option('--dry-run', 'report registrations without writing')
    .option('--sources <absolute-path>', 'local source store for one Knowledge Base that declares sources')
    .action(async (options: { dryRun?: boolean; sources?: string }) => {
      const repositories = await resolveRepositoryTargets({
        ...selectedRepositories(),
        configurationDirectory: context.paths.config,
        stateDirectory: context.paths.state,
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const declarations = await Promise.all(
        repositories.map(async (repository) => ({
          repository,
          declaration: await readRepositoryDeclaration(repository.configuration)
        }))
      )
      const sourcesTargets = declarations.filter(({ declaration }) =>
        declaredKnowledgeBaseStoreRoles(declaration).includes('sources')
      )
      if (sourcesTargets.length && repositories.length !== 1)
        throw new KiError(
          'ki registry add selects a KB that declares sources; select exactly one repository with --sources',
          1
        )
      if (sourcesTargets.length && !options.sources)
        throw new KiError('ki registry add requires --sources for a KB that declares sources', 1)
      if (!sourcesTargets.length && options.sources)
        throw new KiError('ki registry add --sources requires one selected KB that declares sources', 1)
      const sources = options.sources ? await sourceStoreDirectory(options.sources) : undefined
      for (const { repository, declaration } of declarations) {
        const identity = declaredRepositoryIdentity(declaration)
        const registryWrite = await localRegistryWrite(
          context.paths.state,
          registryEntry(repository.root, identity, sourcesTargets.length ? sources : undefined)
        )
        await mkdir(context.paths.state, { recursive: true })
        const writes = registryWrite ? await prepareWrites(await realpath(context.paths.state), [registryWrite]) : []
        for (const write of writes) context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
        await publishWrites(writes, Boolean(options.dryRun))
        context.stdout.write(
          `ki registry add: ${registryWrite ? (options.dryRun ? 'would register' : 'registered') : 'already registered'} ${repository.root}\n`
        )
      }
    })
