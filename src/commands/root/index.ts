import type { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createAcquireCommand } from '../acquire/index.ts'
import { createAgentCommand } from '../agent/index.ts'
import { createAgoraCommand } from '../agora/index.ts'
import { createBootstrapCommand } from '../bootstrap/index.ts'
import { createDevCommand } from '../dev/index.ts'
import { createHarnessCommand } from '../harness/index.ts'
import { createKbCommand } from '../kb/index.ts'
import { createHarnessStatusCommands, createSupportCommands } from '../manage/index.ts'
import { createRegistryCommand } from '../registry/index.ts'
import { createRepoCommand } from '../repo/index.ts'
import { createSkillCommand } from '../skill/index.ts'
import { type RootCommandName, rootCommandNames } from './catalogue.ts'

type RootCommandFactory = (context: KiContext) => Command

const rootCommandFactories: Record<RootCommandName, RootCommandFactory> = {
  acquire: (context) => createAcquireCommand(context),
  agent: (context) => createAgentCommand(context),
  bootstrap: (context) => createBootstrapCommand(context),
  agora: (context) => createAgoraCommand(context),
  dev: (context) => createDevCommand(context),
  harness: (context) => createHarnessCommand(context),
  repo: (context) => createRepoCommand(context),
  kb: (context) => createKbCommand(context),
  registry: (context) => createRegistryCommand(context),
  skill: (context) => createSkillCommand(context)
}

export const addRootCommands = (program: Command, context: KiContext): void => {
  for (const name of rootCommandNames) {
    const command = rootCommandFactories[name](context)
    if (name === 'harness') for (const child of createHarnessStatusCommands(context)) command.addCommand(child)
    program.addCommand(command)
  }
  for (const command of createSupportCommands(context)) program.addCommand(command)
}
