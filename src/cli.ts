import { Command, CommanderError } from 'commander'
import { addRootCommands } from './commands/root/index.ts'
import type { KiContext } from './context.ts'
import { KiError, KiExit } from './core/errors.ts'
import { KI_VERSION } from './version.ts'

type ParserCommand = Command & {
  _outputHelpIfRequested: (arguments_: readonly string[]) => void
}

const commandName = (command: Command): string => {
  const names: string[] = []
  let current: Command | null = command
  while (current) {
    names.push(current.name())
    current = current.parent
  }
  return names.reverse().join(' ')
}

const parserError = (command: Command, text: string): string => {
  const option = /^error: unknown option '([^']+)'\n$/.exec(text)
  if (option) return `ki: error: unknown option '${option[1]}' for '${commandName(command)}'\n`

  const subcommand = /^error: unknown command '([^']+)'\n$/.exec(text)
  if (!subcommand) return text

  const hint = commandName(command) === 'ki skill' && subcommand[1] === 'repo' ? 'Did you mean: ki repo skill …?\n' : ''
  return `ki: error: unknown subcommand '${subcommand[1]}' for '${commandName(command)}'\n${hint}`
}

const unknownOption = (command: Command, arguments_: readonly string[]): string | undefined => {
  const options = command.createHelp().visibleOptions(command)
  for (const argument of arguments_) {
    if (argument === '--') return undefined
    // Commander keeps positional operands outside this unknown-option sequence.
    /* v8 ignore next -- The guard protects a future Commander parser change. */
    if (!argument.startsWith('-')) continue
    const flag = argument.startsWith('--') ? argument.split('=', 1)[0] : argument
    if (!options.some((option) => option.short === flag || option.long === flag)) return argument
  }
  return undefined
}

const unknownSubcommand = (command: Command): string | undefined => {
  const [first] = command.args
  return command.commands.length && first && !first.startsWith('-') ? first : undefined
}

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
    command.showSuggestionAfterError(false)
    command.configureOutput({
      writeOut: (text) => context.stdout.write(text),
      writeErr: (text) => context.stderr.write(text),
      outputError: (text, write) => write(parserError(command, text))
    })
    const parserCommand = command as ParserCommand
    const outputHelpIfRequested = parserCommand._outputHelpIfRequested
    parserCommand._outputHelpIfRequested = (arguments_) => {
      const subcommand = unknownSubcommand(command)
      if (subcommand) command.error(`error: unknown command '${subcommand}'`)
      const option = unknownOption(command, arguments_)
      if (option) command.error(`error: unknown option '${option}'`)
      outputHelpIfRequested.call(command, arguments_)
    }
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
