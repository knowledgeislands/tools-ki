import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki completion]', () => {
  test('renders zsh and bash completion scripts', async () => {
    const box = await sandbox()
    const zsh = await box.run('ki completion zsh')
    const bash = await box.run('ki completion bash')

    expect(zsh.output).toContain('#compdef ki')
    expect(zsh.output).toContain("_values 'repository command' audit conform educate init list plan register skill upgrade")
    expect(zsh.output).toContain(
      "_values 'command' acquire bootstrap cleanup completion dev diag docs doctor handoffs harness help list missing outdated repair repo search skill update version workspace"
    )
    expect(bash.output).toContain('compgen -W "audit conform educate init list plan register skill upgrade"')
    expect(bash.output).toContain(
      'compgen -W "acquire bootstrap cleanup completion dev diag docs doctor handoffs harness help list missing outdated repair repo search skill update version workspace --help --version"'
    )
    expect(bash.output).toContain('complete -F _ki ki')
  })

  test('rejects an unsupported shell and requires a shell argument', async () => {
    const box = await sandbox()
    const invalidCompletion = await box.run('ki completion fish')
    const missingCompletionShell = await box.run('ki completion')

    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completion shell must be bash or zsh\n' })
    expect(missingCompletionShell.exitCode).toBe(2)
  })

  test('rejects the retired plural completion command name', async () => {
    const box = await sandbox()
    const plural = await box.run('ki completions bash')

    expect(plural.exitCode).toBe(2)
  })
})
