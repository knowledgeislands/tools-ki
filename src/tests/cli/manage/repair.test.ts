import { lstat, realpath, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki manage repair]', () => {
  test('recreates a configured missing user-skill link without repairing repository projections', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await unlink(`${box.home.path}/.claude/skills/ki-recap`)
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills]\n')

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
      output:
        '╭─ KI MANAGE REPAIR\n├─ results (1)\n│  ╰─ ✗ Configuration: missing; run ki bootstrap\n╰─ summary: FAIL\n'
    })
    expect(invalidRepair).toEqual({
      exitCode: 1,
      output: expect.stringContaining('✗ Configuration: configuration must be valid TOML')
    })
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
    expect(incompatibleRepair).toEqual({
      exitCode: 1,
      output: expect.stringContaining('User skill ki-example: no compatible configured agent')
    })
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

  // An install extracts into `.install-` and parks the payload it displaces in `.replace-`, both
  // beside the destination. A process killed before either is promoted leaves it on disk.
  describe('interrupted install residue', () => {
    const uuid = '11111111-2222-3333-4444-555555555555'

    test('removes an unpromoted staging directory and leaves discovery working throughout', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const orphan = await box.data.mkdir('ki/harnesses/example/.install-abc123')
      await box.data.write('ki/harnesses/example/.install-abc123/partial', 'half-extracted\n')

      const listed = await box.run('ki harness list')
      const cleanup = await box.run('ki manage cleanup')
      const repair = await box.run('ki manage repair')

      expect(listed.exitCode).toBe(0)
      expect(listed.output).toContain('example/harness')
      expect(cleanup.output).toContain(`${orphan} [removable] unpromoted extraction from an interrupted install`)
      expect(repair.output).toContain(`removed ${orphan}`)
      await expect(lstat(orphan)).rejects.toThrow()
    })

    test('restores a parked payload when the harness it replaced is absent', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const relative = `ki/harnesses/example/.replace-${uuid}-harness`
      const parked = await box.data.mkdir(relative)
      await box.data.write(`${relative}/skills/ki-example/SKILL.md`, '---\nname: ki-example\nki-depends-on: []\n---\n')
      await rm(`${box.data.path}/ki/harnesses/example/harness`, { recursive: true })

      const cleanup = await box.run('ki manage cleanup')
      const repair = await box.run('ki manage repair')

      expect(cleanup.output).toContain('[restorable] restores example/harness')
      expect(repair.output).toContain(`restored ${parked}`)
      expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toContain('ki-example')
      await expect(lstat(parked)).rejects.toThrow()
    })

    test('removes a parked payload only once its destination is installed again', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const parked = await box.data.mkdir(`ki/harnesses/example/.replace-${uuid}-harness`)

      const cleanup = await box.run('ki manage cleanup')
      const dryRun = await box.run('ki manage repair --dry-run')

      expect(cleanup.output).toContain('[removable] example/harness is installed')
      expect(dryRun.output).toContain(`would remove ${parked}`)
      // Asserted between the two runs: the dry run must leave on disk what the real run removes.
      expect((await lstat(parked)).isDirectory()).toBe(true)

      const repair = await box.run('ki manage repair')

      expect(repair.output).toContain(`removed ${parked}`)
      await expect(lstat(parked)).rejects.toThrow()
    })

    // Without a destination in its name there is nothing to restore it to, and it may be the only
    // verified copy of whatever it parked, so it is reported rather than guessed at or deleted.
    test('refuses a parked payload that does not name the harness it replaced', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const parked = await box.data.mkdir(`ki/harnesses/example/.replace-${uuid}`)

      const cleanup = await box.run('ki manage cleanup')
      const repair = await box.run('ki manage repair')

      expect(cleanup.output).toContain(`${parked} [needs manual inspection]`)
      expect(repair.exitCode).toBe(1)
      expect(repair.output).toContain(
        `✗ Install residue ${parked}: parked payload does not name the harness it replaced`
      )
      expect((await lstat(parked)).isDirectory()).toBe(true)
    })

    // Cleanup has to survive a harness tree that discovery would refuse outright, because a
    // broken tree is exactly when an operator reaches for it.
    test('reports every orphan and skips an owner entry it has no business reading', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const staging = await box.data.mkdir('ki/harnesses/example/.install-abc123')
      const parked = await box.data.mkdir(`ki/harnesses/example/.replace-${uuid}-harness`)
      await box.data.write('ki/harnesses/Not_An_Owner', 'not a harness owner\n')

      const cleanup = await box.run('ki manage cleanup')

      expect(cleanup.exitCode).toBe(0)
      expect(cleanup.output).toContain('├─ eligible (2)')
      expect(cleanup.output).toContain(`├─ ${staging} [removable]`)
      expect(cleanup.output).toContain(`╰─ ${parked} [removable]`)
      expect(cleanup.output).toContain('summary: ELIGIBLE=2')
    })

    test('still refuses an entry that is not this repository’s own residue, naming its path', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const foreign = await box.data.mkdir('ki/harnesses/example/Not_A_Harness')

      const listed = await box.run('ki harness list')

      expect(listed.exitCode).toBe(1)
      expect(listed.output).toContain(`installed harness example contains an unsafe name entry ${foreign}`)
    })
  })
})
