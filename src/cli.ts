import { Command, CommanderError } from 'commander'
import { createAcquireCommand } from './commands/acquire.ts'
import { createBaselineCommands } from './commands/baseline.ts'
import { KiError } from './core/errors.ts'
import type { CommandContext } from './core/output.ts'
import { processContext } from './core/output.ts'
import { KI_VERSION } from './version.ts'

export const createProgram = (context: CommandContext): Command => {
  const program = new Command()
    .name('ki')
    .description('Knowledge Islands command-line interface.')
    .version(KI_VERSION, '-V, --version', 'print the CLI version')
    .configureOutput({ writeOut: (text) => context.stdout.write(text), writeErr: (text) => context.stderr.write(text) })
    .showHelpAfterError()
    .exitOverride()

  for (const command of createBaselineCommands(context)) program.addCommand(command)
  program.addCommand(createAcquireCommand(context))
  const help = new Command('help')
    .description('show command help')
    .argument('[command...]')
    .action((topics: string[]) => {
      let target = program
      for (const topic of topics) {
        const next = target.commands.find((command) => command.name() === topic)
        if (!next) throw new KiError(`unknown help topic: ${topics.join(' ')}`, 2)
        target = next
      }
      target.outputHelp()
    })
  program.addCommand(help)
  const configureExitOverride = (command: Command): void => {
    command.helpCommand(false)
    command.exitOverride()
    for (const child of command.commands) configureExitOverride(child)
  }
  configureExitOverride(program)
  return program
}

export const run = async (arguments_: readonly string[], context = processContext()): Promise<number> => {
  const program = createProgram(context)
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

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2))
}
