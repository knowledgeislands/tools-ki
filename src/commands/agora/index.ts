import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createAgoraListCommand } from './list.ts'
import { createAgoraOpenCommand } from './open.ts'
import { createAgoraShowCommand } from './show.ts'

export const createAgoraCommand = (context: KiContext): Command =>
  new Command('agora')
    .description('resolve declared named Agoras and the registered estate')
    .addCommand(createAgoraListCommand(context))
    .addCommand(createAgoraShowCommand(context))
    .addCommand(createAgoraOpenCommand(context))
