import { mkdir, realpath } from 'node:fs/promises'
import type { ResolvedSkill } from '../../configuration/index.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  readRepositoryDeclaration,
  resolveRepositoryDeclaredSkills
} from '../../configuration/index.ts'
import { KiError } from '../../errors.ts'
import { prepareWrites } from '../../filesystem/index.ts'
import { discoverInstalledHarnesses } from '../../harness/index.ts'
import {
  inspectLocalRegistry,
  localRegistryWrite,
  registeredKnowledgeBaseStoreRoots,
  registryEntry
} from '../../storage/index.ts'
import type { RepositoryLocation } from '../index.ts'
import type { RepositoryOperationContext, RepositorySkillActivationHost } from './types.ts'

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
  if (!registry.repositories.some((entry) => entry.path === repository))
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
  if (declaredKnowledgeBaseStoreRoles(declaration).includes('sources')) {
    const registry = await inspectLocalRegistry(context.stateDirectory)
    if (registry.state === 'invalid')
      throw new KiError(`local KI repository registry is invalid: ${registry.errors.join('; ')}`, 1)
    const entry = registry.repositories.find(
      (candidate) => candidate.repository === identity && candidate.path === repository.root
    )
    try {
      await registeredKnowledgeBaseStoreRoots(entry)
    } catch {
      throw new KiError(
        `Knowledge Base ${repository.root} declares sources; run ki registry add --repo ${repository.root} --sources <absolute-path>`,
        1
      )
    }
    return []
  }
  const registryWrite = await localRegistryWrite(context.stateDirectory, registryEntry(repository.root, identity))
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
  const skills = (await resolveRepositoryDeclaredSkills(repository.root, declaration, harnesses)).filter(
    (skill) => skill.provider.kind === 'installed-harness'
  )
  return context.createSkillActivation({
    repository: repository.root,
    repositoryDeclaration: repository.declaration,
    skills
  })
}
