export const COMMAND_INVENTORY_SCHEMA = 'ki/commands/v1' as const

export interface CommandInventory {
  readonly schema: typeof COMMAND_INVENTORY_SCHEMA
  readonly groups: readonly {
    readonly name: string
    readonly purpose: string
    readonly commands: readonly {
      readonly invocation: string
      readonly description: string
    }[]
  }[]
}

interface ParsedGroup {
  readonly name: string
  readonly purpose: string
  readonly commands: readonly { readonly invocation: string; readonly description: string }[]
}

const section = (source: string, heading: string): readonly string[] => {
  const lines = source.split('\n')
  const start = lines.indexOf(`.SH ${heading}`)
  if (start === -1) throw new Error(`manual is missing ${heading}`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('.SH '))
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

const plainRoff = (lines: readonly string[]): string =>
  lines
    .filter((line) => line && line !== '\\&' && !['.PP', '.nf', '.fi'].includes(line))
    .map((line) => line.replace(/^\.(?:B|BR|I|IR|RI)\s+/, ''))
    .join(' ')
    .replace(/\\f[BRIP]/g, '')
    .replace(/\\\(em/g, '—')
    .replace(/\\-/g, '-')
    .replace(/\\ /g, ' ')
    .replace(/"([^"]*)"/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const groups = (lines: readonly string[], requirePurpose: boolean): readonly ParsedGroup[] => {
  const result: ParsedGroup[] = []
  let name: string | undefined
  let purpose: string[] = []
  let commands: { invocation: string; description: string[] }[] = []
  let command: { invocation: string; description: string[] } | undefined
  let expectInvocation = false

  const finishCommand = (): void => {
    if (!command) return
    const description = plainRoff(command.description)
    if (!description) throw new Error(`manual command ${command.invocation} has no description`)
    commands.push({ invocation: command.invocation, description: command.description })
    command = undefined
  }
  const finishGroup = (): void => {
    if (!name) return
    finishCommand()
    const renderedPurpose = plainRoff(purpose)
    if (requirePurpose && !renderedPurpose) throw new Error(`manual group ${name} has no purpose`)
    if (!commands.length) throw new Error(`manual group ${name} has no commands`)
    result.push({
      name,
      purpose: renderedPurpose,
      commands: commands.map((entry) => ({
        invocation: entry.invocation,
        description: plainRoff(entry.description)
      }))
    })
    purpose = []
    commands = []
  }

  for (const line of lines) {
    if (line.startsWith('.SS ')) {
      finishGroup()
      name = line.slice(4).trim()
      continue
    }
    if (!name) continue
    if (line === '.TP') {
      finishCommand()
      expectInvocation = true
      continue
    }
    if (expectInvocation && line.startsWith('.B ')) {
      finishCommand()
      command = { invocation: line.slice(3).trim(), description: [] }
      expectInvocation = false
      continue
    }
    if (command) command.description.push(line)
    else purpose.push(line)
  }
  finishGroup()
  return result
}

const semanticKeys = (group: ParsedGroup): readonly string[] =>
  group.commands.flatMap((command) => {
    const invocation = command.invocation.replace(/\\f[BRIP]/g, '')
    if (group.name === 'Global options' || group.name === 'Repository options') {
      const option = /--[a-z-]+/.exec(invocation)?.[0]
      return option ? [`${group.name}\0${option}`] : []
    }
    const words = invocation
      .replace(/^ki\s+/, '')
      .split(/\s+/)
      .filter((word) => /^[a-z]+(?:\|[a-z]+)*$/.test(word))
    if (!words.length) return [`${group.name}\0${invocation}`]
    const variants = words.reduce<readonly string[]>(
      (prefixes, word) => prefixes.flatMap((prefix) => word.split('|').map((part) => `${prefix} ${part}`.trim())),
      ['']
    )
    return variants.map((variant) => `${group.name}\0${variant}`)
  })

export const buildCommandInventory = (manual: string): CommandInventory => {
  const synopsis = groups(section(manual, 'SYNOPSIS'), false)
  const detailed = groups(section(manual, 'COMMAND GROUPS'), true)
  if (JSON.stringify(synopsis.map((group) => group.name)) !== JSON.stringify(detailed.map((group) => group.name)))
    throw new Error('manual SYNOPSIS and COMMAND GROUPS group inventories differ')
  const synopsisKeys = synopsis.flatMap(semanticKeys).sort()
  const detailedKeys = detailed.flatMap(semanticKeys).sort()
  if (JSON.stringify(synopsisKeys) !== JSON.stringify(detailedKeys)) {
    const synopsisOnly = synopsisKeys.filter((key) => !detailedKeys.includes(key))
    const detailedOnly = detailedKeys.filter((key) => !synopsisKeys.includes(key))
    throw new Error(
      `manual SYNOPSIS and COMMAND GROUPS inventories differ: synopsis-only ${JSON.stringify(synopsisOnly)}; command-groups-only ${JSON.stringify(detailedOnly)}`
    )
  }
  return { schema: COMMAND_INVENTORY_SCHEMA, groups: detailed }
}

export const renderCommandInventory = (manual: string): string =>
  `${JSON.stringify(buildCommandInventory(manual), null, 2)}\n`
