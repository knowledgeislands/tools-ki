import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki unknown]', () => {
  test('rejects unknown root subcommands and options before root help', async () => {
    const box = await sandbox()
    const unknown = await box.run('ki unknown')
    const unknownWithHelp = await box.run('ki unknown -h')
    const longOption = await box.run('ki --unknown')
    const shortOptionWithHelp = await box.run('ki -x -h')
    const optionAfterHelp = await box.run('ki manage diag -h --repo')
    const declaredOptionWithHelp = await box.run('ki repo --repo repository -h')
    const optionTerminatorWithHelp = await box.run('ki manage diag -h -- --repo')
    const retired = await Promise.all(
      [
        'cleanup',
        'completion',
        'diag',
        'docs',
        'doctor',
        'help',
        'list',
        'missing',
        'outdated',
        'repair',
        'search',
        'update',
        'version'
      ].map((command) => box.run(`ki ${command}`))
    )

    for (const result of [unknown, unknownWithHelp]) {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain("ki: error: unknown subcommand 'unknown' for 'ki'\n")
      expect(result.output).toContain('Usage: ki')
    }
    for (const result of [longOption, shortOptionWithHelp]) {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain("ki: error: unknown option '")
      expect(result.output).toContain("for 'ki'\n")
      expect(result.output).toContain('Usage: ki')
    }
    for (const result of retired) {
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain("ki: error: unknown subcommand '")
      expect(result.output).toContain("for 'ki'\n")
    }
    expect(optionAfterHelp.exitCode).toBe(2)
    expect(optionAfterHelp.output).toContain("ki: error: unknown option '--repo' for 'ki manage diag'\n")
    expect(optionAfterHelp.output).toContain('Usage: ki manage diag [options]')
    for (const result of [declaredOptionWithHelp, optionTerminatorWithHelp]) {
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Usage: ki')
      expect(result.output).not.toContain('ki: error:')
    }
  })
})
