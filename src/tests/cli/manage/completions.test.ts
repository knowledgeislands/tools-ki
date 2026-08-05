import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

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
