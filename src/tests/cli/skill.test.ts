import { lstat, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from './_helper.ts'

describe('ki skill', () => {
  const bootstrapClaudeCode = async (box: Sandbox): Promise<void> => {
    await box.home.mkdir('.claude')
    await box.installBootstrapHarness()
    await box.installExampleHarness()
    await box.run('ki bootstrap')
  }

  describe('user scope', () => {
    test('links and declares a user skill, then unlinks and undeclares it', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      const link = join(box.home.path, '.claude', 'skills', 'ki-example')
      const source = join(box.data.path, 'ki', 'harnesses', 'example', 'harness', 'skills', 'ki-example')

      const added = await box.run('ki skill user add ki-example')
      expect(added).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await realpath(link)).toBe(await realpath(source))
      expect(await box.config.read('ki/config.toml')).toContain('[skills.ki-example]\nharness = "example/harness"')

      const removed = await box.run('ki skill user remove ki-example')
      expect(removed).toEqual({ exitCode: 0, output: 'ki skill user remove: unlinked ki-example for claude-code\n' })
      await expect(lstat(link)).rejects.toThrow()
      expect(await box.config.read('ki/config.toml')).not.toContain('ki-example')

      const repeated = await box.run('ki skill user remove ki-example')
      expect(repeated).toEqual({ exitCode: 0, output: 'ki skill user remove: no KI-managed link for ki-example for claude-code\n' })
    })

    test('re-points a divergent KI-managed user link only under --replace', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      const decoy = join(box.root.path, 'decoy')
      await mkdir(decoy, { recursive: true })
      const link = join(box.home.path, '.claude', 'skills', 'ki-example')
      await symlink(decoy, link, 'dir')

      const refused = await box.run('ki skill user add ki-example')
      expect(refused.exitCode).toBe(1)
      expect(refused.output).toContain('points elsewhere; pass --replace to re-point')
      expect(await realpath(link)).toBe(await realpath(decoy))

      const replaced = await box.run('ki skill user add ki-example --replace')
      expect(replaced).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
      expect(await realpath(link)).toBe(
        await realpath(join(box.data.path, 'ki', 'harnesses', 'example', 'harness', 'skills', 'ki-example'))
      )
    })

    test('refuses to adopt a foreign user skill directory', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await mkdir(join(box.home.path, '.claude', 'skills', 'ki-example'), { recursive: true })

      const guarded = await box.run('ki skill user add ki-example')
      expect(guarded.exitCode).toBe(1)
      expect(guarded.output).toContain('is not KI-managed')
    })
  })

  describe('repository scope', () => {
    test('links and declares a repository skill, then removes and undeclares it', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await writeFile(join(box.project.path, '.ki-config.toml'), '# project declarations\n')
      const projectRoot = await realpath(box.project.path)
      const link = join(projectRoot, '.claude', 'skills', 'ki-example')

      const added = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)
      expect(added).toEqual({ exitCode: 0, output: `ki skill repo add: linked ki-example into ${projectRoot} for claude-code\n` })
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await box.project.read('.ki-config.toml')).toContain('[ki-example]')

      const removed = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      expect(removed).toEqual({ exitCode: 0, output: `ki skill repo remove: removed ki-example in ${projectRoot} for claude-code\n` })
      await expect(lstat(link)).rejects.toThrow()
      expect(await box.project.read('.ki-config.toml')).not.toContain('[ki-example]')

      const repeated = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      expect(repeated).toEqual({
        exitCode: 0,
        output: `ki skill repo remove: no KI-managed link or declaration for ki-example in ${projectRoot} for claude-code\n`
      })
    })
  })
})
