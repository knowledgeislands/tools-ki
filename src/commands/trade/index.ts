import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import type { SelectRepositories } from '../repo/selection.ts'
import { createTradePolicyCommand } from './policy.ts'
import { createTradeRecordCommands } from './records.ts'
import { createTradeRoutesCommand } from './routes/index.ts'
import { tradeSelection } from './selection.ts'
import { createTradeStandingCommand } from './standing.ts'

export const createRepoTradeCommand = (context: KiContext, selectedRepositories: SelectRepositories): Command => {
  const selection = tradeSelection(context, selectedRepositories)
  const command = new Command('trade').description(
    'submit and inspect typed cross-repository work and knowledge trades'
  )
  command.addCommand(createTradeRoutesCommand(context, selection))
  command.addCommand(createTradePolicyCommand(context, selection))
  command.addCommand(createTradeStandingCommand(context, selection))
  for (const record of createTradeRecordCommands(context, selection)) command.addCommand(record)
  return command
}
