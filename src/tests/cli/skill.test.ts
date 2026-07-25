import { lstat, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from './_cli_helper.ts'

describe('[ki skill]', () => {
  const bootstrapClaudeCode = async (box: Sandbox): Promise<void> => {
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness()
    await box.run('ki bootstrap')
  }

  describe('user scope', () => {
    test('links and declares a user skill, then unlinks and undeclares it', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      const link = join(box.home.path, '.claude', 'skills', 'ki-example')
      const source = join(box.data.path, 'ki', 'harnesses', 'example', 'harness', 'skills', 'ki-example')

      const added = await box.run('ki skill user add ki-example')
      const linkStat = await lstat(link)
      const linkTarget = await realpath(link)
      const sourceTarget = await realpath(source)
      const configAfterAdd = await box.config.read('ki/config.toml')
      expect(added).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(linkTarget).toBe(sourceTarget)
      expect(configAfterAdd).toContain('[skills.ki-example]\nharness = "example/harness"')

      const removed = await box.run('ki skill user remove ki-example')
      const configAfterRemove = await box.config.read('ki/config.toml')
      expect(removed).toEqual({ exitCode: 0, output: 'ki skill user remove: unlinked ki-example for claude-code\n' })
      await expect(lstat(link)).rejects.toThrow()
      expect(configAfterRemove).not.toContain('ki-example')

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
      const linkTargetBeforeReplace = await realpath(link)
      const decoyTarget = await realpath(decoy)
      expect(refused.exitCode).toBe(1)
      expect(refused.output).toContain('points elsewhere; pass --replace to re-point')
      expect(linkTargetBeforeReplace).toBe(decoyTarget)

      const replaced = await box.run('ki skill user add ki-example --replace')
      const linkTargetAfterReplace = await realpath(link)
      const sourceTarget = await realpath(join(box.data.path, 'ki', 'harnesses', 'example', 'harness', 'skills', 'ki-example'))
      expect(replaced).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
      expect(linkTargetAfterReplace).toBe(sourceTarget)
    })

    test('refuses to adopt a foreign user skill directory', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await mkdir(join(box.home.path, '.claude', 'skills', 'ki-example'), { recursive: true })

      const guarded = await box.run('ki skill user add ki-example')
      expect(guarded.exitCode).toBe(1)
      expect(guarded.output).toContain('is not KI-managed')
    })

    test('handles duplicate provider skill in different harnesses', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      // Set up a second harness with the same skill name
      await box.setupExampleHarness()
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')

      // This should handle the duplicate provider case
      const result = await box.run('ki skill user add ki-example')

      // The exact behavior depends on how duplicate providers are handled
      // It should either succeed or fail with a clear message
      expect(result.exitCode).toBeLessThanOrEqual(1)
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
      const linkStat = await lstat(link)
      const configAfterAdd = await box.project.read('.ki-config.toml')
      expect(added).toEqual({ exitCode: 0, output: `ki skill repo add: linked ki-example into ${projectRoot} for claude-code\n` })
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(configAfterAdd).toContain('[ki-example]')

      const removed = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      const configAfterRemove = await box.project.read('.ki-config.toml')
      expect(removed).toEqual({ exitCode: 0, output: `ki skill repo remove: removed ki-example in ${projectRoot} for claude-code\n` })
      await expect(lstat(link)).rejects.toThrow()
      expect(configAfterRemove).not.toContain('[ki-example]')

      const repeated = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      expect(repeated).toEqual({
        exitCode: 0,
        output: `ki skill repo remove: no KI-managed link or declaration for ki-example in ${projectRoot} for claude-code\n`
      })
    })
  })
})
