import type { Command, Option } from 'commander'

export interface CompletionOption {
  readonly names: readonly string[]
  readonly description: string
  readonly takesValue: boolean
}

export interface CompletionNode {
  readonly path: readonly string[]
  readonly commands: readonly { readonly name: string; readonly description: string }[]
  readonly options: readonly CompletionOption[]
}

const helpOption: CompletionOption = {
  names: ['-h', '--help'],
  description: 'display help for command',
  takesValue: false
}

const optionNames = (option: Option): readonly string[] =>
  Array.from(option.flags.matchAll(/(?:^|[,\s])(--[a-z-]+|-[A-Za-z])\b/g), (match) => match[1]).filter((name): name is string => Boolean(name))

const option = (value: Option): CompletionOption => ({
  names: optionNames(value),
  description: value.description,
  takesValue: /[<[].+[>\]]/.test(value.flags)
})

const uniqueOptions = (values: readonly CompletionOption[]): readonly CompletionOption[] =>
  Array.from(new Map(values.map((value) => [value.names.join('\0'), value])).values())

const collect = (command: Command, path: readonly string[], inherited: readonly CompletionOption[]): readonly CompletionNode[] => {
  const options = uniqueOptions([...inherited, ...command.options.map(option)])
  const node: CompletionNode = {
    path,
    commands: command.commands.map((child) => ({ name: child.name(), description: child.description() })),
    options
  }
  return [node, ...command.commands.flatMap((child) => collect(child, [...path, child.name()], options))]
}

export const completionGrammar = (root: Command): readonly CompletionNode[] => collect(root, [], [...root.options.map(option), helpOption])
