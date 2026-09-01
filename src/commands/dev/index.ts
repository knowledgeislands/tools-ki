import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createDevLocalCommand } from './local/index.ts'
import { createDevSkillCommand } from './skill/index.ts'

export const createDevCommand = (context: KiContext): Command =>
  new Command('dev')
    .description('switch installed harnesses independently between local checkouts and verified archives')
    .addCommand(createDevLocalCommand(context))
    .addCommand(createDevSkillCommand(context))
