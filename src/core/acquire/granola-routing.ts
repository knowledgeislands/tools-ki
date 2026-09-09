import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { resolveRepository } from '../repository/index.ts'
import { requiredLocalRegistry } from '../storage/index.ts'
import type { GranolaFolder, GranolaMeeting } from './granola-source.ts'

export interface GranolaReceiver {
  readonly root: string
  readonly repository: string
  readonly folderIds: readonly string[]
  readonly duplicateFolderIds: readonly string[]
  readonly unfoldered: boolean
  readonly residual: boolean
}

export interface GranolaRouting {
  readonly selected: readonly RoutedGranolaMeeting[]
  readonly excluded: number
  readonly unfoldered: number
  readonly duplicated: number
}

export interface RoutedGranolaMeeting extends GranolaMeeting {
  readonly folderIds: readonly string[]
  readonly inferredUnfoldered: boolean
}

const CONFIG_KEYS = new Set(['folder_ids', 'duplicate_folder_ids', 'unfoldered', 'residual'])
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

const booleanValue = (value: unknown, name: string): boolean => {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new KiError(`[skills.ki-housekeeping-granola].${name} must be boolean`)
  return value
}

const identifiers = (value: unknown, name: string): readonly string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !ID.test(item)))
    throw new KiError(`[skills.ki-housekeeping-granola].${name} must be an array of stable Granola IDs`)
  const items = value as string[]
  if (new Set(items).size !== items.length)
    throw new KiError(`[skills.ki-housekeeping-granola].${name} must not repeat Granola ID`)
  return [...items].sort((left, right) => left.localeCompare(right, 'en'))
}

const receiver = async (root: string): Promise<GranolaReceiver | undefined> => {
  const declaration = await readRepositoryDeclaration(join(root, '.ki.toml'))
  const skill = declaration.skills.find((candidate) => candidate.name === 'ki-housekeeping-granola')
  if (!skill) return undefined
  for (const key of Object.keys(skill.configuration))
    if (!CONFIG_KEYS.has(key)) throw new KiError(`[skills.ki-housekeeping-granola] has unsupported key ${key}`)
  const folderIds = identifiers(skill.configuration['folder_ids'], 'folder_ids')
  const duplicateFolderIds = identifiers(skill.configuration['duplicate_folder_ids'], 'duplicate_folder_ids')
  if (duplicateFolderIds.some((id) => !folderIds.includes(id)))
    throw new KiError('[skills.ki-housekeeping-granola].duplicate_folder_ids must be selected by folder_ids')
  const unfoldered = booleanValue(skill.configuration['unfoldered'], 'unfoldered')
  const residual = booleanValue(skill.configuration['residual'], 'residual')
  if (!folderIds.length && !unfoldered && !residual)
    throw new KiError(
      '[skills.ki-housekeeping-granola] must select a folder, unfoldered meetings, or residual meetings'
    )
  return {
    root,
    repository: declaredRepositoryIdentity(declaration),
    folderIds,
    duplicateFolderIds,
    unfoldered,
    residual
  }
}

export const granolaReceivers = async (options: {
  readonly repository?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly stateDirectory: string
}): Promise<{ readonly target: GranolaReceiver; readonly receivers: readonly GranolaReceiver[] }> => {
  const targetLocation = await resolveRepository(options)
  const entries = await requiredLocalRegistry(options.stateDirectory)
  const receivers: GranolaReceiver[] = []
  for (const entry of entries) {
    const physical = await realpath(entry.path).catch(() => {
      throw new KiError(`registered repository is unavailable: ${entry.repository}`)
    })
    const configured = await receiver(physical)
    if (configured) receivers.push(configured)
  }
  const target = receivers.find((candidate) => candidate.root === targetLocation.root)
  if (!target)
    throw new KiError(
      'selected repository must be registered and declare [skills.ki-housekeeping-granola] selectors',
      2
    )
  return { target, receivers: receivers.sort((left, right) => left.repository.localeCompare(right.repository, 'en')) }
}

const selectedReceivers = (
  meetingFolderIds: readonly string[],
  receivers: readonly GranolaReceiver[]
): readonly GranolaReceiver[] => {
  const folderMatches = receivers.filter((candidate) => candidate.folderIds.some((id) => meetingFolderIds.includes(id)))
  if (folderMatches.length) return folderMatches
  if (!meetingFolderIds.length) return receivers.filter((candidate) => candidate.unfoldered)
  return receivers.filter((candidate) => candidate.residual)
}

const intentionalDuplicate = (folderIds: readonly string[], receivers: readonly GranolaReceiver[]): boolean =>
  folderIds.length > 0 &&
  receivers.every((candidate) => {
    const selected = candidate.folderIds.filter((id) => folderIds.includes(id))
    return selected.length > 0 && selected.every((id) => candidate.duplicateFolderIds.includes(id))
  })

export const routeGranolaMeetings = (options: {
  readonly target: GranolaReceiver
  readonly receivers: readonly GranolaReceiver[]
  readonly meetings: ReadonlyMap<string, GranolaMeeting>
  readonly folders: readonly GranolaFolder[]
  readonly folderMeetings: ReadonlyMap<string, ReadonlyMap<string, GranolaMeeting>>
}): GranolaRouting => {
  const knownFolders = new Set(options.folders.map((folder) => folder.id))
  for (const candidate of options.receivers)
    for (const id of candidate.folderIds)
      if (!knownFolders.has(id)) throw new KiError(`${candidate.repository} selects unavailable Granola folder ${id}`)

  const selected: RoutedGranolaMeeting[] = []
  let excluded = 0
  let unfoldered = 0
  let duplicated = 0
  for (const meeting of [...options.meetings.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
    const folderIds = [...options.folderMeetings.entries()]
      .filter(([, contents]) => contents.has(meeting.id))
      .map(([id]) => id)
      .sort((left, right) => left.localeCompare(right, 'en'))
    const inferredUnfoldered = folderIds.length === 0
    if (inferredUnfoldered) unfoldered += 1
    const destinations = selectedReceivers(folderIds, options.receivers)
    if (!destinations.length)
      throw new KiError(
        `Granola meeting ${meeting.id} is ${inferredUnfoldered ? 'unfoldered' : 'unmatched'}; receiver coverage is incomplete`
      )
    if (destinations.length > 1 && !intentionalDuplicate(folderIds, destinations))
      throw new KiError(`Granola meeting ${meeting.id} maps to conflicting receivers; explicit duplication is required`)
    if (destinations.length > 1) duplicated += 1
    if (destinations.some((candidate) => candidate.root === options.target.root))
      selected.push({ ...meeting, folderIds, inferredUnfoldered })
    else excluded += 1
  }
  return { selected, excluded, unfoldered, duplicated }
}
