import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../configuration/index.ts'
import { KiError } from '../../errors.ts'
import { resolveRepository } from '../../repository/index.ts'
import { requiredLocalRegistry } from '../../storage/index.ts'
import { granolaCaptureRoot } from './layout.ts'
import { attribute, stringField } from './projection.ts'
import type { GranolaFolder, GranolaMeeting } from './source.ts'

export interface GranolaReceiver {
  readonly root: string
  readonly repository: string
  readonly folderIds: readonly string[]
  readonly duplicateFolderIds: readonly string[]
  readonly unfoldered: boolean | 'flag'
  readonly residual: boolean | 'flag'
  readonly captureRoot?: string
  readonly folderTerritories: Readonly<Record<string, string>>
}

export interface GranolaRouting {
  readonly selected: readonly RoutedGranolaMeeting[]
  readonly excluded: number
  readonly unfoldered: number
  readonly duplicated: number
  readonly flagged: readonly FlaggedGranolaMeeting[]
  readonly unknownFolders: readonly { readonly id: string; readonly title?: string }[]
}

export interface FlaggedGranolaMeeting {
  readonly id: string
  readonly title?: string
  readonly date?: string
  readonly folderIds: readonly string[]
  readonly reason: 'unfoldered' | 'unmatched'
}

export interface RoutedGranolaMeeting extends GranolaMeeting {
  readonly folderIds: readonly string[]
  readonly inferredUnfoldered: boolean
  readonly territories: readonly string[]
  readonly unmappedFolderIds: readonly string[]
}

const CONFIG_KEYS = new Set([
  'folder_ids',
  'duplicate_folder_ids',
  'unfoldered',
  'residual',
  'capture_root',
  'folder_territories'
])
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

const booleanValue = (value: unknown, name: string): boolean | 'flag' => {
  if (value === undefined) return false
  if (typeof value !== 'boolean' && value !== 'flag')
    throw new KiError(`[skills.ki-acquire-granola].${name} must be boolean or "flag"`)
  return value
}

const identifiers = (value: unknown, name: string): readonly string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !ID.test(item)))
    throw new KiError(`[skills.ki-acquire-granola].${name} must be an array of stable Granola IDs`)
  const items = value as string[]
  if (new Set(items).size !== items.length)
    throw new KiError(`[skills.ki-acquire-granola].${name} must not repeat Granola ID`)
  return [...items].sort((left, right) => left.localeCompare(right, 'en'))
}

const receiver = async (root: string, required: boolean): Promise<GranolaReceiver | undefined> => {
  const declaration = await readRepositoryDeclaration(join(root, '.ki.toml'))
  const skill = declaration.skills.find((candidate) => candidate.name === 'ki-acquire-granola')
  if (!skill) return undefined
  for (const key of Object.keys(skill.configuration))
    if (!CONFIG_KEYS.has(key)) throw new KiError(`[skills.ki-acquire-granola] has unsupported key ${key}`)
  const folderIds = identifiers(skill.configuration['folder_ids'], 'folder_ids')
  const duplicateFolderIds = identifiers(skill.configuration['duplicate_folder_ids'], 'duplicate_folder_ids')
  if (duplicateFolderIds.some((id) => !folderIds.includes(id)))
    throw new KiError('[skills.ki-acquire-granola].duplicate_folder_ids must be selected by folder_ids')
  const captureRoot = granolaCaptureRoot(skill.configuration['capture_root'])
  const mapping = skill.configuration['folder_territories']
  if (mapping !== undefined && (!captureRoot || !mapping || typeof mapping !== 'object' || Array.isArray(mapping)))
    throw new KiError(
      '[skills.ki-acquire-granola].folder_territories requires capture_root and a folder-to-territory table'
    )
  const folderTerritories = (mapping ?? {}) as Readonly<Record<string, string>>
  if (
    Object.entries(folderTerritories).some(
      ([id, territory]) =>
        !folderIds.includes(id) || typeof territory !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(territory)
    )
  )
    throw new KiError(
      '[skills.ki-acquire-granola].folder_territories must map selected folder IDs to safe territory names'
    )
  if (captureRoot && folderIds.some((id) => !folderTerritories[id]))
    throw new KiError('[skills.ki-acquire-granola].folder_territories must identify every selected folder')
  const unfoldered = booleanValue(skill.configuration['unfoldered'], 'unfoldered')
  const residual = booleanValue(skill.configuration['residual'], 'residual')
  if (!folderIds.length && !unfoldered && !residual) {
    if (!required) return undefined
    throw new KiError('[skills.ki-acquire-granola] must select a folder, unfoldered meetings, or residual meetings')
  }
  return {
    root,
    repository: declaredRepositoryIdentity(declaration),
    folderIds,
    duplicateFolderIds,
    unfoldered,
    residual,
    ...(captureRoot ? { captureRoot } : {}),
    folderTerritories
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
    const configured = await receiver(physical, physical === targetLocation.root)
    if (configured) receivers.push(configured)
  }
  const target = receivers.find((candidate) => candidate.root === targetLocation.root)
  /* v8 ignore next -- command adapter selection already proves the selected repository declares this skill. */
  if (!target)
    throw new KiError('selected repository must be registered and declare [skills.ki-acquire-granola] selectors', 2)
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
  const flagged: FlaggedGranolaMeeting[] = []
  const unknownFolders =
    options.target.residual === 'flag'
      ? options.folders
          .filter((folder) => !options.receivers.some((candidate) => candidate.folderIds.includes(folder.id)))
          .map((folder) => {
            const title = stringField(folder.projection, ['title', 'name'])
            return { id: folder.id, ...(title ? { title } : {}) }
          })
      : []
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
    if (destinations.some((candidate) => candidate.root === options.target.root)) {
      const folderMatch = folderIds.some((id) => options.target.folderIds.includes(id))
      const policy = inferredUnfoldered ? options.target.unfoldered : options.target.residual
      if (!folderMatch && policy === 'flag') {
        const title = stringField(meeting.projection, ['title']) ?? attribute(meeting.projection, 'title')
        const date = stringField(meeting.projection, ['date', 'meeting_date']) ?? attribute(meeting.projection, 'date')
        flagged.push({
          id: meeting.id,
          folderIds,
          reason: inferredUnfoldered ? 'unfoldered' : 'unmatched',
          ...(title ? { title } : {}),
          ...(date ? { date } : {})
        })
      } else {
        const territories = [
          ...new Set(
            folderIds.flatMap((id) =>
              options.target.folderTerritories[id] ? [options.target.folderTerritories[id] as string] : []
            )
          )
        ].sort()
        selected.push({
          ...meeting,
          folderIds,
          inferredUnfoldered,
          territories,
          unmappedFolderIds: folderIds.filter((id) => !options.target.folderTerritories[id])
        })
      }
    } else excluded += 1
  }
  return { selected, excluded, unfoldered, duplicated, flagged, unknownFolders }
}
