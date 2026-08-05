import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import {
  agoraCommandNames,
  agoraCommandSummaries,
  manageCommandNames,
  manageCommandSummaries,
  registryCommandNames,
  registryCommandSummaries,
  repoCommandNames,
  repoCommandSummaries,
  rootCommandNames,
  rootCommandSummaries
} from '../root/catalogue.ts'

const zshValues = <Name extends string>(names: readonly Name[], summaries: Readonly<Record<Name, string>>): string =>
  names.map((name) => `'${name}:${summaries[name]}'`).join(' ')

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
  if [[ "\${COMP_WORDS[1]}" == manage && "\${COMP_CWORD}" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "${manageCommandNames.join(' ')}" -- "$current") )
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == agora && "\${COMP_CWORD}" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "${agoraCommandNames.join(' ')}" -- "$current") )
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == registry && "\${COMP_CWORD}" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "${registryCommandNames.join(' ')}" -- "$current") )
    return
  fi
  COMPREPLY=( $(compgen -W "${[...rootCommandNames, '--help', '--version'].join(' ')}" -- "$current") )
}
complete -F _ki ki\n`)
        return
      }
      if (shell === 'zsh') {
        context.stdout.write(`#compdef ki
zstyle ':completion:*:ki-commands' verbose yes
zstyle ':completion:*:ki-management-commands' verbose yes
zstyle ':completion:*:ki-agora-commands' verbose yes
zstyle ':completion:*:ki-repository-commands' verbose yes
zstyle ':completion:*:ki-registry-commands' verbose yes
_ki() {
  local -a commands
  if (( CURRENT == 2 )); then
    commands=(${zshValues(rootCommandNames, rootCommandSummaries)})
    _describe -t ki-commands 'command' commands
  elif (( CURRENT == 3 )) && [[ "$words[2]" == repo ]]; then
    commands=(${zshValues(repoCommandNames, repoCommandSummaries)})
    _describe -t ki-repository-commands 'repository command' commands
  elif (( CURRENT == 3 )) && [[ "$words[2]" == manage ]]; then
    commands=(${zshValues(manageCommandNames, manageCommandSummaries)})
    _describe -t ki-management-commands 'management command' commands
  elif (( CURRENT == 3 )) && [[ "$words[2]" == agora ]]; then
    commands=(${zshValues(agoraCommandNames, agoraCommandSummaries)})
    _describe -t ki-agora-commands 'Agora command' commands
  elif (( CURRENT == 3 )) && [[ "$words[2]" == registry ]]; then
    commands=(${zshValues(registryCommandNames, registryCommandSummaries)})
    _describe -t ki-registry-commands 'registry command' commands
  fi
}
compdef _ki ki
`)
        return
      }
      throw grammarError('completion shell must be bash or zsh')
    })
