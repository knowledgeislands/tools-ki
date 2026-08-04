import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const rootHelpCommands = [
  'help',
  'bootstrap',
  'completion',
  'outdated',
  'missing',
  'update',
  'search',
  'cleanup',
  'agora',
  'version',
  'diag',
  'repair',
  'doctor',
  'docs',
  'list',
  'skill',
  'workspace',
  'repo',
  'register',
  'harness',
  'trades',
  'acquire',
  'dev'
]

const rootCompletionCommands = [...rootHelpCommands].sort()
const repoCommands = ['audit', 'conform', 'educate', 'init', 'plan', 'skill', 'upgrade']
const registerCommands = ['add', 'list']

const commandNames = (output: string): string[] => output.split('\n').flatMap((line) => /^ {2}([a-z]+)(?:\s|$)/.exec(line)?.[1] ?? [])

describe('[ki command inventory]', () => {
  test('keeps runtime help and completion memberships aligned with the public command contract', async () => {
    const box = await sandbox()
    const root = await box.run('ki --help')
    const repository = await box.run('ki repo --help')
    const register = await box.run('ki register --help')
    const zsh = await box.run('ki completion zsh')
    const bash = await box.run('ki completion bash')

    expect(commandNames(root.output)).toEqual(rootHelpCommands)
    expect(commandNames(repository.output)).toEqual(['init', 'audit', 'conform', 'plan', 'educate', 'skill', 'upgrade'])
    expect(commandNames(register.output)).toEqual(registerCommands)
    for (const command of rootCompletionCommands) expect(zsh.output).toContain(`'${command}:`)
    for (const command of repoCommands) expect(zsh.output).toContain(`'${command}:`)
    for (const command of registerCommands) expect(zsh.output).toContain(`'${command}:`)
    expect(bash.output).toContain(`compgen -W "${rootCompletionCommands.join(' ')} --help --version"`)
    expect(bash.output).toContain(`compgen -W "${repoCommands.join(' ')}"`)
    expect(bash.output).toContain(`compgen -W "${registerCommands.join(' ')}"`)
  })

  test('keeps the purpose-oriented manual and changelog inventories complete', async () => {
    const [manual, changelog] = await Promise.all([readFile('man/ki.1', 'utf8'), readFile('CHANGELOG.md', 'utf8')])

    for (const command of rootHelpCommands) {
      expect(manual).toContain(`.B ki ${command}`)
      expect(changelog).toContain(`\`ki ${command}`)
    }
    for (const command of repoCommands) {
      expect(manual).toContain(command === 'init' ? '.B ki repo init' : `.B ki repo [repo-options] ${command}`)
      expect(changelog).toContain(`\`ki repo ${command}`)
    }
    expect(manual).toContain('.B ki register list')
    expect(manual).toContain('.B ki register [--repo <path-or-pattern>]... [--workspace <group>] add [--dry-run]')
    for (const command of registerCommands) expect(changelog).toContain(`\`ki register ${command}`)

    expect(manual.indexOf('.SS Workspace management')).toBeLessThan(manual.indexOf('.SS Repository options'))
    expect(changelog.indexOf('#### Workspace management')).toBeLessThan(changelog.indexOf('#### Repository options'))
  })
})
