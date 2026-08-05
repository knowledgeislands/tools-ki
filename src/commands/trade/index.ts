import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createTradeRecordCommands } from './records.ts'
import { createTradeRoutesCommand } from './routes.ts'

export const createTradeCommand = (context: KiContext): Command => {
  const command = new Command('trade').description('submit and inspect typed cross-repository work and knowledge trades')
  command.addCommand(createTradeRoutesCommand(context))
  for (const record of createTradeRecordCommands(context)) command.addCommand(record)
  return command
}
