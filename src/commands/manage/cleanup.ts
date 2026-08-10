import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type ManagedArtifactReport, reportManagedArtifacts } from '../../core/managed-artifacts.ts'
import { planOrphanRecovery } from '../../core/registry.ts'
import { renderTree } from '../../core/tree-rendering.ts'

const eligibility: Record<'restore' | 'remove' | 'refuse', string> = {
  restore: 'restorable',
  remove: 'removable',
  refuse: 'needs manual inspection'
}

const artifactSummary = (reports: readonly ManagedArtifactReport[]): string => {
  const counts = new Map<ManagedArtifactReport['kind'], number>()
  for (const report of reports) counts.set(report.kind, (counts.get(report.kind) ?? 0) + 1)
  return [
    `CANDIDATES=${counts.get('candidate') ?? 0}`,
    `LIVE=${counts.get('live') ?? 0}`,
    `INTERRUPTED_RECOVERABLE=${counts.get('interrupted-recoverable') ?? 0}`,
    `MANUALLY_ALTERED=${counts.get('manually-altered') ?? 0}`,
    `FOREIGN=${counts.get('foreign') ?? 0}`,
    `UNREADABLE_MANIFESTS=${counts.get('unreadable-manifest') ?? 0}`
  ].join(' ')
}

export const createCleanupCommand = (context: KiContext): Command =>
  new Command('cleanup').description('report eligible KI-managed stale state').action(async () => {
    const reports = await reportManagedArtifacts(context.paths.state, context.paths.data)
    const ownedPaths = new Set(reports.flatMap((report) => (report.path ? [report.path] : [])))
    // Existing prefix-based recovery remains visible until it is represented by a valid manifest.
    // `ki manage repair` remains the sole mutation owner for both report families.
    const planned = (await planOrphanRecovery(context.paths.data)).filter(
      (recovery) => !ownedPaths.has(recovery.orphan.path)
    )
    const eligible = planned.length
      ? planned.map((recovery) => ({
          label: `${recovery.orphan.path} [${eligibility[recovery.action]}] ${recovery.detail}`
        }))
      : [{ label: 'none' }]
    const artifacts = reports.length ? reports.map((report) => ({ label: report.label })) : [{ label: 'none' }]
    context.stdout.write(
      `${renderTree({
        title: 'KI MANAGE CLEANUP',
        entries: [
          { label: `eligible (${planned.length})`, children: eligible },
          ...(reports.length ? [{ label: `artifacts (${reports.length})`, children: artifacts }] : []),
          { label: `summary: ELIGIBLE=${planned.length}${reports.length ? ` ${artifactSummary(reports)}` : ''}` }
        ]
      }).join('\n')}\n`
    )
  })
