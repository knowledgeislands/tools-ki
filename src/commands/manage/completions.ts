import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { type CompletionNode, type CompletionOption, completionGrammar } from './completion-grammar.ts'

const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`

const nodeKey = (node: CompletionNode): string => node.path.join(' ')

const caseBody = (nodes: readonly CompletionNode[], values: (node: CompletionNode) => string): string =>
  nodes.map((node) => `    ${shellQuote(nodeKey(node))}) printf '%s\\n' ${shellQuote(values(node))} ;;`).join('\n')

const optionNames = (option: CompletionOption): readonly string[] => option.names

const valueOptions = (node: CompletionNode): readonly string[] => node.options.filter((option) => option.takesValue).flatMap(optionNames)

const valueStrategy = (path: string, option: string): string => {
  if (option === '--horizon') return 'now next soon waiting-for parked future'
  if (option === '--kind') return 'work knowledge'
  if (option === '--direction') return 'import export'
  if (option === '--visibility') return 'public private'
  if (option === '--runtime') return 'claude-code chatgpt-codex'
  if (option === '--progress') return 'auto always never'
  if (option === '--progress-style') return 'single multi'
  if (option === '--reporter-levels') return 'levels all'
  if (option === '--output' || ((option === '--repo' || option === '-r') && /^(repo|registry)( |$)/.test(path))) return 'path'
  return ''
}

const strategies = (nodes: readonly CompletionNode[]): string =>
  nodes
    .flatMap((node) =>
      valueOptions(node).map(
        (option) => `    ${shellQuote(`${nodeKey(node)}:${option}`)}) printf '%s\\n' ${shellQuote(valueStrategy(nodeKey(node), option))} ;;`
      )
    )
    .join('\n')

const renderBash = (nodes: readonly CompletionNode[]): string => `_ki_names() {
  case "$1" in
${caseBody(nodes, (node) => node.commands.map((command) => command.name).join(' '))}
  esac
}
_ki_options() {
  case "$1" in
${caseBody(nodes, (node) => node.options.flatMap(optionNames).join(' '))}
  esac
}
_ki_value_options() {
  case "$1" in
${caseBody(nodes, (node) => valueOptions(node).join(' '))}
  esac
}
_ki_value_strategy() {
  case "$1:$2" in
${strategies(nodes)}
  esac
}
_ki() {
  local current="\${COMP_WORDS[COMP_CWORD]}" path='' token pending='' strategy
  local index
  for (( index=1; index<COMP_CWORD; index++ )); do
    token="\${COMP_WORDS[index]}"
    if [[ -n "$pending" ]]; then pending=''; continue; fi
    if [[ "$token" == -* ]]; then
      [[ " $(_ki_value_options "$path") " == *" $token "* ]] && pending="$token"
    elif [[ " $(_ki_names "$path") " == *" $token "* ]]; then
      path="\${path:+$path }$token"
    fi
  done
  if [[ -n "$pending" ]]; then
    strategy="$(_ki_value_strategy "$path" "$pending")"
    [[ "$strategy" == path ]] && COMPREPLY=( $(compgen -f -- "$current") ) || COMPREPLY=( $(compgen -W "$strategy" -- "$current") )
    return
  fi
  COMPREPLY=( $(compgen -W "$(_ki_names "$path") $(_ki_options "$path")" -- "$current") )
}
complete -F _ki ki
`

const candidateValues = (node: CompletionNode): string =>
  [
    ...node.commands.map((command) => `${command.name}:${command.description}`),
    ...node.options.flatMap((option) => option.names.map((name) => `${name}:${option.description}`))
  ]
    .map(shellQuote)
    .join(' ')

const renderZsh = (nodes: readonly CompletionNode[]): string => `#compdef ki
zstyle ':completion:*:ki-commands' verbose yes
_ki_names() {
  case "$1" in
${caseBody(nodes, (node) => node.commands.map((command) => command.name).join(' '))}
  esac
}
_ki_value_options() {
  case "$1" in
${caseBody(nodes, (node) => valueOptions(node).join(' '))}
  esac
}
_ki_value_strategy() {
  case "$1:$2" in
${strategies(nodes)}
  esac
}
_ki_candidates() {
  case "$1" in
${caseBody(nodes, candidateValues)}
  esac
}
_ki() {
  local path='' token pending='' strategy
  integer index
  for (( index=2; index<CURRENT; index++ )); do
    token="\${words[index]}"
    if [[ -n "$pending" ]]; then pending=''; continue; fi
    if [[ "$token" == -* ]]; then
      [[ " $(_ki_value_options "$path") " == *" $token "* ]] && pending="$token"
    elif [[ " $(_ki_names "$path") " == *" $token "* ]]; then
      path="\${path:+$path }$token"
    fi
  done
  if [[ -n "$pending" ]]; then
    strategy="$(_ki_value_strategy "$path" "$pending")"
    [[ "$strategy" == path ]] && _files || compadd -- $=strategy
    return
  fi
  local -a candidates
  candidates=("\${(@f)$(_ki_candidates "$path")}")
  _describe -t ki-commands 'command or option' candidates
}
compdef _ki ki
`

export const createCompletionsCommand = (context: KiContext): Command =>
  new Command('completion')
    .description('print Bash or Zsh completion source')
    .argument('<shell>', 'shell name: bash or zsh')
    .action((shell: string, _options: Record<string, never>, command: Command) => {
      let root = command
      while (root.parent) root = root.parent
      const grammar = completionGrammar(root)
      if (shell === 'bash') return context.stdout.write(renderBash(grammar))
      if (shell === 'zsh') return context.stdout.write(renderZsh(grammar))
      throw grammarError('completion shell must be bash or zsh')
    })
