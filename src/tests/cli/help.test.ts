import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('ki help', () => {
  test('prints the root usage, --help, and nested and unknown-help command interfaces', async () => {
    const box = await sandbox()
    const root = await box.run('ki')
    const help = await box.run('ki --help')
    const nested = await box.run('ki help acquire chatgpt import')
    const unknown = await box.run('ki help missing')

    expect(root.output).toContain('Usage: ki')
    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('acquire')
    expect(nested.exitCode).toBe(0)
    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: unknown help topic: missing\n' })
  })
})
