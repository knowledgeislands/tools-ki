import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { type AgentContext, agentsDirectory } from './context.ts'
import { readQueue } from './runs.ts'

/** How many closed runs `_archive/` keeps when the sweep is not told otherwise. */
export const archiveKept = 10

export interface SweepRequest {
  /** The number of most recently closed runs `_archive/` keeps, at least 1. */
  readonly keep: number
  /** Remove what the sweep finds; without it the sweep only reports. */
  readonly write: boolean
}

const modified = async (path: string): Promise<number> => (await stat(path).catch(() => undefined))?.mtimeMs ?? 0

/** The closed run an `_archive/` entry belongs to: its folder, its tarball or its close note. */
const archivedRun = (name: string, directory: boolean): string | undefined => {
  if (directory) return name
  for (const suffix of ['.tar.gz', '.close.md']) if (name.endsWith(suffix)) return name.slice(0, -suffix.length)
  return undefined
}

/**
 * The `_archive/` entries of every closed run beyond the newest `keep`, a run's folder, tarball
 * and close note together. A run is as old as its close note; one without a note counts as
 * oldest. An entry that belongs to no run is never touched.
 */
const expiredArchives = async (archive: string, keep: number): Promise<readonly string[]> => {
  const runs = new Map<string, string[]>()
  for (const entry of await readdir(archive, { withFileTypes: true }).catch(() => [])) {
    const run = archivedRun(entry.name, entry.isDirectory())
    if (run !== undefined) runs.set(run, [...(runs.get(run) ?? []), join(archive, entry.name)])
  }
  const aged = await Promise.all(
    [...runs].map(async ([run, paths]) => ({
      run,
      paths,
      at: Math.max(await modified(join(archive, run, 'close.md')), await modified(join(archive, `${run}.close.md`)))
    }))
  )
  aged.sort((left, right) => right.at - left.at || left.run.localeCompare(right.run))
  return aged
    .slice(keep)
    .flatMap((run) => run.paths)
    .sort()
}

/**
 * Each open run's `<name>.queued.md` or `<name>.draft.md` that a launch has superseded: a
 * `<name>.prompt.md` at least as new holds the brief, and the name is not queued again.
 */
const spentBriefs = async (context: AgentContext, agents: string): Promise<readonly string[]> => {
  const spent: string[] = []
  for (const entry of await readdir(agents, { withFileTypes: true }).catch(() => []))
    if (entry.isDirectory() && entry.name !== '_archive') {
      const directory = join(agents, entry.name)
      const queued = new Set((await readQueue(context, directory)).map((request) => request.name))
      for (const file of (await readdir(directory)).sort()) {
        const name = /^(.+)\.(?:queued|draft)\.md$/.exec(file)?.[1]
        if (name === undefined || queued.has(name)) continue
        const prompt = await modified(join(directory, `${name}.prompt.md`))
        if (prompt && prompt >= (await modified(join(directory, file)))) spent.push(join(directory, file))
      }
    }
  return spent
}

/**
 * Finds what the agents directory has outlived: closed runs beyond the newest `keep` in
 * `_archive/`, and briefs a launch has copied into its prompt. Removes them only on `write`;
 * returns their paths either way.
 */
export const sweepAgents = async (context: AgentContext, request: SweepRequest): Promise<readonly string[]> => {
  const agents = agentsDirectory(context)
  const paths = [
    ...(await expiredArchives(join(agents, '_archive'), request.keep)),
    ...(await spentBriefs(context, agents))
  ]
  if (request.write) for (const path of paths) await rm(path, { recursive: true, force: true })
  return paths
}
