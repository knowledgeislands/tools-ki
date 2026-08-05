import { lstat, realpath, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki manage repair]', () => {
  test('recreates a configured missing user-skill link without repairing repository projections', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await unlink(`${box.home.path}/.claude/skills/ki-recap`)
    await box.project.write('.ki-config.toml', '[skills]\n')

    const repaired = await box.run('ki manage repair')
    const doctor = await box.run('ki manage doctor')

    expect(repaired).toEqual({ exitCode: 0, output: expect.stringContaining('link ') })
    expect((await lstat(`${box.home.path}/.claude/skills/ki-recap`)).isSymbolicLink()).toBe(true)
    expect(doctor.exitCode).toBe(0)
    await expect(lstat(join(box.project.path, '.agents/skills/ki-recap'))).rejects.toThrow()
  })

  test('reports a dry-run link repair without changing it', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await unlink(`${box.home.path}/.claude/skills/ki-recap`)

    const repair = await box.run('ki manage repair --dry-run')

    expect(repair).toEqual({ exitCode: 0, output: expect.stringContaining('would link ') })
    await expect(lstat(`${box.home.path}/.claude/skills/ki-recap`)).rejects.toThrow()
  })

  test('re-points a stale symbolic link and preserves a non-link as unsafe', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    const recap = `${box.home.path}/.claude/skills/ki-recap`
    await unlink(recap)
    await symlink(`${box.root.path}/missing-recap`, recap, 'dir')
    await unlink(`${box.home.path}/.claude/skills/ki-next`)
    await box.home.write('.claude/skills/ki-next', 'user-owned\n')

    const repair = await box.run('ki manage repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('link ')
    expect(repair.output).toContain('ki-recap -> ')
    expect(repair.output).toContain('User skill ki-next for claude-code: skill is not a symbolic link')
    expect((await lstat(recap)).isSymbolicLink()).toBe(true)
    expect((await lstat(`${box.home.path}/.claude/skills/ki-next`)).isFile()).toBe(true)
  })

  test('reports missing and invalid configuration without changing it', async () => {
    const missing = await sandbox()
    const missingRepair = await missing.run('ki manage repair')
    const invalid = await sandbox()
    await invalid.config.write('ki/config.toml', 'schema = 1\n[agents\n')
    const invalidRepair = await invalid.run('ki manage repair')

    expect(missingRepair).toEqual({
      exitCode: 1,
      output: '╭─ KI MANAGE REPAIR\n├─ results (1)\n│  ╰─ ✗ Configuration: missing; run ki bootstrap\n╰─ summary: FAIL\n'
    })
    expect(invalidRepair).toEqual({ exitCode: 1, output: expect.stringContaining('✗ Configuration: configuration must be valid TOML') })
  })

  test('reports unavailable configured sources and skills with no compatible configured agent', async () => {
    const unavailable = await sandbox()
    await unavailable.config.write(
      'ki/config.toml',
      'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills.ki-missing]\nharness = "missing/harness"\n'
    )
    const unavailableRepair = await unavailable.run('ki manage repair')
    const incompatible = await sandbox()
    await incompatible.setupAgentHome('claude-code')
    await incompatible.setupExampleHarness()
    await incompatible.data.write(
      'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
      '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [chatgpt-codex]\n---\n'
    )
    await incompatible.config.write(
      'ki/config.toml',
      'schema = 1\n\n[agents]\nids = ["claude-code"]\n\n[harnesses]\nids = ["example/harness"]\n\n[skills.ki-example]\nharness = "example/harness"\n'
    )
    const incompatibleRepair = await incompatible.run('ki manage repair')

    expect(unavailableRepair).toEqual({
      exitCode: 1,
      output: expect.stringContaining('User skill ki-missing: configured source missing/harness is unavailable')
    })
    expect(incompatibleRepair).toEqual({ exitCode: 1, output: expect.stringContaining('User skill ki-example: no compatible configured agent') })
  })

  test('uses the active local canonical harness as the repair source', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set ${harnessPath}`)
    await box.run('ki dev local on')
    const recap = `${box.home.path}/.claude/skills/ki-recap`
    await unlink(recap)

    const repair = await box.run('ki manage repair')

    expect(repair.exitCode).toBe(0)
    expect(await realpath(recap)).toBe(`${harnessPath}/skills/change-management/ki-recap`)
  })
})
