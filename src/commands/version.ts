import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { KI_VERSION } from '../version.ts'

export const createVersionCommand = (context: KiContext): Command =>
  new Command('version').description('print the CLI version').action(() => context.stdout.write(`ki ${KI_VERSION}\n`))
