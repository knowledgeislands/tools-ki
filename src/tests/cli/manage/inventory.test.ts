import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { buildCommandInventory, renderCommandInventory } from '../../../../scripts/command-inventory.ts'
import { sandbox } from '../_cli_helper.ts'

const rootHelpCommands = [
  'bootstrap',
  'manage',
  'agora',
  'skill',
  'repo',
  'batch',
  'registry',
  'harness',
  'trade',
  'acquire',
  'dev'
]

const manageCommands = [
  'cleanup',
  'completion',
  'diag',
  'docs',
  'doctor',
  'list',
  'mcp',
  'missing',
  'outdated',
  'repair',
  'search',
  'update',
  'vscode'
]
const agoraCommands = ['audit', 'inspect', 'list', 'show', 'roots', 'open', 'reference']
const agoraReferenceCommands = ['set', 'list', 'remove']
const agoraChangelogCommands = [
  '`ki agora audit [agora]`',
  '`ki agora inspect <agora> --target <zed|vscode> --workspace <selector>`',
  '`ki agora open <agora> --target <zed|vscode>`',
  '`ki agora reference set <repository> <checkout> [--dry-run]`',
  '`ki agora reference list`',
  '`ki agora reference remove <repository> [--dry-run]`'
]
const repoCommands = [
  'audit',
  'conform',
  'diag',
  'educate',
  'init',
  'open',
  'roadmap',
  'repair',
  'skill',
  'store',
  'upgrade'
]
const batchCommands = ['close', 'prepare', 'run', 'validate']
const registryCommands = ['add', 'list', 'remove']

const commandNames = (output: string): string[] =>
  output.split('\n').flatMap((line) => /^ {2}([a-z]+)(?:\s|$)/.exec(line)?.[1] ?? [])

describe('[ki command inventory]', () => {
  test('keeps runtime help and completion memberships aligned with the public command contract', async () => {
    const box = await sandbox()
    const root = await box.run('ki --help')
    const manage = await box.run('ki manage --help')
    const agora = await box.run('ki agora --help')
    const agoraReference = await box.run('ki agora reference --help')
    const repository = await box.run('ki repo --help')
    const batch = await box.run('ki batch --help')
    const registry = await box.run('ki registry --help')
    const zsh = await box.run('ki manage completion zsh')
    const bash = await box.run('ki manage completion bash')

    expect(commandNames(root.output)).toEqual(rootHelpCommands)
    expect(commandNames(manage.output)).toEqual(manageCommands)
    expect(commandNames(agora.output)).toEqual(agoraCommands)
    expect(commandNames(agoraReference.output)).toEqual(agoraReferenceCommands)
    expect(commandNames(repository.output)).toEqual([
      'init',
      'open',
      'audit',
      'conform',
      'diag',
      'roadmap',
      'store',
      'educate',
      'repair',
      'skill',
      'upgrade'
    ])
    expect(commandNames(batch.output)).toEqual(['prepare', 'validate', 'run', 'close'])
    expect(commandNames(registry.output)).toEqual(registryCommands)
    for (const command of rootHelpCommands) expect(zsh.output).toContain(`${command}:`)
    for (const command of manageCommands) expect(zsh.output).toContain(`${command}:`)
    for (const command of agoraCommands) expect(zsh.output).toContain(`${command}:`)
    for (const command of repoCommands) expect(zsh.output).toContain(`${command}:`)
    for (const command of batchCommands) expect(zsh.output).toContain(`${command}:`)
    for (const command of registryCommands) expect(zsh.output).toContain(`${command}:`)
    expect(bash.output).toContain(`'') printf '%s\\n' '${rootHelpCommands.join(' ')}'`)
    expect(bash.output).toContain(`'manage') printf '%s\\n' '${manageCommands.join(' ')}'`)
    expect(bash.output).toContain(`'agora') printf '%s\\n' '${agoraCommands.join(' ')}'`)
    expect(bash.output).toContain(`'agora reference') printf '%s\\n' '${agoraReferenceCommands.join(' ')}'`)
    expect(bash.output).toContain(
      "'repo') printf '%s\\n' 'init open audit conform diag roadmap store educate repair skill upgrade'"
    )
    expect(bash.output).toContain("'batch') printf '%s\\n' 'prepare validate run close'")
    expect(bash.output).toContain(`'registry') printf '%s\\n' '${registryCommands.join(' ')}'`)

    const manual = await readFile('man/ki.1', 'utf8')
    const inventory = buildCommandInventory(manual)
    const invocations = inventory.groups.flatMap((group) => group.commands.map((command) => command.invocation))
    const registeredLeaves = Array.from(
      bash.output.matchAll(/^ {4}'([^':]+)'\) printf '%s\\n' '' ;;$/gm),
      (match) => match[1] as string
    )
    const covers = (invocation: string, path: string): boolean => {
      let offset = 0
      for (const word of path.split(' ')) {
        const match = new RegExp(`(?:^|[^a-z])${word}(?:$|[^a-z])`).exec(invocation.slice(offset))
        if (!match) return false
        offset += match.index + match[0].length
      }
      return true
    }
    for (const path of registeredLeaves)
      expect(
        invocations.some((invocation) => covers(invocation, path)),
        path
      ).toBe(true)
    for (const invocation of invocations.filter((value) => value.startsWith('ki ') && value !== 'ki [command]'))
      expect(
        registeredLeaves.some((path) => covers(invocation, path)),
        invocation
      ).toBe(true)
  })

  test('keeps the purpose-oriented manual and changelog inventories complete', async () => {
    const [manual, changelog, generated] = await Promise.all([
      readFile('man/ki.1', 'utf8'),
      readFile('CHANGELOG.md', 'utf8'),
      readFile('man/ki.commands.json', 'utf8')
    ])

    expect(generated).toBe(renderCommandInventory(manual))
    expect(JSON.parse(generated).schema).toBe('ki/commands/v1')
    expect(
      manual.match(/\.B ki registry \[--repo <path-or-pattern>]\.\.\. \[--agora <name>] \[--estate] add \[--dry-run]/g)
    ).toHaveLength(2)

    for (const command of rootHelpCommands) {
      expect(manual).toContain(`.B ki ${command}`)
      expect(changelog).toContain(`\`ki ${command}`)
    }
    for (const command of manageCommands) {
      expect(manual).toContain(`.B ki manage ${command}`)
      expect(changelog).toContain(`\`ki manage ${command}`)
    }
    for (const command of repoCommands) {
      expect(manual).toContain(command === 'init' ? '.B ki repo init' : `.B ki repo [repo-options] ${command}`)
      expect(changelog).toContain(`\`ki repo ${command}`)
    }
    expect(manual).toContain('.B ki registry list')
    expect(manual).toContain('.B ki registry remove')
    expect(manual).toContain('.B ki registry [--repo <path-or-pattern>]... [--agora <name>] [--estate] add [--dry-run]')
    for (const command of registryCommands) expect(changelog).toContain(`\`ki registry ${command}`)

    expect(changelog).toContain('`ki dev local set <harness-id> <local-harness-path>`')
    expect(changelog).toContain('`ki dev local on [harness-id]`')
    expect(changelog).toContain('`ki dev local off [harness-id]`')
    expect(changelog).toContain('Harness-qualified skill keys are invalid')
    expect(changelog).not.toContain('`ki dev local set <local-harness-path>`')
    expect(changelog).not.toContain('keeps a quoted, fully-qualified key')
    expect(manual).toContain('.B ki dev local off <harness-id>.')
    expect(manual).not.toContain('.B ki dev local off knowledgeislands/ki-agentic-harness')

    for (const command of agoraCommands) expect(manual).toContain(`.B ki agora ${command}`)
    for (const command of agoraChangelogCommands) expect(changelog).toContain(command)
    expect(manual.indexOf('.SS Repository options')).toBeLessThan(manual.indexOf('.SS Repository management'))
    expect(manual.indexOf('.SS Repository management')).toBeLessThan(manual.indexOf('.SS Registry management'))
    expect(manual.indexOf('.SS Trades')).toBeLessThan(manual.indexOf('.SS Agora management'))
    expect(manual.indexOf('.SS Agora management')).toBeLessThan(manual.indexOf('.SS Acquisition'))
    expect(changelog.indexOf('#### Agora management')).toBeLessThan(changelog.indexOf('#### Repository options'))
    expect(changelog.indexOf('#### Repository options')).toBeLessThan(changelog.indexOf('#### Repository management'))
    expect(changelog.indexOf('#### Repository management')).toBeLessThan(changelog.indexOf('#### Registry management'))
  })
})
