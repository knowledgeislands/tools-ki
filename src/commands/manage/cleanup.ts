import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { planOrphanRecovery } from '../../core/registry.ts'

const eligibility: Record<'restore' | 'remove' | 'refuse', string> = {
  restore: 'restorable',
  remove: 'removable',
  refuse: 'needs manual inspection'
}

export const createCleanupCommand = (context: KiContext): Command =>
  new Command('cleanup').description('report eligible KI-managed stale state').action(async () => {
    // Reporting only. Recovery is `ki manage repair`, so nothing here writes to the harness tree.
    const planned = await planOrphanRecovery(context.paths.data)
    const lines = ['╭─ KI MANAGE CLEANUP', `├─ eligible (${planned.length})`]
    if (!planned.length) lines.push('│  ╰─ none')
    else
      lines.push(
        ...planned.map(
          (recovery, index) =>
            `│  ${index === planned.length - 1 ? '╰─' : '├─'} ${recovery.orphan.path} [${eligibility[recovery.action]}] ${recovery.detail}`
        )
      )
    lines.push(`╰─ summary: ELIGIBLE=${planned.length}`)
    context.stdout.write(`${lines.join('\n')}\n`)
  })
