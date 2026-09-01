import type { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createAcquireCommand } from '../acquire/index.ts'
import { createAgoraCommand } from '../agora/index.ts'
import { createBootstrapCommand } from '../bootstrap/index.ts'
import { createDevCommand } from '../dev/index.ts'
import { createHarnessCommand } from '../harness/index.ts'
import { createManageCommand } from '../manage/index.ts'
import { createRegistryCommand } from '../registry/index.ts'
import { createRepoCommand } from '../repo/index.ts'
import { createSkillCommand } from '../skill/index.ts'
import { createTradeCommand } from '../trade/index.ts'
import { type RootCommandName, rootHelpCommandNames } from './catalogue.ts'

type RootCommandFactory = (context: KiContext) => Command

const rootCommandFactories: Record<RootCommandName, RootCommandFactory> = {
  acquire: (context) => createAcquireCommand(context),
  bootstrap: (context) => createBootstrapCommand(context),
  agora: (context) => createAgoraCommand(context),
  dev: (context) => createDevCommand(context),
  harness: (context) => createHarnessCommand(context),
  trade: (context) => createTradeCommand(context),
  manage: (context) => createManageCommand(context),
  repo: (context) => createRepoCommand(context),
  registry: (context) => createRegistryCommand(context),
  skill: (context) => createSkillCommand(context)
}

export const addRootCommands = (program: Command, context: KiContext): void => {
  for (const name of rootHelpCommandNames) program.addCommand(rootCommandFactories[name](context))
}
