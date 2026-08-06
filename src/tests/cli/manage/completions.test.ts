import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const commandPaths = [
  'acquire',
  'acquire chatgpt',
  'acquire chatgpt import',
  'agora',
  'agora add',
  'agora create',
  'agora discover',
  'agora list',
  'agora open',
  'agora remove',
  'agora show',
  'bootstrap',
  'dev',
  'dev local',
  'dev local off',
  'dev local on',
  'dev local set',
  'dev skill',
  'dev skill rubric',
  'harness',
  'harness info',
  'harness install',
  'harness list',
  'harness reinstall',
  'harness uninstall',
  'manage',
  'manage cleanup',
  'manage completion',
  'manage diag',
  'manage docs',
  'manage doctor',
  'manage list',
  'manage missing',
  'manage outdated',
  'manage repair',
  'manage search',
  'manage update',
  'registry',
  'registry add',
  'registry list',
  'repo',
  'repo audit',
  'repo conform',
  'repo educate',
  'repo init',
  'repo repair',
  'repo roadmap',
  'repo roadmap demote',
  'repo roadmap list',
  'repo roadmap promote',
  'repo roadmap prune',
  'repo skill',
  'repo skill add',
  'repo skill remove',
  'repo upgrade',
  'skill',
  'skill add',
  'skill remove',
  'trade',
  'trade list',
  'trade new',
  'trade prune',
  'trade receive',
  'trade release',
  'trade routes',
  'trade routes add',
  'trade routes check',
  'trade routes list',
  'trade routes remove',
  'trade show'
] as const

describe('[ki manage completion]', () => {
  test('renders zsh and bash completion scripts', async () => {
    const box = await sandbox()
    const zsh = await box.run('ki manage completion zsh')
    const bash = await box.run('ki manage completion bash')

    expect(zsh.output).toContain('#compdef ki')
    expect(zsh.output).toContain("zstyle ':completion:*:ki-commands' verbose yes")
    expect(zsh.output).toContain("'repo roadmap')")
    expect(zsh.output).toContain("'repo skill')")
    expect(zsh.output).toContain("'trade routes')")
    expect(zsh.output).toContain("'acquire chatgpt')")
    expect(zsh.output).toContain("'dev local')")
    expect(zsh.output).toContain("'import:import a local capture into an immutable Knowledge Export Package'")
    expect(zsh.output).toContain("'-h:display help for command'")
    expect(zsh.output).toContain("_describe -t ki-commands 'command or option' candidates")
    expect(zsh.output).toContain("'trade:submit and inspect typed cross-repository work and knowledge trades'")
    expect(bash.output).toContain('_ki_value_strategy()')
    expect(bash.output).toContain("'repo roadmap')")
    expect(bash.output).toContain("'trade routes')")
    expect(bash.output).toContain("'acquire chatgpt')")
    expect(bash.output).toContain("'dev local')")
    expect(bash.output).toContain("'repo roadmap list:--horizon')")
    expect(bash.output).toContain("'acquire chatgpt import:--output')")
    expect(bash.output).toContain("'-V --version -h --help'")
    expect(bash.output).toContain('compgen -f')
    expect(bash.output).toContain('complete -F _ki ki')
    for (const path of commandPaths) {
      expect(bash.output).toContain(`'${path}')`)
      expect(zsh.output).toContain(`'${path}')`)
    }
    for (const output of [bash.output, zsh.output]) {
      expect(output).toContain("'repo:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'repo roadmap:--repo') printf '%s\\n' 'path'")
      expect(output).toContain("'acquire chatgpt import:0') printf '%s\\n' 'path'")
      expect(output).toContain("'agora add:1') printf '%s\\n' 'path'")
      expect(output).toContain("'manage docs:0') printf '%s\\n' 'overview site manual roadmap'")
      expect(output).toContain("'trade new:--title') printf '%s\\n' ''")
    }
  })

  test('rejects an unsupported shell and requires a shell argument', async () => {
    const box = await sandbox()
    const invalidCompletion = await box.run('ki manage completion fish')
    const missingCompletionShell = await box.run('ki manage completion')

    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completion shell must be bash or zsh\n' })
    expect(missingCompletionShell.exitCode).toBe(2)
  })

  test('rejects retired root and plural completion command names', async () => {
    const box = await sandbox()
    const root = await box.run('ki completion zsh')
    const plural = await box.run('ki completions bash')

    expect(root.exitCode).toBe(2)
    expect(plural.exitCode).toBe(2)
  })
})
