import type { Argument, Command, Option } from 'commander'

export type CompletionValueStrategy =
  | { readonly kind: 'none' }
  | { readonly kind: 'path' }
  | { readonly kind: 'values'; readonly values: readonly string[] }

export interface CompletionOption {
  readonly names: readonly string[]
  readonly description: string
  readonly takesValue: boolean
  readonly repeatable: boolean
  readonly valueStrategy: CompletionValueStrategy
}

export interface CompletionArgument {
  readonly name: string
  readonly description: string
  readonly valueStrategy: CompletionValueStrategy
}

export interface CompletionNode {
  readonly path: readonly string[]
  readonly commands: readonly { readonly name: string; readonly description: string }[]
  readonly options: readonly CompletionOption[]
  readonly arguments: readonly CompletionArgument[]
}

const helpOption: CompletionOption = {
  names: ['-h', '--help'],
  description: 'display help for command',
  takesValue: false,
  repeatable: false,
  valueStrategy: { kind: 'none' }
}

const optionNames = (option: Option): readonly string[] =>
  Array.from(option.flags.matchAll(/(?:^|[,\s])(--[a-z-]+|-[A-Za-z])\b/g), (match) => match[1]).filter(
    (name): name is string => Boolean(name)
  )

const closedOptionValues: Readonly<Record<string, readonly string[]>> = {
  '--direction': ['import', 'export'],
  '--horizon': ['now', 'next', 'soon', 'waiting-for', 'parked', 'future'],
  '--kind': ['work', 'knowledge'],
  '--progress': ['auto', 'always', 'never'],
  '--progress-style': ['single', 'multi'],
  '--reporter-levels': ['levels', 'all'],
  '--runtime': ['claude-code', 'chatgpt-codex'],
  '--visibility': ['public', 'private']
}

const noValue: CompletionValueStrategy = { kind: 'none' }

const optionValueStrategy = (path: string, option: Option): CompletionValueStrategy => {
  const name = option.long as string
  if (name === '--direction' && path === 'trade list')
    return { kind: 'values', values: ['prepare', 'import', 'export'] }
  if (name === '--observation') return { kind: 'values', values: ['unattended', 'receipt', 'decision', 'completion'] }
  if (closedOptionValues[name]) return { kind: 'values', values: closedOptionValues[name] }
  if (name === '--output' || name === '--svg' || (name === '--repo' && /^(repo|registry)( |$)/.test(path)))
    return { kind: 'path' }
  return noValue
}

const repeatableOption = (path: string, option: Option): boolean =>
  (option.long === '--repo' && /^(repo|registry)$/.test(path)) || (option.long === '--runtime' && path === 'repo init')

const option = (path: string, value: Option): CompletionOption => ({
  names: optionNames(value),
  description: value.description,
  takesValue: value.required || value.optional,
  repeatable: repeatableOption(path, value),
  valueStrategy: optionValueStrategy(path, value)
})

const argumentValueStrategy = (path: string, value: Argument): CompletionValueStrategy => {
  if (path === 'manage docs' && value.name() === 'topic')
    return { kind: 'values', values: ['overview', 'site', 'manual', 'roadmap'] }
  if (value.name().includes('directory')) return { kind: 'path' }
  return noValue
}

const argument = (path: string, value: Argument): CompletionArgument => ({
  name: value.name(),
  description: value.description,
  valueStrategy: argumentValueStrategy(path, value)
})

const uniqueOptions = (values: readonly CompletionOption[]): readonly CompletionOption[] =>
  Array.from(new Map(values.map((value) => [value.names.join('\0'), value])).values())

const collect = (
  command: Command,
  path: readonly string[],
  inherited: readonly CompletionOption[]
): readonly CompletionNode[] => {
  const key = path.join(' ')
  const options = uniqueOptions([...inherited, ...command.options.map((value) => option(key, value))])
  const node: CompletionNode = {
    path,
    commands: command.commands.map((child) => ({ name: child.name(), description: child.description() })),
    options,
    arguments: command.registeredArguments.map((value) => argument(key, value))
  }
  return [node, ...command.commands.flatMap((child) => collect(child, [...path, child.name()], options))]
}

export const completionGrammar = (root: Command): readonly CompletionNode[] =>
  collect(root, [], [...root.options.map((value) => option('', value)), helpOption])
