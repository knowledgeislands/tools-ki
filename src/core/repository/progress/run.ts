import type { ResolvedSkill } from '../../configuration/index.ts'
import { KiError } from '../../errors.ts'
import type { PackageScriptClaim } from '../../rubric/index.ts'
import {
  aggregatePackageScriptClaims,
  type PreparedSkill,
  prepareSkill,
  type RubricProgressReport
} from '../../runtime/index.ts'

/** Reports the item edges a live progress line needs, narrowed to the item code the renderer displays. */
export interface ItemProgressCodes {
  readonly onItemStart: (code: string) => void
  readonly onItemComplete: (code: string) => void
  /** Undefined while nothing is displaying, which is how a rubric learns not to emit at all. */
  readonly onProgressEvent?: (event: RubricProgressReport) => void
}

/** Semantic execution edges observed by a caller; no display or output policy crosses this boundary. */
export interface ProgressTracker {
  readonly loading: (loaded: number, total: number) => void
  readonly evidence: (gathered: number, total: number) => void
  readonly planned: (skills: readonly PreparedSkill[]) => void
  readonly start: (skill: PreparedSkill, code: string) => void
  readonly item: (skill: PreparedSkill, code: string) => void
  readonly skillComplete: (skill: PreparedSkill) => void
  readonly report: (skill: PreparedSkill, event: RubricProgressReport) => void
  readonly complete: () => void
  readonly failed: () => void
}

export const runPreparedWithProgress = async <Result>(
  prepared: readonly PreparedSkill[],
  run: (skill: PreparedSkill, progress: ItemProgressCodes) => Promise<Result>,
  progress?: ProgressTracker
): Promise<Result[]> => {
  const results: Result[] = []
  try {
    progress?.planned(prepared)
    for (const skill of prepared) {
      const result = await run(skill, {
        onItemStart: (code) => progress?.start(skill, code),
        onItemComplete: (code) => progress?.item(skill, code),
        ...(progress ? { onProgressEvent: (event) => progress.report(skill, event) } : {})
      })
      results.push(result)
      progress?.skillComplete(skill)
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  progress?.complete()
  return results
}

export const runWithProgress = async <Result>(
  skills: readonly ResolvedSkill[],
  run: (
    skill: PreparedSkill,
    progress: ItemProgressCodes,
    packageScriptClaims: readonly PackageScriptClaim[]
  ) => Promise<Result>,
  progress?: ProgressTracker,
  resolvedSkills: readonly ResolvedSkill[] = skills
): Promise<Result[]> => {
  const inventory: PreparedSkill[] = []
  let prepared: readonly PreparedSkill[] = []
  let packageScriptClaims: readonly PackageScriptClaim[] = []
  try {
    progress?.loading(0, resolvedSkills.length)
    for (const skill of resolvedSkills) {
      inventory.push(await prepareSkill(skill))
      progress?.loading(inventory.length, resolvedSkills.length)
    }
    const byIdentity = new Map(inventory.map((candidate) => [candidate.skill.identity, candidate]))
    prepared = skills.map((skill) => {
      const selected = byIdentity.get(skill.identity)
      /* v8 ignore next -- selected skills are resolved from the same declared inventory */
      if (!selected) throw new KiError(`progress lost selected skill ${skill.identity}`, 1)
      return selected
    })
    packageScriptClaims = aggregatePackageScriptClaims(inventory)
  } catch (error) {
    progress?.failed()
    throw error
  }
  return runPreparedWithProgress(
    prepared,
    (skill, itemProgress) => run(skill, itemProgress, packageScriptClaims),
    progress
  )
}

/** Runs a counted session-evidence phase before the prepared skills' mechanical-item phase. */
export const runWithEvidenceProgress = async <Evidence, Result>(
  skills: readonly ResolvedSkill[],
  gather: (
    skill: PreparedSkill,
    progress: { readonly onProgressEvent?: (event: RubricProgressReport) => void },
    packageScriptClaims: readonly PackageScriptClaim[]
  ) => Promise<Evidence>,
  run: (skill: PreparedSkill, evidence: Evidence, progress: ItemProgressCodes) => Promise<Result>,
  progress?: ProgressTracker,
  resolvedSkills: readonly ResolvedSkill[] = skills
): Promise<Result[]> => {
  const inventory: PreparedSkill[] = []
  const evidence = new Map<string, Evidence>()
  let prepared: readonly PreparedSkill[] = []
  try {
    progress?.loading(0, resolvedSkills.length)
    for (const skill of resolvedSkills) {
      inventory.push(await prepareSkill(skill))
      progress?.loading(inventory.length, resolvedSkills.length)
    }
    const byIdentity = new Map(inventory.map((prepared) => [prepared.skill.identity, prepared]))
    prepared = skills.map((skill) => {
      const selected = byIdentity.get(skill.identity)
      /* v8 ignore next -- selected skills are resolved from the same declared inventory */
      if (!selected) throw new KiError(`progress lost selected skill ${skill.identity}`, 1)
      return selected
    })
    const packageScriptClaims = aggregatePackageScriptClaims(inventory)
    progress?.evidence(0, prepared.length)
    for (const skill of prepared) {
      evidence.set(
        skill.skill.identity,
        await gather(
          skill,
          { ...(progress ? { onProgressEvent: (event) => progress.report(skill, event) } : {}) },
          packageScriptClaims
        )
      )
      progress?.evidence(evidence.size, prepared.length)
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  return runPreparedWithProgress(
    prepared,
    async (skill, itemProgress) => {
      const gathered = evidence.get(skill.skill.identity)
      // The map is filled from the same prepared collection immediately above; preserve a guard for future changes.
      /* v8 ignore next */
      if (gathered === undefined) throw new KiError(`progress lost evidence for ${skill.skill.identity}`, 1)
      return run(skill, gathered, itemProgress)
    },
    progress
  )
}
