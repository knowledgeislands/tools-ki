import type { ManagedArtifactReport, OrphanRecovery } from '../storage/index.ts'

export interface ManageCleanupPort {
  readonly reportArtifacts: () => Promise<readonly ManagedArtifactReport[]>
  readonly planOrphanRecovery: () => Promise<readonly OrphanRecovery[]>
}

export interface ManageCleanupResult {
  readonly artifacts: readonly ManagedArtifactReport[]
  readonly eligible: readonly OrphanRecovery[]
}

export const inspectManageCleanup = async (port: ManageCleanupPort): Promise<ManageCleanupResult> => {
  const artifacts = await port.reportArtifacts()
  const ownedPaths = new Set(artifacts.flatMap((report) => (report.path ? [report.path] : [])))
  // Prefix-based recovery remains visible until a valid manifest represents the same path.
  const eligible = (await port.planOrphanRecovery()).filter((recovery) => !ownedPaths.has(recovery.orphan.path))
  return { artifacts, eligible }
}
