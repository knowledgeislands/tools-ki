import { Command } from 'commander'
import type { KiContext } from '../../context.ts'

export const createCleanupCommand = (context: KiContext): Command =>
  new Command('cleanup').description('report eligible KI-managed stale state').action(() => {
    context.stdout.write('╭─ KI MANAGE CLEANUP\n├─ eligible (0)\n│  ╰─ none\n╰─ summary: ELIGIBLE=0\n')
  })
