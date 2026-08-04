import type { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { createAcquireCommand } from './acquire.ts'
import { createAgoraCommand } from './agora/index.ts'
import { createBootstrapCommand } from './bootstrap.ts'
import { type RootCommandName, rootHelpCommandNames } from './catalogue.ts'
import { createDevCommand } from './dev.ts'
import { createHarnessCommand } from './harness.ts'
import { createManageCommand } from './manage/index.ts'
import { createRegistryCommand } from './registry/index.ts'
import { createRepositoryOperations } from './repo/index.ts'
import { createSkillCommand } from './skill.ts'
import { createTradesCommand } from './trade-command.ts'
import { createWorkspaceCommand } from './workspace.ts'

type RootCommandFactory = (context: KiContext) => Command

const rootCommandFactories: Record<RootCommandName, RootCommandFactory> = {
  acquire: (context) => createAcquireCommand(context),
  bootstrap: (context) => createBootstrapCommand(context),
  agora: (context) => createAgoraCommand(context),
  dev: (context) => createDevCommand(context),
  harness: (context) => createHarnessCommand(context),
  trades: (context) => createTradesCommand(context),
  manage: (context) => createManageCommand(context),
  repo: (context) => createRepositoryOperations(context),
  registry: (context) => createRegistryCommand(context),
  skill: (context) => createSkillCommand(context),
  workspace: (context) => createWorkspaceCommand(context)
}

export const addRootCommands = (program: Command, context: KiContext): void => {
  for (const name of rootHelpCommandNames) program.addCommand(rootCommandFactories[name](context))
}
