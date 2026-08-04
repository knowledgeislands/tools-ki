import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createAgoraAddCommand } from './add.ts'
import { createAgoraCreateCommand } from './create.ts'
import { createAgoraDiscoverCommand } from './discover.ts'
import { createAgoraListCommand } from './list.ts'
import { createAgoraOpenCommand } from './open.ts'
import { createAgoraRemoveCommand } from './remove.ts'
import { createAgoraShowCommand } from './show.ts'

export const createAgoraCommand = (context: KiContext): Command =>
  new Command('agora')
    .description('manage named global KI repository and Zed profiles')
    .addCommand(createAgoraCreateCommand(context))
    .addCommand(createAgoraAddCommand(context))
    .addCommand(createAgoraRemoveCommand(context))
    .addCommand(createAgoraDiscoverCommand(context))
    .addCommand(createAgoraListCommand(context))
    .addCommand(createAgoraShowCommand(context))
    .addCommand(createAgoraOpenCommand(context))
