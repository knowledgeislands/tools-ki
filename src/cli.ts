import { Command, CommanderError } from 'commander'
import { addRootCommands } from './commands/root.ts'
import type { KiContext } from './context.ts'
import { KiError, KiExit } from './core/errors.ts'
import { KI_VERSION } from './version.ts'

export const createProgram = (context: KiContext): Command => {
  const program = new Command()
    .name('ki')
    .description('Knowledge Islands command-line interface.')
    .version(KI_VERSION, '-V, --version', 'print the CLI version')

  addRootCommands(program, context)
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
