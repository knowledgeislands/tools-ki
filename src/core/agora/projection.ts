import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  declaredRepositoryIdentity,
  REPOSITORY_DECLARATION_FILE,
  readRepositoryDeclaration
} from '../configuration/index.ts'
import { requiredLocalRegistry } from '../storage/index.ts'
import type { AgoraMember, AgoraProfile } from './resolution.ts'
import type { TargetObservation } from './targets/index.ts'

export interface ProjectionPath {
  readonly path: string
  readonly key?: string
  readonly repository?: string
}

export interface AgoraProjectionReport {
  readonly agora: AgoraProfile
  readonly target: string
  readonly source: string
  readonly matched: readonly ProjectionPath[]
  readonly missing: readonly ProjectionPath[]
  readonly extraRegistered: readonly ProjectionPath[]
  readonly unregisteredKi: readonly ProjectionPath[]
  readonly external: readonly ProjectionPath[]
  readonly exact: boolean
}

const byPath = (left: ProjectionPath, right: ProjectionPath): number => left.path.localeCompare(right.path, 'en')

const projectionPath = (member: AgoraMember): ProjectionPath => ({
  path: member.root,
  key: member.key,
  repository: member.repository
})

const registeredPhysicalRoots = async (
  stateDirectory: string
): Promise<ReadonlyMap<string, { readonly key: string; readonly repository: string }>> => {
  const roots = new Map<string, { readonly key: string; readonly repository: string }>()
  for (const repository of await requiredLocalRegistry(stateDirectory)) {
    const state = await lstat(repository.path).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink()) continue
    roots.set(await realpath(repository.path), { key: repository.key, repository: repository.repository })
  }
  return roots
}

const unregisteredRepository = async (root: string): Promise<string | undefined> => {
  const declarationPath = join(root, REPOSITORY_DECLARATION_FILE)
  const state = await lstat(declarationPath).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) return undefined
  try {
    return declaredRepositoryIdentity(await readRepositoryDeclaration(declarationPath))
  } catch {
    return undefined
  }
}

export const compareAgoraProjection = async (
  stateDirectory: string,
  agora: AgoraProfile,
  target: string,
  observation: TargetObservation
): Promise<AgoraProjectionReport> => {
  const expected = new Map(agora.members.map((member) => [member.root, member]))
  const registered = await registeredPhysicalRoots(stateDirectory)
  const matched = new Map<string, ProjectionPath>()
  const extraRegistered = new Map<string, ProjectionPath>()
  const unregisteredKi = new Map<string, ProjectionPath>()
  const external = new Map<string, ProjectionPath>()

  for (const observed of observation.roots) {
    if (observed.kind === 'external') {
      external.set(observed.value, { path: observed.value })
      continue
    }
    const state = await lstat(observed.value).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink()) {
      external.set(observed.value, { path: observed.value })
      continue
    }
    const root = await realpath(observed.value)
    const member = expected.get(root)
    if (member) {
      matched.set(root, projectionPath(member))
      continue
    }
    const registeredRepository = registered.get(root)
    if (registeredRepository) {
      extraRegistered.set(root, { path: root, ...registeredRepository })
      continue
    }
    const repository = await unregisteredRepository(root)
    if (repository) unregisteredKi.set(root, { path: root, repository })
    else external.set(root, { path: root })
  }

  const missing = agora.members.filter((member) => !matched.has(member.root)).map(projectionPath)
  const report = {
    agora,
    target,
    source: observation.source,
    matched: [...matched.values()].sort(byPath),
    missing,
    extraRegistered: [...extraRegistered.values()].sort(byPath),
    unregisteredKi: [...unregisteredKi.values()].sort(byPath),
    external: [...external.values()].sort(byPath)
  }
  return {
    ...report,
    exact:
      !report.missing.length &&
      !report.extraRegistered.length &&
      !report.unregisteredKi.length &&
      !report.external.length
  }
}
