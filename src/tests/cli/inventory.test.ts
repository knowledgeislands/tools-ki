import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const rootHelpCommands = [
  'help',
  'bootstrap',
  'completions',
  'outdated',
  'missing',
  'update',
  'search',
  'cleanup',
  'version',
  'diag',
  'doctor',
  'docs',
  'list',
  'skill',
  'workspace',
  'repo',
  'harness',
  'acquire',
  'dev'
]

const rootCompletionCommands = [...rootHelpCommands].sort()
const repoCommands = ['audit', 'conform', 'diag', 'educate', 'init', 'list', 'plan', 'register', 'skill', 'upgrade']

const commandNames = (output: string): string[] => output.split('\n').flatMap((line) => /^ {2}([a-z]+)(?:\s|$)/.exec(line)?.[1] ?? [])

describe('[ki command inventory]', () => {
  test('keeps runtime help and completion memberships aligned with the public command contract', async () => {
    const box = await sandbox()
    const root = await box.run('ki --help')
    const repository = await box.run('ki repo --help')
    const zsh = await box.run('ki completions zsh')
    const bash = await box.run('ki completions bash')

    expect(commandNames(root.output)).toEqual(rootHelpCommands)
    expect(commandNames(repository.output)).toEqual(['init', 'audit', 'conform', 'register', 'list', 'plan', 'educate', 'skill', 'upgrade', 'diag'])
    expect(zsh.output).toContain(`_values 'command' ${rootCompletionCommands.join(' ')}`)
    expect(zsh.output).toContain(`_values 'repository command' ${repoCommands.join(' ')}`)
    expect(bash.output).toContain(`compgen -W "${rootCompletionCommands.join(' ')} --help --version"`)
    expect(bash.output).toContain(`compgen -W "${repoCommands.join(' ')}"`)
  })

  test('keeps the purpose-oriented manual and changelog inventories complete', async () => {
    const [manual, changelog] = await Promise.all([readFile('man/ki.1', 'utf8'), readFile('CHANGELOG.md', 'utf8')])

    for (const command of rootHelpCommands) {
      expect(manual).toContain(`.B ki ${command}`)
      expect(changelog).toContain(`\`ki ${command}`)
    }
    for (const command of repoCommands) {
      expect(manual).toContain(command === 'list' ? '.B ki repo list' : command === 'init' ? '.B ki repo init' : `.B ki repo [repo-options] ${command}`)
      expect(changelog).toContain(`\`ki repo ${command}`)
    }

    expect(manual.indexOf('.SS Workspace management')).toBeLessThan(manual.indexOf('.SS Repository options'))
    expect(changelog.indexOf('#### Workspace management')).toBeLessThan(changelog.indexOf('#### Repository options'))
  })
})
