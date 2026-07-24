import { Command } from 'commander'
import { KiError } from '../core/errors.ts'

export const createHelpCommand = (program: Command): Command =>
  new Command('help')
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
