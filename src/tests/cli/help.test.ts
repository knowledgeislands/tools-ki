import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki help]', () => {
  test('prints the root usage, --help, and nested and unknown-help command interfaces', async () => {
    const box = await sandbox()
    const root = await box.run('ki')
    const help = await box.run('ki --help')
    const nested = await box.run('ki help acquire chatgpt import')
    const list = await box.run('ki help list')
    const install = await box.run('ki help install')
    const reinstall = await box.run('ki help reinstall')
    const uninstall = await box.run('ki help uninstall')
    const update = await box.run('ki help update')
    const upgrade = await box.run('ki help upgrade')
    const repository = await box.run('ki repo --help')
    const missing = await box.run('ki help missing')
    const unknown = await box.run('ki help absent')

    expect(root.output).toContain('Usage: ki')
    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('acquire')
    expect(nested.exitCode).toBe(0)
    expect(list.output).toContain('list installed harness capabilities and declared skills')
    expect(install.output).toMatch(/activating\s+it/)
    expect(reinstall.output).toMatch(/verified archive\s+without\s+activating it/)
    expect(uninstall.output).toMatch(/changing\s+activation/)
    expect(update.output).toContain('installer-managed CLI')
    expect(upgrade.output).toContain('current repository')
    expect(missing.output).toContain('report desired capabilities without an installed provider')
    expect(repository.output).toContain('educate')
    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: unknown help topic: absent\n' })
  })
})
