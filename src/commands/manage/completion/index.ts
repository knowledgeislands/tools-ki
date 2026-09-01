import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import { grammarError } from '../../../core/errors.ts'
import { buildCompletionGrammar } from './grammar.ts'
import { renderBash, renderZsh } from './renderers.ts'

export const createCompletionCommand = (context: KiContext): Command =>
  new Command('completion')
    .description('print Bash or Zsh completion source')
    .argument('<shell>', 'shell name: bash or zsh')
    .action((shell: string, _options: Record<string, never>, command: Command) => {
      let root = command
      while (root.parent) root = root.parent
      const grammar = buildCompletionGrammar(root)
      if (shell === 'bash') return context.stdout.write(renderBash(grammar))
      if (shell === 'zsh') return context.stdout.write(renderZsh(grammar))
      throw grammarError('completion shell must be bash or zsh')
    })
