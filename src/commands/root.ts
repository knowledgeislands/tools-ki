import type { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { createAcquireCommand } from './acquire.ts'
import { createBootstrapCommand } from './bootstrap.ts'
import { createMissingCommand, createOutdatedCommand } from './capability-status.ts'
import { type RootCommandName, rootHelpCommandNames } from './catalogue.ts'
import { createCleanupCommand } from './cleanup.ts'
import { createCompletionsCommand } from './completions.ts'
import { createDevCommand } from './dev.ts'
import { createDiagCommand } from './diag.ts'
import { createDocsCommand } from './docs.ts'
import { createDoctorCommand } from './doctor.ts'
import { createHarnessCommand } from './harness.ts'
import { createHelpCommand } from './help.ts'
import { createListCommand } from './list.ts'
import { createRepairCommand } from './repair.ts'
import { createRepoCommand } from './repo.ts'
import { createSearchCommand } from './search.ts'
import { createSkillCommand } from './skill.ts'
import { createUpdateCommand } from './update.ts'
import { createVersionCommand } from './version.ts'
import { createWorkspaceCommand } from './workspace.ts'

type RootCommandFactory = (context: KiContext, program: Command) => Command

const rootCommandFactories: Record<RootCommandName, RootCommandFactory> = {
  acquire: (context) => createAcquireCommand(context),
  bootstrap: (context) => createBootstrapCommand(context),
  cleanup: (context) => createCleanupCommand(context),
  completion: (context) => createCompletionsCommand(context),
  dev: (context) => createDevCommand(context),
  diag: (context) => createDiagCommand(context),
  docs: (context) => createDocsCommand(context),
  doctor: (context) => createDoctorCommand(context),
  harness: (context) => createHarnessCommand(context),
  help: (_, program) => createHelpCommand(program),
  list: (context) => createListCommand(context),
  missing: (context) => createMissingCommand(context),
  outdated: (context) => createOutdatedCommand(context),
  repo: (context) => createRepoCommand(context),
  repair: (context) => createRepairCommand(context),
  search: (context) => createSearchCommand(context),
  skill: (context) => createSkillCommand(context),
  update: (context) => createUpdateCommand(context),
  version: (context) => createVersionCommand(context),
  workspace: (context) => createWorkspaceCommand(context)
}

export const addRootCommands = (program: Command, context: KiContext): void => {
  for (const name of rootHelpCommandNames) program.addCommand(rootCommandFactories[name](context, program))
}
