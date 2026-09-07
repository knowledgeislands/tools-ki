import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import { createAgoraReferenceListCommand } from './list.ts'
import { createAgoraReferenceRemoveCommand } from './remove.ts'
import { createAgoraReferenceSetCommand } from './set.ts'

export const createAgoraReferenceCommand = (context: KiContext): Command =>
  new Command('reference')
    .description('manage explicit local checkouts for owner-declared Agora references')
    .addCommand(createAgoraReferenceSetCommand(context))
    .addCommand(createAgoraReferenceListCommand(context))
    .addCommand(createAgoraReferenceRemoveCommand(context))
