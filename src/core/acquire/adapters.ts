import type { DeclaredSkill, RepositoryDeclaration } from '../configuration/declaration.ts'
import { declaredRepositoryIdentity } from '../configuration/declaration.ts'
import { readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import {
  type AcquisitionAction,
  type AcquisitionAdapterDeclaration,
  discoverInstalledHarnesses,
  type HarnessCapability,
  type InstalledHarness
} from '../harness/index.ts'
import { resolveRepository } from '../repository/index.ts'

export type AcquisitionAdapterState = 'enabled' | 'available' | 'invalid'

export interface AcquisitionAdapterInventoryItem {
  readonly adapter: string
  readonly skill: string
  readonly state: AcquisitionAdapterState
  readonly resolved: boolean
  readonly actions: readonly AcquisitionAction[]
  readonly configuration: 'valid' | 'not-declared' | 'invalid'
  readonly executable: boolean
  readonly hint: string
  readonly issue?: string
  readonly declaration?: AcquisitionAdapterDeclaration
  readonly repositoryConfiguration?: Readonly<Record<string, unknown>>
}

export interface AcquisitionAdapterInventory {
  readonly root: string
  readonly repository: string
  readonly items: readonly AcquisitionAdapterInventoryItem[]
}

const executableAdapters = new Set(['chatgpt', 'granola'])
const expectedSkills = new Map([
  ['ki-acquire-chatgpt', 'chatgpt'],
  ['ki-acquire-claude', 'claude'],
  ['ki-acquire-codex', 'codex'],
  ['ki-acquire-granola', 'granola']
])

const providerFor = (
  harnesses: readonly InstalledHarness[],
  skill: string
): { readonly harness: InstalledHarness; readonly capability: HarnessCapability } | undefined => {
  for (const harness of harnesses) {
    const capability = harness.capabilities.find((candidate) => candidate.name === skill)
    if (capability) return { harness, capability }
  }
  return undefined
}

const validateConfiguration = (
  skill: DeclaredSkill,
  declaration: AcquisitionAdapterDeclaration
): { readonly state: 'valid' | 'invalid'; readonly issue?: string } => {
  const unsupported = Object.keys(skill.configuration).find((key) => !declaration.repositoryProperties.includes(key))
  return unsupported
    ? { state: 'invalid', issue: `[skills.${skill.name}] has unsupported property ${unsupported}` }
    : { state: 'valid' }
}

const publishedItem = (
  repositoryDeclaration: RepositoryDeclaration,
  harness: InstalledHarness,
  capability: HarnessCapability
): AcquisitionAdapterInventoryItem | undefined => {
  if (!capability.acquisition) return undefined
  const skill = repositoryDeclaration.skills.find((candidate) => candidate.name === capability.name)
  const harnessDeclared = repositoryDeclaration.harnesses.includes(harness.id)
  if (capability.acquisition.state === 'invalid') {
    return {
      adapter: expectedSkills.get(capability.name) ?? capability.name,
      skill: capability.name,
      state: 'invalid',
      resolved: false,
      actions: [],
      configuration: skill ? 'invalid' : 'not-declared',
      executable: false,
      hint: `repair ${capability.name} acquisition metadata in ${harness.id}`,
      issue: capability.acquisition.reason
    }
  }
  const adapterDeclaration = capability.acquisition.declaration
  const executable = executableAdapters.has(adapterDeclaration.adapter)
  const configuration = skill ? validateConfiguration(skill, adapterDeclaration) : undefined
  const resolved = Boolean(skill && harnessDeclared)
  const issue =
    configuration?.issue ??
    (skill && !harnessDeclared ? `repository does not declare provider Harness ${harness.id}` : undefined) ??
    (!executable ? 'executable adapter is not implemented by this ki build' : undefined)
  const state: AcquisitionAdapterState = issue ? 'invalid' : resolved ? 'enabled' : 'available'
  const hint = resolved
    ? issue
      ? `repair [skills.${capability.name}] before acquisition`
      : 'enabled for this repository'
    : skill
      ? `declare ${harness.id} in [repo].harnesses, then verify [skills.${capability.name}]`
      : `run ki skill add ${capability.name}, then declare [skills.${capability.name}] in .ki.toml`
  return {
    adapter: adapterDeclaration.adapter,
    skill: capability.name,
    state,
    resolved: resolved && !issue,
    actions: adapterDeclaration.actions,
    configuration: configuration?.state ?? 'not-declared',
    executable,
    hint,
    ...(issue ? { issue } : {}),
    declaration: adapterDeclaration,
    ...(skill ? { repositoryConfiguration: skill.configuration } : {})
  }
}

const unresolvedDeclaredItem = (skill: DeclaredSkill): AcquisitionAdapterInventoryItem | undefined => {
  const adapter = expectedSkills.get(skill.name)
  if (!adapter) return undefined
  return {
    adapter,
    skill: skill.name,
    state: 'invalid',
    resolved: false,
    actions: [],
    configuration: 'invalid',
    executable: executableAdapters.has(adapter),
    hint: `install a Harness publishing ${skill.name}, then verify the repository declaration`,
    issue: 'declared acquisition skill is unresolved'
  }
}

export const acquisitionAdapterInventory = async (options: {
  readonly repository?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly dataDirectory: string
}): Promise<AcquisitionAdapterInventory> => {
  const location = await resolveRepository(options)
  const repositoryDeclaration = await readRepositoryDeclaration(location.declaration)
  const harnesses = await discoverInstalledHarnesses(options.dataDirectory)
  const items = harnesses.flatMap((harness) =>
    harness.capabilities.flatMap((capability) => {
      const item = publishedItem(repositoryDeclaration, harness, capability)
      return item ? [item] : []
    })
  )
  for (const skill of repositoryDeclaration.skills) {
    if (providerFor(harnesses, skill.name)) continue
    const unresolved = unresolvedDeclaredItem(skill)
    if (unresolved) items.push(unresolved)
  }
  const byAdapter = new Map<string, AcquisitionAdapterInventoryItem>()
  for (const item of items.sort((left, right) => left.adapter.localeCompare(right.adapter, 'en'))) {
    const previous = byAdapter.get(item.adapter)
    if (previous) {
      byAdapter.set(item.adapter, {
        ...item,
        state: 'invalid',
        resolved: false,
        configuration: 'invalid',
        hint: `remove duplicate acquisition adapter declaration for ${item.adapter}`,
        issue: `adapter is published by both ${previous.skill} and ${item.skill}`
      })
    } else {
      byAdapter.set(item.adapter, item)
    }
  }
  return {
    root: location.root,
    repository: declaredRepositoryIdentity(repositoryDeclaration),
    items: [...byAdapter.values()]
  }
}

export const selectAcquisitionAdapters = (
  inventory: AcquisitionAdapterInventory,
  action: AcquisitionAction,
  options: { readonly adapter?: string; readonly all?: boolean }
): readonly AcquisitionAdapterInventoryItem[] => {
  if (options.adapter && options.all) throw new KiError('--adapter and --all are mutually exclusive', 2)
  const enabled = inventory.items.filter((item) => item.state === 'enabled' && item.resolved && item.executable)
  const selected = options.adapter
    ? inventory.items.filter((item) => item.adapter === options.adapter)
    : options.all
      ? enabled.filter((item) => item.actions.includes(action))
      : enabled.length === 1
        ? enabled
        : []
  if (options.adapter && !selected.length) {
    throw new KiError(
      `acquisition adapter ${options.adapter} is unknown; run ki acquire list for repository adapter status`,
      2
    )
  }
  if (options.adapter && selected[0]?.state !== 'enabled') {
    throw new KiError(
      `acquisition adapter ${options.adapter} is not enabled: ${selected[0]?.issue ?? selected[0]?.hint}`,
      2
    )
  }
  if (!options.adapter && !options.all && enabled.length !== 1) {
    throw new KiError(
      enabled.length === 0
        ? 'no acquisition adapter is enabled; run ki acquire list and declare one acquisition skill'
        : `adapter selection is ambiguous (${enabled.map((item) => item.adapter).join(', ')}); use --adapter <name> or --all`,
      2
    )
  }
  if (options.all && !selected.length) {
    throw new KiError(`no enabled acquisition adapter supports ${action}; run ki acquire list`, 2)
  }
  const unsupported = selected.find((item) => !item.actions.includes(action))
  if (unsupported) throw new KiError(`acquisition adapter ${unsupported.adapter} does not support ${action}`, 2)
  return selected
}
