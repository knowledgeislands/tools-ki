import { Command, CommanderError } from 'commander'
import { createAcquireCommand } from './commands/acquire.ts'
import { createCompletionsCommand } from './commands/completions.ts'
import { createDoctorCommand } from './commands/doctor.ts'
import { createHelpCommand } from './commands/help.ts'
import { createPathsCommand } from './commands/paths.ts'
import { createVersionCommand } from './commands/version.ts'
import { createContext, type KiContext } from './core/context.ts'
import { KiError } from './core/errors.ts'
import { processContextOptions } from './core/output.ts'
import { KI_VERSION } from './version.ts'

export const createProgram = (context: KiContext): Command => {
  const program = new Command()
    .name('ki')
    .description('Knowledge Islands command-line interface.')
    .version(KI_VERSION, '-V, --version', 'print the CLI version')
    .configureOutput({ writeOut: (text) => context.stdout.write(text), writeErr: (text) => context.stderr.write(text) })
    .showHelpAfterError()
    .exitOverride()

  program.addCommand(createCompletionsCommand(context))
  program.addCommand(createDoctorCommand(context))
  program.addCommand(createPathsCommand(context))
  program.addCommand(createVersionCommand(context))
  program.addCommand(createAcquireCommand(context))
  program.addCommand(createHelpCommand(program))
  const configureExitOverride = (command: Command): void => {
    command.helpCommand(false)
    command.exitOverride()
    for (const child of command.commands) configureExitOverride(child)
  }
  configureExitOverride(program)
  return program
}

export const run = async (arguments_: readonly string[], suppliedContext?: KiContext): Promise<number> => {
  const context = suppliedContext ?? (await createContext(processContextOptions()))
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

/* v8 ignore next -- module entrypoint is exercised by the installed executable, not an importing test. */
if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2))
}
