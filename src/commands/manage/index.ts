import type { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createCleanupCommand } from './cleanup.ts'
import { createCompletionCommand } from './completion/index.ts'
import { createDiagCommand } from './diag.ts'
import { createDocsCommand } from './docs.ts'
import { createDoctorCommand } from './doctor.ts'
import { createListCommand } from './list.ts'
import { createMcpCommand } from './mcp.ts'
import { createMissingCommand } from './missing.ts'
import { createOutdatedCommand } from './outdated.ts'
import { createRepairCommand } from './repair.ts'
import { createSearchCommand } from './search.ts'
import { createUpdateCommand } from './update.ts'
import { createVscodeCommand } from './vscode.ts'

export const createSupportCommands = (context: KiContext): Command[] => [
  createCleanupCommand(context),
  createCompletionCommand(context),
  createDiagCommand(context),
  createDocsCommand(context),
  createDoctorCommand(context),
  createListCommand(context).name('inventory'),
  createMcpCommand(context),
  createRepairCommand(context),
  createUpdateCommand(context),
  createVscodeCommand(context)
]

export const createHarnessStatusCommands = (context: KiContext): Command[] => [
  createMissingCommand(context),
  createOutdatedCommand(context),
  createSearchCommand(context)
]
