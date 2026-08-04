import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki manage completion zsh registration]', () => {
  test('registers the generated function when sourced', async () => {
    const box = await sandbox()
    const zsh = await box.run('ki manage completion zsh')

    expect(zsh.output).toContain('compdef _ki ki')
    expect(zsh.output).not.toContain('_ki "$@"')
  })
})
