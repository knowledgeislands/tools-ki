import { lstat, mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../configuration/declaration.ts'
import { resolveRepositoryDeclaredSkills } from '../../configuration/local-provider.ts'
import type { ResolvedSkill } from '../../configuration/resolution.ts'
import { KiError } from '../../errors.ts'
import { prepareWrites } from '../../filesystem/publication.ts'
import { discoverInstalledHarnesses } from '../../harness/inspection.ts'
import { gitPrimaryWorkingTreeRoot } from '../../runtime/git.ts'
import {
  inspectLocalRegistry,
  invalidRegistryError,
  type LocalRegistryEntry,
  localRegistryWrite
} from '../../storage/local-registry.ts'
import { registryEntryForRepository } from '../../storage/repository-stores.ts'
import type { RepositoryLocation } from '../location.ts'
import type { RepositoryOperationContext, RepositorySkillActivationHost } from './types.ts'

/** Inherit only from a registered primary checkout in the same Git repository with the same declared identity. */
const registeredCheckout = async (
  context: RepositoryOperationContext,
  root: string,
  entries: readonly LocalRegistryEntry[]
): Promise<string | undefined> => {
  if (entries.some((entry) => entry.path === root)) return root
  if (!entries.length || !(await lstat(join(root, '.git')).catch(() => undefined))) return undefined
  const primary = await gitPrimaryWorkingTreeRoot(root, context.runner, context.environment)
  const entry = entries.find((candidate) => candidate.path === primary)
  if (!entry) return undefined
  try {
    const [current, original] = await Promise.all(
      [root, entry.path].map(async (path) =>
        declaredRepositoryIdentity(await readRepositoryDeclaration(`${path}/.ki.toml`))
      )
    )
    return current === entry.repository && original === entry.repository ? entry.path : undefined
  } catch {
    return undefined
  }
}

export const localRepositoryRegistration = async (
  context: RepositoryOperationContext,
  repository: string,
  skills: readonly ResolvedSkill[]
): Promise<string | undefined> => {
  if (!skills.some((skill) => skill.declaration.name === 'ki-repo')) return undefined
  const configuration = await context.inspectUserConfiguration(context.configurationDirectory)
  if (configuration.state === 'missing') return 'local KI configuration is missing; run `ki bootstrap` first'
  if (configuration.state === 'invalid') return `local KI configuration is invalid: ${configuration.errors.join('; ')}`
  const registry = await inspectLocalRegistry(context.stateDirectory)
  if (registry.state === 'invalid') return `local KI repository registry is invalid: ${registry.errors.join('; ')}`
  if (!(await registeredCheckout(context, repository, registry.repositories)))
    return `local KI repository registry does not register ${repository}`
  return undefined
}

export const localRepositoryRegistryWrites = async (
  context: RepositoryOperationContext,
  repository: RepositoryLocation
) => {
  const configuration = await context.inspectUserConfiguration(context.configurationDirectory)
  // Repository conformance remains portable: a caller without a local KI installation has no
  // user registry to update. Once one exists, an invalid configuration remains a hard error.
  if (configuration.state === 'missing') return []
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  const declaration = await readRepositoryDeclaration(repository.declaration)
  const identity = declaredRepositoryIdentity(declaration)
  const registry = await inspectLocalRegistry(context.stateDirectory)
  if (registry.state === 'invalid') throw invalidRegistryError(context.stateDirectory, registry.errors)
  const registryWrite = await localRegistryWrite(
    context.stateDirectory,
    registryEntryForRepository(repository.root, identity, registry.repositories)
  )
  if (!registryWrite) return []
  await mkdir(context.stateDirectory, { recursive: true })
  return prepareWrites(await realpath(context.stateDirectory), [registryWrite])
}

export const repositorySkillActivation = async (
  context: RepositoryOperationContext,
  repository: RepositoryLocation,
  selected: readonly ResolvedSkill[]
): Promise<RepositorySkillActivationHost | undefined> => {
  if (!selected.some((skill) => skill.declaration.name === 'ki-repo')) return undefined
  const declaration = await readRepositoryDeclaration(repository.declaration)
  const runtimeConfiguration = declaration.skills.find((skill) => skill.name === 'ki-repo')?.configuration
  if (!runtimeConfiguration || !Object.hasOwn(runtimeConfiguration, 'supported_runtimes')) return undefined
  const harnesses = await discoverInstalledHarnesses(context.dataDirectory)
  const skills = (
    await resolveRepositoryDeclaredSkills(repository.root, declaration, harnesses, context.dataDirectory)
  ).filter((skill) => skill.provider.kind === 'installed-harness')
  const registry = await inspectLocalRegistry(context.stateDirectory)
  const inspectionRepository = await registeredCheckout(context, repository.root, registry.repositories)
  return context.createSkillActivation({
    repository: repository.root,
    inspectionRepository,
    repositoryDeclaration: repository.declaration,
    skills
  })
}
