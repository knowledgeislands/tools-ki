import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createCleanupCommand } from './cleanup.ts'
import { createCompletionsCommand } from './completions.ts'
import { createDiagCommand } from './diag.ts'
import { createDocsCommand } from './docs.ts'
import { createDoctorCommand } from './doctor.ts'
import { createListCommand } from './list.ts'
import { createMissingCommand } from './missing.ts'
import { createOutdatedCommand } from './outdated.ts'
import { createSearchCommand } from './search.ts'
import { createUpdateCommand } from './update.ts'

export const createManageCommand = (context: KiContext): Command =>
  new Command('manage')
    .description('inspect and maintain local KI state')
    .addCommand(createCleanupCommand(context))
    .addCommand(createCompletionsCommand(context))
    .addCommand(createDiagCommand(context))
    .addCommand(createDocsCommand(context))
    .addCommand(createDoctorCommand(context))
    .addCommand(createListCommand(context))
    .addCommand(createMissingCommand(context))
    .addCommand(createOutdatedCommand(context))
    .addCommand(createSearchCommand(context))
    .addCommand(createUpdateCommand(context))
