import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki manage completion]', () => {
  test('renders zsh and bash completion scripts', async () => {
    const box = await sandbox()
    const zsh = await box.run('ki manage completion zsh')
    const bash = await box.run('ki manage completion bash')

    expect(zsh.output).toContain('#compdef ki')
    expect(zsh.output).toContain("zstyle ':completion:*:ki-commands' verbose yes")
    expect(zsh.output).toContain("zstyle ':completion:*:ki-management-commands' verbose yes")
    expect(zsh.output).toContain("_describe -t ki-repository-commands 'repository command' commands")
    expect(zsh.output).toContain("_describe -t ki-management-commands 'management command' commands")
    expect(zsh.output).toContain("_describe -t ki-registry-commands 'registry command' commands")
    expect(zsh.output).toContain("commands=('acquire:import a local capture' 'agora:manage workspace profiles' 'bootstrap:configure KI for this user'")
    expect(zsh.output).toContain("_describe -t ki-commands 'command' commands")
    expect(zsh.output).toContain("'trades:manage cross-repository trades'")
    expect(bash.output).toContain('compgen -W "audit conform educate init plan repair skill upgrade"')
    expect(bash.output).toContain('compgen -W "cleanup completion diag docs doctor list missing outdated search update"')
    expect(bash.output).toContain('compgen -W "add list"')
    expect(bash.output).toContain('compgen -W "acquire agora bootstrap dev harness manage registry repo skill trades workspace --help --version"')
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
