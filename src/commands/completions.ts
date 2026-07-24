import { Command } from 'commander'
import type { KiContext } from '../core/context.ts'
import { grammarError } from '../core/errors.ts'
import { rootCommandNames } from './catalogue.ts'

export const createCompletionsCommand = (context: KiContext): Command =>
  new Command('completions')
    .description('print Bash or Zsh completion source')
    .argument('<shell>', 'shell name: bash or zsh')
    .action((shell: string) => {
      if (shell === 'bash') {
        context.stdout.write(`complete -W "${[...rootCommandNames, '--help', '--version'].join(' ')}" ki\n`)
        return
      }
      if (shell === 'zsh') {
        context.stdout.write(`#compdef ki\n_arguments "1: :(( ${rootCommandNames.join(' ')} ))"\n`.replace('( ', '(').replace(' ))', '))'))
        return
      }
      throw grammarError('completions shell must be bash or zsh')
    })
