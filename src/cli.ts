import { Command, CommanderError } from 'commander'
import { createAcquireCommand } from './commands/acquire.ts'
import { createBootstrapCommand } from './commands/bootstrap.ts'
import { createMissingCommand, createOutdatedCommand } from './commands/capability-status.ts'
import { createCompletionsCommand } from './commands/completions.ts'
import { createDevCommand } from './commands/dev.ts'
import { createDiagCommand } from './commands/diag.ts'
import { createDoctorCommand } from './commands/doctor.ts'
import { createHarnessCommand } from './commands/harness.ts'
import { createHelpCommand } from './commands/help.ts'
import { createListCommand } from './commands/list.ts'
import { createRepoCommand } from './commands/repo.ts'
import { createSkillCommand } from './commands/skill.ts'
import { createUpdateCommand } from './commands/update.ts'
import { createVersionCommand } from './commands/version.ts'
import type { KiContext } from './context.ts'
import { KiError, KiExit } from './core/errors.ts'
import { KI_VERSION } from './version.ts'

export const createProgram = (context: KiContext): Command => {
  const program = new Command()
    .name('ki')
    .description('Knowledge Islands command-line interface.')
    .version(KI_VERSION, '-V, --version', 'print the CLI version')

  program.addCommand(createCompletionsCommand(context))
  program.addCommand(createBootstrapCommand(context))
  program.addCommand(createDevCommand(context))
  program.addCommand(createDiagCommand(context))
  program.addCommand(createDoctorCommand(context))
  program.addCommand(createHarnessCommand(context))
  program.addCommand(createListCommand(context))
  program.addCommand(createMissingCommand(context))
  program.addCommand(createOutdatedCommand(context))
  program.addCommand(createRepoCommand(context))
  program.addCommand(createSkillCommand(context))
  program.addCommand(createVersionCommand(context))
  program.addCommand(createUpdateCommand(context))
  program.addCommand(createAcquireCommand(context))
  program.addCommand(createHelpCommand(program))
  // Commander does not inherit these settings by subcommands added with addCommand,
  // so apply them to the whole tree — otherwise a subcommand's error, usage, or help
  // output bypasses the context streams and writes straight to the real process.
  const configureCommandTree = (command: Command): void => {
    command.helpCommand(false)
    command.exitOverride()
    command.showHelpAfterError()
    command.configureOutput({ writeOut: (text) => context.stdout.write(text), writeErr: (text) => context.stderr.write(text) })
    for (const child of command.commands) configureCommandTree(child)
  }
  configureCommandTree(program)
  return program
}

export const run = async (arguments_: readonly string[], context: KiContext): Promise<number> => {
  const program = createProgram(context)
  /* v8 ignore next -- V8 reports a non-existent third outcome for this complete boolean condition. */
  if (!arguments_.length) {
    program.outputHelp()
    return 0
  }
  try {
    await program.parseAsync([...arguments_], { from: 'user' })
    return 0
  } catch (error) {
    if (error instanceof KiExit) return error.exitCode

    if (error instanceof KiError) {
      context.stderr.write(`ki: error: ${error.message}\n`)
      return error.exitCode
    }
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return 0
      return 2
    }
    throw error
  }
}
