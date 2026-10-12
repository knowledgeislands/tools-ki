import { readdir } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import type { KiError } from '../errors.ts'
import { type LocalRegistryEntry, replaceLocalRegistryEntry, requiredLocalRegistry } from '../storage/local-registry.ts'
import { discoverCheckouts } from './discovery.ts'
import { remoteIdentity, requiredGit, retargetRemote } from './git.ts'
import {
  busyDirectories,
  claudeFolders,
  claudeProjects,
  exists,
  linkedWorktrees,
  pathMap,
  readClaudeState,
  symlinkChanges,
  within
} from './host.ts'
import { readEstateTargets } from './manifest.ts'
import type { ConvergeAction, ConvergeItem, ConvergePlan, EstatePorts, EstateTarget } from './model.ts'

export interface ConvergeOptions {
  readonly manifest: string
  /** Checkouts that may move although a process works inside them, such as the caller's own. */
  readonly allowBusy: readonly string[]
  readonly clone: boolean
}

const canonical = (identity: string): string => `https://github.com/${identity}`

interface Survey {
  readonly ports: EstatePorts
  readonly options: ConvergeOptions
  readonly checkouts: ReadonlyMap<string, readonly string[]>
  readonly busy: readonly string[]
  readonly claudeKeys: readonly string[]
  readonly destinations: ReadonlyMap<string, number>
  registry: readonly LocalRegistryEntry[]
}

const item = (
  target: EstateTarget,
  fields: Omit<ConvergeItem, 'target' | 'notes' | 'actions'> & Partial<ConvergeItem>
): ConvergeItem => ({
  target,
  notes: [],
  actions: [],
  ...fields
})

const planTarget = async (survey: Survey, target: EstateTarget): Promise<ConvergeItem> => {
  const { ports, options } = survey
  const paths = [...new Set([...(survey.checkouts.get(target.from) ?? []), ...(survey.checkouts.get(target.to) ?? [])])]
  if (!paths.length) {
    if (!target.register) return item(target, { state: 'absent', reasons: ['no local checkout'] })
    if (await exists(target.pathTo))
      return item(target, {
        state: 'skip',
        reasons: [`target ${target.pathTo} exists but is not a checkout of ${target.to}`]
      })
    if (!options.clone) return item(target, { state: 'to clone', reasons: [] })
    return item(target, {
      state: 'converge',
      reasons: [],
      actions: [{ kind: 'clone', url: `git@github.com:${target.to}.git`, path: target.pathTo }]
    })
  }
  if (paths.length > 1) return item(target, { state: 'skip', reasons: [`several checkouts: ${paths.join(', ')}`] })
  const checkout = paths[0] as string
  const notes: string[] = []
  const reasons: string[] = []
  if (target.pathFrom && checkout !== target.pathFrom && checkout !== target.pathTo)
    notes.push(`found at ${checkout}, not the manifest path_from ${target.pathFrom}`)
  const moving = checkout !== target.pathTo
  if (moving) {
    const status = (await requiredGit(ports, checkout, ['status', '--porcelain'])).split('\n').filter(Boolean)
    const changed = status.filter((line) => !line.startsWith('??')).length
    if (changed) reasons.push(`tree has ${changed} uncommitted change(s)`)
    if (status.length > changed) notes.push(`${status.length - changed} untracked file(s) move with the checkout`)
    if (await exists(target.pathTo)) reasons.push(`target ${target.pathTo} already exists`)
    if ((survey.destinations.get(target.pathTo) as number) > 1)
      reasons.push(`another manifest entry also targets ${target.pathTo}`)
    const holder = survey.busy.find((directory) => within(checkout, directory))
    if (holder && !options.allowBusy.includes(checkout)) reasons.push(`busy: a process is working in ${holder}`)
  }
  const actions: ConvergeAction[] = []
  if (moving) {
    const worktrees = (await linkedWorktrees(ports, checkout)).map((before) => ({
      before,
      after: pathMap([{ from: checkout, to: target.pathTo }])(before)
    }))
    actions.push({ kind: 'move', from: checkout, to: target.pathTo, worktrees })
  }
  const url = (await requiredGit(ports, checkout, ['remote', 'get-url', 'origin'])).trim()
  if (remoteIdentity(url) !== target.to)
    actions.push({ kind: 'remote', path: target.pathTo, from: url, to: retargetRemote(url, target.to) })
  let registry = survey.registry
  const entry =
    registry.find((candidate) => candidate.path === checkout) ??
    registry.find((candidate) => [canonical(target.from), canonical(target.to)].includes(candidate.repository))
  if (!entry) notes.push('not in the ki registry')
  else {
    const after = { ...entry, key: basename(target.pathTo), repository: canonical(target.to), path: target.pathTo }
    if (after.key !== entry.key || after.repository !== entry.repository || after.path !== entry.path) {
      try {
        registry = replaceLocalRegistryEntry(registry, entry, after)
        actions.push({ kind: 'registry', before: entry, after })
      } catch (error) {
        reasons.push(`registry: ${(error as KiError).message}`)
      }
    }
  }
  if (reasons.length) return item(target, { state: 'skip', checkout, reasons, notes })
  if (moving) {
    const folders = await claudeFolders(ports.homeDirectory, checkout, target.pathTo)
    notes.push(...folders.notes)
    for (const rename of folders.renames) actions.push({ kind: 'claude-folder', from: rename.before, to: rename.after })
    for (const key of survey.claudeKeys.filter((candidate) => within(checkout, candidate))) {
      const renamed = target.pathTo + key.slice(checkout.length)
      if (survey.claudeKeys.includes(renamed))
        notes.push(`~/.claude.json already holds project ${renamed}; not merging ${key}`)
      else actions.push({ kind: 'claude-key', from: key, to: renamed })
    }
  }
  survey.registry = registry
  return item(target, { state: actions.length ? 'converge' : 'no-op', checkout, reasons, notes, actions })
}

/**
 * Former parent directories after the moves, deepest first: empty ones are removed, and one that
 * lost a child but still holds entries is reported with what remains.
 */
const formerParents = async (
  workspaces: string,
  moves: readonly { readonly from: string; readonly to: string }[]
): Promise<Pick<ConvergePlan, 'finalActions' | 'leftovers'>> => {
  const vacated = new Set(moves.map((move) => move.from))
  const ancestors = new Set<string>()
  for (const move of moves)
    for (
      let directory = dirname(move.from);
      directory !== workspaces && within(workspaces, directory);
      directory = dirname(directory)
    )
      ancestors.add(directory)
  const ordered = [...ancestors].sort(
    (left, right) => right.split('/').length - left.split('/').length || left.localeCompare(right)
  )
  const removed: ConvergeAction[] = []
  const leftovers: { path: string; entries: string[] }[] = []
  for (const directory of ordered) {
    if (moves.some((move) => within(directory, move.to))) continue
    const children = (await readdir(directory)).map((name) => join(directory, name))
    const remaining = children.filter((child) => !vacated.has(child))
    if (remaining.length === children.length) continue
    if (remaining.length) leftovers.push({ path: directory, entries: remaining.map((child) => basename(child)).sort() })
    else {
      vacated.add(directory)
      removed.push({ kind: 'rmdir', path: directory })
    }
  }
  return { finalActions: removed, leftovers }
}

export const planConvergence = async (ports: EstatePorts, options: ConvergeOptions): Promise<ConvergePlan> => {
  const targets = await readEstateTargets(options.manifest, ports.homeDirectory)
  const registry = await requiredLocalRegistry(ports.stateDirectory)
  const destinations = new Map<string, number>()
  for (const target of targets) destinations.set(target.pathTo, (destinations.get(target.pathTo) ?? 0) + 1)
  const survey: Survey = {
    ports,
    options,
    checkouts: await discoverCheckouts(ports, registry),
    busy: await busyDirectories(ports),
    claudeKeys: claudeProjects(await readClaudeState(ports.homeDirectory)),
    destinations,
    registry
  }
  const items: ConvergeItem[] = []
  for (const target of targets) items.push(await planTarget(survey, target))
  const moves = items.flatMap((entry) => entry.actions.flatMap((action) => (action.kind === 'move' ? [action] : [])))
  const symlinks = await symlinkChanges(ports, moves)
  const parents = await formerParents(join(ports.homeDirectory, 'workspaces'), moves)
  return {
    manifest: options.manifest,
    items,
    finalActions: [
      ...symlinks
        .filter((link) => !link.tracked)
        .map((link) => ({ kind: 'symlink' as const, path: link.path, from: link.from, to: link.to })),
      ...parents.finalActions
    ],
    trackedSymlinks: symlinks.filter((link) => link.tracked).map(({ path, from, to }) => ({ path, from, to })),
    leftovers: parents.leftovers,
    sweepPatterns: [
      ...moves.map((move) => ({ kind: 'path' as const, value: relative(ports.homeDirectory, move.from) })),
      ...targets
        .filter((target) => target.from !== target.to)
        .map((target) => ({ kind: 'identity' as const, value: target.from }))
    ]
  }
}
