import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { planOrphanRecovery } from '../../core/registry.ts'
import { renderTree } from '../../core/tree-rendering.ts'

const eligibility: Record<'restore' | 'remove' | 'refuse', string> = {
  restore: 'restorable',
  remove: 'removable',
  refuse: 'needs manual inspection'
}

export const createCleanupCommand = (context: KiContext): Command =>
  new Command('cleanup').description('report eligible KI-managed stale state').action(async () => {
    // Reporting only. Recovery is `ki manage repair`, so nothing here writes to the harness tree.
    const planned = await planOrphanRecovery(context.paths.data)
    const eligible = planned.length
      ? planned.map((recovery) => ({
          label: `${recovery.orphan.path} [${eligibility[recovery.action]}] ${recovery.detail}`
        }))
      : [{ label: 'none' }]
    context.stdout.write(
      `${renderTree({
        title: 'KI MANAGE CLEANUP',
        entries: [
          { label: `eligible (${planned.length})`, children: eligible },
          { label: `summary: ELIGIBLE=${planned.length}` }
        ]
      }).join('\n')}\n`
    )
  })
