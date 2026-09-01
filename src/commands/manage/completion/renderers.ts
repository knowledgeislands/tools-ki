import type { CompletionNode, CompletionOption, CompletionValueStrategy } from './grammar.ts'

const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`

const nodeKey = (node: CompletionNode): string => node.path.join(' ')

const caseBody = (nodes: readonly CompletionNode[], values: (node: CompletionNode) => string): string =>
  nodes.map((node) => `    ${shellQuote(nodeKey(node))}) printf '%s\\n' ${shellQuote(values(node))} ;;`).join('\n')

const optionNames = (option: CompletionOption): readonly string[] => option.names

const valueOptions = (node: CompletionNode): readonly string[] =>
  node.options.filter((option) => option.takesValue).flatMap(optionNames)

const renderValueStrategy = (strategy: CompletionValueStrategy): string =>
  strategy.kind === 'values' ? strategy.values.join(' ') : strategy.kind === 'path' ? 'path' : ''

const strategies = (nodes: readonly CompletionNode[]): string =>
  nodes
    .flatMap((node) =>
      valueOptions(node).map((name) => {
        const option = node.options.find((value) => value.names.includes(name)) as CompletionOption
        return `    ${shellQuote(`${nodeKey(node)}:${name}`)}) printf '%s\\n' ${shellQuote(renderValueStrategy(option.valueStrategy))} ;;`
      })
    )
    .join('\n')

const argumentStrategies = (nodes: readonly CompletionNode[]): string =>
  nodes
    .flatMap((node) =>
      node.arguments.map(
        (argument, index) =>
          `    ${shellQuote(`${nodeKey(node)}:${index}`)}) printf '%s\\n' ${shellQuote(renderValueStrategy(argument.valueStrategy))} ;;`
      )
    )
    .join('\n')

export const renderBash = (nodes: readonly CompletionNode[]): string => `_ki_names() {
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
_ki_argument_strategy() {
  case "$1:$2" in
${argumentStrategies(nodes)}
  esac
}
_ki() {
  local current="\${COMP_WORDS[COMP_CWORD]}" path='' token pending='' strategy argument_index=0
  local index
  for (( index=1; index<COMP_CWORD; index++ )); do
    token="\${COMP_WORDS[index]}"
    if [[ -n "$pending" ]]; then pending=''; continue; fi
    if [[ "$token" == -* ]]; then
      [[ " $(_ki_value_options "$path") " == *" $token "* ]] && pending="$token"
    elif [[ " $(_ki_names "$path") " == *" $token "* ]]; then
      path="\${path:+$path }$token"
    else ((argument_index++))
    fi
  done
  if [[ -n "$pending" ]]; then
    strategy="$(_ki_value_strategy "$path" "$pending")"
    [[ "$strategy" == path ]] && COMPREPLY=( $(compgen -f -- "$current") ) || COMPREPLY=( $(compgen -W "$strategy" -- "$current") )
    return
  fi
  strategy="$(_ki_argument_strategy "$path" "$argument_index")"
  if [[ "$strategy" == path ]]; then
    COMPREPLY=( $(compgen -f -- "$current") )
    return
  fi
  if [[ -n "$strategy" ]]; then
    COMPREPLY=( $(compgen -W "$strategy" -- "$current") )
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
  ].join('\n')

export const renderZsh = (nodes: readonly CompletionNode[]): string => `#compdef ki
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
_ki_argument_strategy() {
  case "$1:$2" in
${argumentStrategies(nodes)}
  esac
}
_ki_candidates() {
  case "$1" in
${caseBody(nodes, candidateValues)}
  esac
}
_ki() {
  local path='' token pending='' strategy
  integer index argument_index=0
  for (( index=2; index<CURRENT; index++ )); do
    token="\${words[index]}"
    if [[ -n "$pending" ]]; then pending=''; continue; fi
    if [[ "$token" == -* ]]; then
      [[ " $(_ki_value_options "$path") " == *" $token "* ]] && pending="$token"
    elif [[ " $(_ki_names "$path") " == *" $token "* ]]; then
      path="\${path:+$path }$token"
    else ((argument_index++))
    fi
  done
  if [[ -n "$pending" ]]; then
    strategy="$(_ki_value_strategy "$path" "$pending")"
    [[ "$strategy" == path ]] && _files || compadd -- $=strategy
    return
  fi
  strategy="$(_ki_argument_strategy "$path" "$argument_index")"
  if [[ "$strategy" == path ]]; then
    _files
    return
  fi
  if [[ -n "$strategy" ]]; then
    compadd -- $=strategy
    return
  fi
  local -a candidates
  candidates=("\${(@f)$(_ki_candidates "$path")}")
  _describe -t ki-commands 'command or option' candidates
}
compdef _ki ki
`
