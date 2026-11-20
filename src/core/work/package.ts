import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { parse } from 'yaml'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import type { LocalRegistryEntry } from '../storage/local-registry.ts'
import { readWorkItemInventoryIfPresent, workItemLane } from './items.ts'
import { readDeclaredPlanningSource } from './planning.ts'
import { type WorkState, workStates } from './status.ts'

/** A package's entry file in the Cairn store, `work/<territory>/<id>/_index.md`. */
const ENTRY = '_index.md'
const WORK = 'work'

/** The rig's Cairn configuration, which chezmoi renders and the Cairn app reads, under the user's XDG configuration home. */
const CAIRN_CONFIGURATION = join('cairn', 'config.toml')

export interface CairnConfiguration {
  /** The store clone, from `[store] path`, with a leading `~` expanded. */
  readonly store?: string
  /** This rig's name, from `[rig] name`. */
  readonly rig?: string
}

/** Reads the rig's Cairn configuration; a missing file reads as empty, a malformed one is an error naming it. */
export const readCairnConfiguration = async (configHome: string, home: string): Promise<CairnConfiguration> => {
  const path = join(configHome, CAIRN_CONFIGURATION)
  const text = await readFile(path, 'utf8').catch(() => undefined)
  if (text === undefined) return {}
  let values: Record<string, unknown>
  try {
    values = parseToml(text)
  } catch (error) {
    throw new KiError(`${path} is not valid TOML: ${(error as Error).message}`)
  }
  const table = (name: string): Record<string, unknown> => Object(values[name])
  const store = table('store')['path']
  const rig = table('rig')['name']
  return {
    ...(typeof store === 'string' ? { store: store.replace(/^~(?=$|\/)/, home) } : {}),
    ...(typeof rig === 'string' ? { rig } : {})
  }
}

const frontMatter = (text: string): Record<string, unknown> | undefined => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return undefined
  try {
    const values: unknown = parse(match[1] as string)
    return values && typeof values === 'object' && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

interface MarkdownFile {
  readonly path: string
  readonly fields: Record<string, unknown>
  readonly body: string
}

const readMarkdown = async (path: string): Promise<MarkdownFile | undefined> => {
  const text = await readFile(path, 'utf8').catch(() => undefined)
  if (text === undefined) return undefined
  const fields = frontMatter(text)
  if (fields === undefined) throw new KiError(`${path} has no readable front matter`)
  return { path, fields, body: text }
}

const missing = (path: string, field: string, detail = 'is missing'): KiError =>
  new KiError(`${path}: ${field} ${detail}`)

const textField = (file: MarkdownFile, field: string): string => {
  const value = file.fields[field]
  if (typeof value !== 'string' || !value.trim()) throw missing(file.path, field)
  return value
}

const timeField = (file: MarkdownFile, field: string): string => {
  const value = textField(file, field)
  if (Number.isNaN(Date.parse(value))) throw missing(file.path, field, `is not a time: ${value}`)
  return value
}

const directories = async (path: string): Promise<readonly string[]> =>
  (await readdir(path, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

/**
 * The folder of a package named by its id: `work/<territory>/<id>/`, a sub-package `<id>+<name>` one folder down,
 * its entry file's `ki-id` confirming it.
 */
export const locateWorkPackage = async (store: string, id: string): Promise<string> => {
  const [base, ...subs] = id.split('+')
  const territory = (base as string).split('.')[0] as string
  const folder = join(store, WORK, territory, base as string, ...subs)
  const entry = await readMarkdown(join(folder, ENTRY))
  if (entry?.fields['ki-id'] !== id)
    throw new KiError(
      `no work package ${id} in ${join(store, WORK)}`,
      1,
      'name a package by its ki-id, as ki.summit, or pass --store <dir> for another store'
    )
  return folder
}

/** The package whose folder holds the working directory, and the store above its `work/` folder. */
export const enclosingWorkPackage = async (
  workingDirectory: string
): Promise<{ readonly store: string; readonly folder: string }> => {
  const parts = resolve(workingDirectory).split(sep)
  const index = parts.lastIndexOf(WORK)
  if (index > 0)
    for (let end = parts.length; end > index + 2; end--) {
      const folder = parts.slice(0, end).join(sep)
      if ((await readMarkdown(join(folder, ENTRY)))?.fields['ki-id'] !== undefined)
        return { store: parts.slice(0, index).join(sep), folder }
    }
  throw new KiError(
    `${workingDirectory} is not inside a work package`,
    1,
    'name the package, as ki work banner ki.summit, or run from its folder in the Cairn store'
  )
}

export interface WorkPackageHold {
  readonly kind: 'paused' | 'snoozing'
  readonly release: string | null
  readonly idle: boolean
}

export interface WorkPackageQuery {
  /** The query's tag, or `<change> question <n>` where it carries none. */
  readonly tag: string
  /** When the change document holding it was last revised. */
  readonly revised: string
}

export interface WorkPackageRoadmap {
  readonly records: number
  readonly open: number
  readonly done: number
  readonly ideas: number
}

export interface WorkPackageBanner {
  readonly id: string
  readonly label: string
  readonly state: WorkState
  readonly since: string
  readonly hold: WorkPackageHold | null
  readonly target: string | null
  readonly blocking: boolean
  /** The seat's role glyph, or null for a seat with no role yet. */
  readonly glyph: string | null
  /** The seat's actor's `ki-name` in the roster, or null for an unnamed seat. */
  readonly name: string | null
  /** The seat's actor id, as `actor:loreward`, or null for a seat with no role or no active actor in it. */
  readonly actor: string | null
  /** Open queries with the owner, oldest first; on hold, none. */
  readonly queries: readonly WorkPackageQuery[]
  readonly parked: number
  readonly changes: number
  readonly held: number
  readonly meetings: number
  /** The package repositories' roadmap counts, or null where none of them has a roadmap. */
  readonly roadmap: WorkPackageRoadmap | null
}

/** The lines of one `##` section, or of one `###` subsection inside it, up to the next heading of its level or above. */
const section = (body: string, heading: RegExp, level: number): readonly string[] => {
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return []
  const stop = new RegExp(`^#{1,${level}} `)
  const end = lines.findIndex((line, index) => index > start && stop.test(line))
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

const TAG_LEAD = /^\*\*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)(?=[ :(*])/
const TAG_MENTION = /\(([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z][A-Z0-9]+)\)/

interface DocumentQueries {
  readonly open: readonly WorkPackageQuery[]
  readonly parked: number
}

/** The numbered items of a change document's `### <n>.1 Questions` under `## <n>. Open`: answered, parked or open. */
const documentQueries = (file: MarkdownFile): DocumentQueries => {
  const open = section(file.body, /^## \d+\. Open\b/, 2)
  const questions = section(open.join('\n'), /^### \d+\.1 Questions\b/, 3)
  const items = questions.flatMap((line) => {
    const match = /^(\d+)\. (.*)$/.exec(line)
    return match ? [{ number: match[1] as string, text: match[2] as string }] : []
  })
  const live = items.filter((item) => !/^\*\*Done\b/.test(item.text))
  const parked = live.filter((item) => /\(parked\)/i.test(item.text))
  const change = basename(file.path, '.change.md')
  return {
    parked: parked.length,
    open: live
      .filter((item) => !parked.includes(item))
      .map((item) => ({
        tag: TAG_LEAD.exec(item.text)?.[1] ?? TAG_MENTION.exec(item.text)?.[1] ?? `${change} question ${item.number}`,
        revised: timeField(file, 'ki-revised')
      }))
  }
}

/** Every change document of a package and its sub-packages, in folder order. */
const changeDocuments = async (folder: string): Promise<readonly MarkdownFile[]> => {
  const files = (await readdir(folder)).filter((name) => /^\d+-.+\.change\.md$/.test(name)).sort()
  const own = await Promise.all(files.map((name) => readMarkdown(join(folder, name)) as Promise<MarkdownFile>))
  const subs = await Promise.all(
    (await directories(folder)).map(async (name) =>
      (await readMarkdown(join(folder, name, ENTRY))) ? changeDocuments(join(folder, name)) : []
    )
  )
  return [...own, ...subs.flat()]
}

const actorIds = (workers: unknown): readonly string[] =>
  (Array.isArray(workers) ? workers : []).flatMap((worker: unknown) => {
    const id: unknown = Object(worker)['id']
    return typeof id === 'string' ? [id] : []
  })

/** The id a meeting's entry file carries after `meeting:` in its `ki-id`, which is its folder's name. */
const meetingId = (entry: MarkdownFile): string => String(entry.fields['ki-id']).replace(/^meeting:/, '')

/** Every meeting entry file in the store's `meetings/`, at a node or one folder below it. */
const meetingEntries = async (store: string): Promise<readonly MarkdownFile[]> => {
  const root = join(store, 'meetings')
  const folders = (
    await Promise.all(
      (
        await directories(root)
      ).map(async (node) => [
        join(root, node),
        ...(await directories(join(root, node))).map((name) => join(root, node, name))
      ])
    )
  ).flat()
  const entries = await Promise.all(folders.map((folder) => readMarkdown(join(folder, ENTRY)).catch(() => undefined)))
  return entries.filter((entry): entry is MarkdownFile => entry?.fields['ki-document-type'] === 'meeting')
}

/** Open meetings in the store's `meetings/` that sit at the package or count one of its actors among their participants. */
const openMeetings = async (store: string, id: string, actors: readonly string[]): Promise<number> =>
  (await meetingEntries(store)).filter(
    (entry) =>
      entry.fields['ki-status'] === 'open' &&
      (meetingId(entry).startsWith(`${id}.`) ||
        actorIds(entry.fields['ki-participants']).some((actor) => actors.includes(actor)))
  ).length

/** An actor's `ki-name` in the store's roster, or undefined where its roster file names none. */
const rosterName = async (store: string, actor: string): Promise<string | undefined> => {
  const name = (await readMarkdown(join(store, 'roster', 'actors', actor.replace(/^actor:/, ''), ENTRY)))?.fields[
    'ki-name'
  ]
  return typeof name === 'string' && name.trim() ? name : undefined
}

export interface WorkPackageMeeting {
  /** The meeting's folder name, the id its entry file's `ki-id` carries after `meeting:`. */
  readonly id: string
  /** The other participants the session works with there, each by its roster name or, with none, its seat's id. */
  readonly with: readonly string[]
}

/**
 * The meetings the session sits in, each named by its id and the other participants under its `ki-participants`, the
 * session's own actor left out. The owner is never listed there, so is never named; an unknown meeting is an error.
 */
export const readSessionMeetings = async (
  store: string,
  ids: readonly string[],
  self: string | null
): Promise<readonly WorkPackageMeeting[]> => {
  if (ids.length === 0) return []
  const entries = await meetingEntries(store)
  return Promise.all(
    ids.map(async (id) => {
      const entry = entries.find((candidate) => meetingId(candidate) === id)
      if (!entry)
        throw new KiError(
          `no meeting ${id} in ${join(store, 'meetings')}`,
          1,
          'name a meeting by the id after meeting: in its ki-id, as cairn.wayfinder.designs'
        )
      const others = actorIds(entry.fields['ki-participants']).filter((actor) => actor !== self)
      return {
        id,
        with: await Promise.all(
          others.map(async (actor) => (await rosterName(store, actor)) ?? actor.replace(/^actor:/, ''))
        )
      }
    })
  )
}

/** The seat's role glyph from the roster's role page, and its actor's `ki-name` where the roster names one. */
const seat = async (
  store: string,
  entry: MarkdownFile
): Promise<{ readonly glyph: string | null; readonly name: string | null; readonly actor: string | null }> => {
  const role = entry.fields['ki-role']
  if (typeof role !== 'string') return { glyph: null, name: null, actor: null }
  const rolePage = join(store, 'roster', 'roles', role, ENTRY)
  const page = await readMarkdown(rolePage)
  if (!page) throw missing(rolePage, 'ki-glyph', `is missing: no role page for ki-role ${role} in ${entry.path}`)
  const glyph = textField(page, 'ki-glyph')
  const workers: readonly unknown[] = Array.isArray(entry.fields['ki-workers']) ? entry.fields['ki-workers'] : []
  const worker: Record<string, unknown> = Object(
    workers.find((candidate) => {
      const fields: Record<string, unknown> = Object(candidate)
      return fields['role'] === role && (fields['status'] ?? 'active') === 'active'
    })
  )
  const actor = worker['id']
  if (typeof actor !== 'string') return { glyph, name: null, actor: null }
  return { glyph, name: (await rosterName(store, actor)) ?? null, actor }
}

/** The roadmap counts of the package's repositories, each found in the local registry by its name. */
const roadmapCounts = async (
  entry: MarkdownFile,
  registry: readonly LocalRegistryEntry[]
): Promise<WorkPackageRoadmap | null> => {
  const named = entry.fields['ki-repositories'] ?? []
  if (!Array.isArray(named) || named.some((value) => typeof value !== 'string'))
    throw missing(entry.path, 'ki-repositories', 'must be a list of <territory folder>/<repository> names')
  const counts = await Promise.all(
    (named as string[]).map(async (name) => {
      const key = name.split('/').at(-1) as string
      const repository = registry.find((candidate) => candidate.key === key)
      if (!repository)
        throw new KiError(
          `${entry.path}: ki-repositories names ${name}, which is not in the local registry`,
          1,
          `register its checkout with ki registry add --repo <path>`
        )
      const planning = await readDeclaredPlanningSource(join(repository.path, REPOSITORY_DECLARATION_FILE))
      if (planning === undefined) return undefined
      const inventory = await readWorkItemInventoryIfPresent(repository.path, planning)
      const fault = inventory?.faults[0]
      if (fault) throw new KiError(`${join(repository.path, planning.directory, fault.file)}: ${fault.message}`)
      return inventory?.items
    })
  )
  const items = counts.flatMap((list) => list ?? [])
  if (counts.every((list) => list === undefined)) return null
  const lane = (lanes: readonly string[]) => items.filter((item) => lanes.includes(workItemLane(item))).length
  const done = lane(['done', 'cancelled'])
  const ideas = lane(['triage'])
  return { records: items.length, open: items.length - done - ideas, done, ideas }
}

const holdOf = (entry: MarkdownFile, state: WorkState): WorkPackageHold | null => {
  if (state !== 'on-hold') return null
  const hold: Record<string, unknown> = Object(entry.fields['ki-hold'])
  const reason = hold['reason']
  if (reason !== 'paused' && reason !== 'more-expected' && reason !== 'snoozing')
    throw missing(entry.path, 'ki-hold.reason', 'must be paused, more-expected or snoozing')
  const release = hold['release']
  if (reason === 'paused' && (typeof release !== 'string' || !release.trim()))
    throw missing(entry.path, 'ki-hold.release')
  return {
    kind: reason === 'paused' ? 'paused' : 'snoozing',
    release: reason === 'paused' ? (release as string) : null,
    idle: hold['set_by'] === 'worker'
  }
}

/** Reads what a package's banner shows from its folder in the Cairn store, refusing any missing or malformed field. */
export const readWorkPackageBanner = async (
  store: string,
  folder: string,
  registry: readonly LocalRegistryEntry[]
): Promise<WorkPackageBanner> => {
  const entry = (await readMarkdown(join(folder, ENTRY))) as MarkdownFile
  const id = textField(entry, 'ki-id')
  const state = textField(entry, 'ki-state') as WorkState
  if (!workStates.includes(state))
    throw missing(entry.path, 'ki-state', `must be one of ${workStates.join(', ')}, not ${state}`)
  const since = timeField(entry, 'ki-since')
  const target = state === 'handoff' ? textField(entry, 'ki-target') : null
  const hold = holdOf(entry, state)
  const documents = await changeDocuments(folder)
  const queries = documents.map(documentQueries)
  const open = queries
    .flatMap((document) => document.open)
    .sort((left, right) => Date.parse(left.revised) - Date.parse(right.revised))
  const parked = queries.reduce((total, document) => total + document.parked, 0)
  const held = section(entry.body, /^## Held\s*$/, 2).filter((line) => line.startsWith('- ')).length
  const label = entry.fields['ki-label']
  return {
    id,
    label: typeof label === 'string' && label.trim() ? label : id,
    state,
    since,
    hold,
    target,
    blocking: state === 'handoff-to-supervisor' && entry.fields['ki-blocking'] === true,
    ...(await seat(store, entry)),
    queries: hold ? [] : open,
    parked: hold ? parked + open.length : parked,
    changes: documents.length,
    held,
    meetings: await openMeetings(store, id, actorIds(entry.fields['ki-workers'])),
    roadmap: await roadmapCounts(entry, registry)
  }
}

/** The store a named package is read from: the given folder, then `MCP_CAIRN_STORE`, then the rig's Cairn configuration. */
export const resolveCairnStore = (
  given: string | undefined,
  environment: NodeJS.ProcessEnv,
  configuration: CairnConfiguration,
  workingDirectory: string
): string => {
  const store = given ?? (environment['MCP_CAIRN_STORE'] || undefined) ?? configuration.store
  if (store === undefined)
    throw new KiError(
      "no Cairn store: pass --store <dir>, set MCP_CAIRN_STORE, or set [store] path in the rig's cairn/config.toml",
      1
    )
  return resolve(workingDirectory, store)
}
