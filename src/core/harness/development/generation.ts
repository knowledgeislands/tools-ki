import { lstat, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isRecord, type ResolvedSkill } from '../../configuration/index.ts'
import { KiError } from '../../errors.ts'
import type {
  DevelopmentGenerationEvent,
  DevelopmentGenerationPort,
  GeneratedSurfaceState,
  PreparedSkillGeneration
} from './types.ts'
import { assertDevelopmentWriteTree } from './write-tree.ts'

/** Skill-relative path of the module that renders a skill's generated surfaces. */
const GENERATION_MODULE = 'scripts/generate/index.ts'
const GENERATION_CONTRACT_VERSION = 1

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')

const diskState = async (
  root: string,
  path: string,
  content: string
): Promise<Pick<GeneratedSurfaceState, 'state' | 'mode'>> => {
  const state = await lstat(join(root, path)).catch(() => undefined)
  if (!state) return { state: 'missing' }
  if (!state.isFile() || state.isSymbolicLink())
    throw new KiError(`generated surface ${path} must be a regular file below the Harness root`, 1)
  const current = await readFile(join(root, path), 'utf8')
  return { state: current === content ? 'in-sync' : 'stale', mode: state.mode & 0o777 }
}

/**
 * Import a skill's `scripts/generate/index.ts`, render its surfaces against the resolved Harness root and compare each
 * with the bytes on disk. The module renders and never writes; only the host publishes.
 */
export const prepareSkillGeneration = async (skill: ResolvedSkill): Promise<PreparedSkillGeneration> => {
  const root = await realpath(skill.provider.root)
  const modulePath = join(root, skill.capability.source, GENERATION_MODULE)
  if (!(await lstat(modulePath).catch(() => undefined))?.isFile())
    throw new KiError(`${skill.identity} does not provide generated surfaces`, 1)
  let module: Record<string, unknown>
  try {
    module = await import(pathToFileURL(modulePath).href)
  } catch {
    throw new KiError(`${skill.identity} generator could not be imported`, 1)
  }
  const { default: candidate } = module
  if (!isRecord(candidate)) throw new KiError(`${skill.identity} generator default export is not a table`, 1)
  const { contract, name, generate } = candidate
  if (contract !== GENERATION_CONTRACT_VERSION)
    throw new KiError(`${skill.identity} generator has an unsupported contract version`, 1)
  if (name !== skill.capability.name)
    throw new KiError(`${skill.identity} generator name does not match the installed capability`, 1)
  if (typeof generate !== 'function') throw new KiError(`${skill.identity} generator must have a generate function`, 1)
  let rendered: unknown
  try {
    rendered = await generate(root)
  } catch (error) {
    throw new KiError(
      `${skill.identity} generator failed: ${error instanceof Error ? error.message : String(error)}`,
      1
    )
  }
  if (!Array.isArray(rendered)) throw new KiError(`${skill.identity} generator must return an array of surfaces`, 1)
  const seen = new Set<string>()
  const surfaces: GeneratedSurfaceState[] = []
  for (const surface of rendered) {
    const { path, content } = isRecord(surface) ? surface : {}
    if (typeof path !== 'string' || typeof content !== 'string')
      throw new KiError(`${skill.identity} generator surfaces must each have a path and content`, 1)
    if (!safeRelativePath(path)) throw new KiError(`${skill.identity} generated surface path ${path} is unsafe`, 1)
    if (seen.has(path)) throw new KiError(`${skill.identity} generates ${path} more than once`, 1)
    seen.add(path)
    surfaces.push({ path, content, ...(await diskState(root, path, content)) })
  }
  return { root, surfaces }
}

export const inspectDevelopmentGeneration = async (
  port: DevelopmentGenerationPort,
  skill: string,
  options: { readonly write: boolean; readonly workingDirectory: string },
  emit: (event: DevelopmentGenerationEvent) => void
): Promise<void> => {
  const resolved = await port.resolveSkill(skill)
  const { root, surfaces } = await port.prepareGeneration(resolved)
  const drifted = surfaces.filter((surface) => surface.state !== 'in-sync')
  if (options.write) {
    await assertDevelopmentWriteTree(port, resolved, root, options.workingDirectory, 'generated surface set')
    if (drifted.length > 0)
      await port.publish(
        root,
        drifted.map(({ path, content, state, mode }) =>
          state === 'missing' ? { path, content, create: true } : { path, content, mode }
        )
      )
    for (const surface of drifted) emit({ kind: 'written', target: join(root, surface.path) })
    if (drifted.length === 0) emit({ kind: 'in-sync', identity: resolved.identity, count: surfaces.length, root })
    return
  }
  if (drifted.length === 0) {
    emit({ kind: 'in-sync', identity: resolved.identity, count: surfaces.length, root })
    return
  }
  for (const surface of drifted)
    emit({
      kind: 'out-of-sync',
      identity: resolved.identity,
      path: surface.path,
      reason: surface.state === 'missing' ? 'is missing' : 'is stale',
      root
    })
  throw new KiError(`${resolved.identity} has ${drifted.length} generated surface(s) out of step`, 1)
}
