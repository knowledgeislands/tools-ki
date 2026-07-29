import { Command } from 'commander'
import type { KiContext } from '../context.ts'

export const createCleanupCommand = (context: KiContext): Command =>
  new Command('cleanup').description('report eligible KI-managed stale state').action(() => {
    context.stdout.write('ki cleanup\nNo eligible managed stale state.\n')
  })
