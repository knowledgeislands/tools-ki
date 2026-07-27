import { lstat, mkdir, realpath, symlink, unlink, writeFile } from 'node:fs/promises'
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

    test('re-points a dangling KI-managed link only under --replace', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      const link = join(box.home.path, '.claude', 'skills', 'ki-example')
      await box.run('ki skill user add ki-example')
      await unlink(link)
      await symlink(join(box.root.path, 'missing-skill'), link, 'dir')

      const refused = await box.run('ki skill user add ki-example')
      const replaced = await box.run('ki skill user add ki-example --replace')

      expect(refused.output).toContain('points elsewhere; pass --replace to re-point')
      expect(replaced).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
    })

    test('refuses removal when a configured agent home is missing', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `schema = 1

[agents]
ids = ["claude-code"]

[harnesses]
ids = []

[skills]
`
      )

      const removed = await box.run('ki skill user remove ki-example')

      expect(removed).toEqual({ exitCode: 1, output: 'ki: error: claude-code user directory must be a directory\n' })
    })

    test('refuses to remove a foreign user skill directory', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      const link = join(box.home.path, '.claude', 'skills', 'ki-example')
      await box.run('ki skill user add ki-example')
      await unlink(link)
      await mkdir(link)

      const removed = await box.run('ki skill user remove ki-example')

      expect(removed.output).toContain('claude-code ki-example skill is not KI-managed')
    })

    test('reports an unavailable or ambiguous user skill provider', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)

      const unavailable = await box.run('ki skill user add not-installed')
      await box.data.write('ki/harnesses/other/harness/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')
      const ambiguous = await box.run('ki skill user add ki-example')

      expect(unavailable.output).toContain('no installed harness provides skill not-installed')
      expect(ambiguous.output).toContain('skill ki-example is provided by multiple installed harnesses')
    })
  })

  describe('repository scope', () => {
    test('rejects non-directory repositories and missing or symbolic repository configuration files', async () => {
      const box = await sandbox()
      await box.root.write('not-a-repository', 'not a directory\n')
      const missing = await box.root.mkdir('missing-configuration')
      const linked = await box.root.mkdir('linked-configuration')
      await box.root.write('repository-configuration.toml', '# external\n')
      await symlink(`${box.root.path}/repository-configuration.toml`, `${linked}/.ki-config.toml`)

      const file = await box.run(`ki skill repo add ki-example --repo ${box.root.path}/not-a-repository`)
      const nonexistent = await box.run(`ki skill repo add ki-example --repo ${box.root.path}/does-not-exist`)
      const absent = await box.run(`ki skill repo add ki-example --repo ${missing}`)
      const symbolic = await box.run(`ki skill repo add ki-example --repo ${linked}`)

      expect(file).toEqual({ exitCode: 2, output: 'ki: error: --repo must be an existing directory\n' })
      expect(nonexistent).toEqual({ exitCode: 2, output: 'ki: error: --repo must be an existing directory\n' })
      expect(absent).toEqual({ exitCode: 2, output: 'ki: error: --repo must name a repository containing .ki-config.toml\n' })
      expect(symbolic).toEqual({ exitCode: 2, output: 'ki: error: --repo must name a repository containing .ki-config.toml\n' })
    })

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

    test('declares a repository skill when its configuration has no final newline', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await box.project.write('.ki-config.toml', '# project declarations')

      const added = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)

      expect(added.exitCode).toBe(0)
      expect(await box.project.read('.ki-config.toml')).toBe('# project declarations\n\n[ki-example]\n')
    })

    test('refuses to remove a foreign repository skill directory', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await box.project.write('.ki-config.toml', '# project declarations\n')
      const link = join(box.project.path, '.claude', 'skills', 'ki-example')
      await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)
      await unlink(link)
      await mkdir(link)

      const removed = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)

      expect(removed.output).toContain('claude-code ki-example skill is not KI-managed')
    })

    test('does not duplicate a declaration and preserves a following table when removing it', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await box.project.write('.ki-config.toml', '[ki-example]\nsetting = true\n\n[other]\nvalue = 1')

      const repeated = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)
      const removed = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      const configuration = await box.project.read('.ki-config.toml')

      expect(repeated.exitCode).toBe(0)
      expect(removed.exitCode).toBe(0)
      expect(configuration).toBe('[other]\nvalue = 1')
    })

    test('rejects a non-table declared skill before preparing an educational catalogue', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', 'ki-example = []\n')

      const result = await box.run(`ki repo educate --repo ${box.project.path}`)

      expect(result).toEqual({ exitCode: 1, output: 'ki: error: declared skill ki-example must use a TOML table\n' })
    })

    test('ignores non-skill tables in a repository catalogue', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[other]\nvalue = 1\n')

      const result = await box.run(`ki repo educate --repo ${box.project.path}`)

      expect(result).toEqual({ exitCode: 0, output: 'ki repo educate: no declared skills\n' })
    })

    test('deduplicates a transitive dependency while selecting a repository skill', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write('ki/harnesses/example/harness/skills/ki-a/SKILL.md', '---\nname: ki-a\nki-depends-on: [ki-b, ki-c]\n---\n')
      await box.data.write('ki/harnesses/example/harness/skills/ki-b/SKILL.md', '---\nname: ki-b\nki-depends-on: [ki-d]\n---\n')
      await box.data.write('ki/harnesses/example/harness/skills/ki-c/SKILL.md', '---\nname: ki-c\nki-depends-on: [ki-d]\n---\n')
      await box.data.write('ki/harnesses/example/harness/skills/ki-d/SKILL.md', '---\nname: ki-d\nki-depends-on: []\n---\n')
      await box.project.write('.ki-config.toml', '[ki-a]\n[ki-b]\n[ki-c]\n[ki-d]\n')

      const result = await box.run(`ki repo audit --repo ${box.project.path} --skill ki-a`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('example/harness:ki-d does not provide a rubric catalogue')
    })
  })
})
