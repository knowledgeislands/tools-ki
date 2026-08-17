import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { inspectManageCleanup } from '../../core/manage/index.ts'
import { type ManagedArtifactReport, planOrphanRecovery, reportManagedArtifacts } from '../../core/storage/index.ts'
import { renderTree } from '../presentation/index.ts'

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
    const result = await inspectManageCleanup({
      reportArtifacts: () => reportManagedArtifacts(context.paths.state, context.paths.data),
      planOrphanRecovery: () => planOrphanRecovery(context.paths.data)
    })
    const eligible = result.eligible.length
      ? result.eligible.map((recovery) => ({
          label: `${recovery.orphan.path} [${eligibility[recovery.action]}] ${recovery.detail}`
        }))
      : [{ label: 'none' }]
    const artifacts = result.artifacts.length
      ? result.artifacts.map((report) => ({ label: report.label }))
      : [{ label: 'none' }]
    context.stdout.write(
      `${renderTree({
        title: 'KI MANAGE CLEANUP',
        entries: [
          { label: `eligible (${result.eligible.length})`, children: eligible },
          ...(result.artifacts.length
            ? [{ label: `artifacts (${result.artifacts.length})`, children: artifacts }]
            : []),
          {
            label: `summary: ELIGIBLE=${result.eligible.length}${result.artifacts.length ? ` ${artifactSummary(result.artifacts)}` : ''}`
          }
        ]
      }).join('\n')}\n`
    )
  })
