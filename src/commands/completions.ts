import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { grammarError } from '../core/errors.ts'
import { repoCommandNames, rootCommandNames } from './catalogue.ts'

export const createCompletionsCommand = (context: KiContext): Command =>
  new Command('completion')
    .description('print Bash or Zsh completion source')
    .argument('<shell>', 'shell name: bash or zsh')
    .action((shell: string) => {
      if (shell === 'bash') {
        context.stdout.write(`_ki() {
  local current="\${COMP_WORDS[COMP_CWORD]}"
  if [[ "\${COMP_WORDS[1]}" == repo && "\${COMP_CWORD}" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "${repoCommandNames.join(' ')}" -- "$current") )
    return
  fi
  COMPREPLY=( $(compgen -W "${[...rootCommandNames, '--help', '--version'].join(' ')}" -- "$current") )
}
complete -F _ki ki\n`)
        return
      }
      if (shell === 'zsh') {
        context.stdout.write(`#compdef ki
_ki() {
  if (( CURRENT == 2 )); then
    _values 'command' ${rootCommandNames.join(' ')}
  elif (( CURRENT == 3 )) && [[ "$words[2]" == repo ]]; then
    _values 'repository command' ${repoCommandNames.join(' ')}
  fi
}
_ki "$@"
`)
        return
      }
      throw grammarError('completion shell must be bash or zsh')
    })
