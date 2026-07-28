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
    test('activates portable and runtime-bound skills only for compatible configured agents', async () => {
      const portable = await sandbox()
      await portable.setupAgentHome('claude-code')
      await portable.setupAgentHome('chatgpt-codex')
      await portable.setupExampleHarness()
      await portable.run('ki bootstrap')

      const portableAdded = await portable.run('ki skill user add ki-example')

      expect(portableAdded).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code, chatgpt-codex\n' })
      expect(await portable.home.isSymlink('.claude/skills/ki-example')).toBe(true)
      expect(await portable.home.isSymlink('.agents/skills/ki-example')).toBe(true)

      const codex = await sandbox()
      await codex.setupAgentHome('claude-code')
      await codex.setupAgentHome('chatgpt-codex')
      await codex.setupExampleHarness()
      await codex.data.write(
        'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [codex]\n---\n'
      )
      await codex.run('ki bootstrap')

      const codexAdded = await codex.run('ki skill user add ki-example')

      expect(codexAdded).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for chatgpt-codex\n' })
      await expect(lstat(join(codex.home.path, '.claude', 'skills', 'ki-example'))).rejects.toThrow()
      expect(await codex.home.isSymlink('.agents/skills/ki-example')).toBe(true)
    })

    test('refuses incompatible or invalid runtime metadata before mutating user state', async () => {
      const incompatible = await sandbox()
      await incompatible.setupAgentHome('claude-code')
      await incompatible.setupExampleHarness()
      await incompatible.data.write(
        'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [codex]\n---\n'
      )
      await incompatible.run('ki bootstrap')

      const refused = await incompatible.run('ki skill user add ki-example')

      expect(refused).toEqual({ exitCode: 1, output: 'ki: error: skill ki-example is incompatible with every configured agent\n' })
      await expect(lstat(join(incompatible.home.path, '.claude', 'skills', 'ki-example'))).rejects.toThrow()
      expect(await incompatible.config.read('ki/config.toml')).not.toContain('[skills.ki-example]')

      const invalid = await sandbox()
      await invalid.setupAgentHome('claude-code')
      await invalid.setupExampleHarness()
      await invalid.data.write(
        'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: []\n---\n'
      )
      await invalid.run('ki bootstrap')

      const invalidResult = await invalid.run('ki skill user add ki-example')

      expect(invalidResult.output).toContain('must declare ki-supported-runtimes as a non-empty flow list')
    })

    test('removes stale managed links from every configured agent after compatibility narrows', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.setupAgentHome('chatgpt-codex')
      await box.setupExampleHarness()
      await box.run('ki bootstrap')
      await box.run('ki skill user add ki-example')
      await box.data.write(
        'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [claude-code]\n---\n'
      )

      const removed = await box.run('ki skill user remove ki-example')

      expect(removed).toEqual({ exitCode: 0, output: 'ki skill user remove: unlinked ki-example for claude-code, chatgpt-codex\n' })
      await expect(lstat(join(box.home.path, '.claude', 'skills', 'ki-example'))).rejects.toThrow()
      await expect(lstat(join(box.home.path, '.agents', 'skills', 'ki-example'))).rejects.toThrow()
    })

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
    test('rejects missing, malformed, and unsupported repository runtime declarations before mutation', async () => {
      const run = async (configuration: string): Promise<{ readonly output: string; readonly declared: string }> => {
        const box = await sandbox()
        await box.setupAgentHome('claude-code')
        await box.setupExampleHarness()
        await box.project.write('.ki-config.toml', configuration)
        await box.run('ki bootstrap')
        const result = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)
        return { output: result.output, declared: await box.project.read('.ki-config.toml') }
      }

      const missing = await run('[other]\nvalue = true\n')
      const malformed = await run('["example/harness:ki-repo"]\nsupported_runtimes = []\n')
      const unsupported = await run('["example/harness:ki-repo"]\nsupported_runtimes = ["other"]\n')
      const repeated = await run('["example/harness:ki-repo"]\nsupported_runtimes = ["codex", "codex"]\n')
      const invalidToml = await run('[ki-repo\n')

      expect(missing.output).toContain('must declare the repository runtime set')
      expect(malformed.output).toContain('must be a non-empty array')
      expect(unsupported.output).toContain('may contain only claude-code or codex')
      expect(repeated.output).toContain('repeats a runtime')
      expect(invalidToml.output).toContain('.ki-config.toml must be valid TOML')
      expect(
        [missing, malformed, unsupported, repeated, invalidToml].every(
          (result) => !result.declared.includes('["example/harness:ki-example"]')
        )
      ).toBe(true)
    })

    test('intersects repository and skill runtimes before linking or declaring', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.setupAgentHome('chatgpt-codex')
      await box.setupExampleHarness()
      await box.data.write(
        'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [codex]\n---\n'
      )
      await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\nsupported_runtimes = ["codex"]\n')
      await box.run('ki bootstrap')

      const added = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)

      expect(added.output).toContain('for chatgpt-codex\n')
      expect(await box.project.isSymlink('.agents/skills/ki-example')).toBe(true)
      await expect(lstat(join(box.project.path, '.claude', 'skills', 'ki-example'))).rejects.toThrow()

      await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]\n')
      const refused = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)

      expect(refused).toEqual({
        exitCode: 1,
        output: "ki: error: skill ki-example is incompatible with this repository's configured agents\n"
      })
      expect(await box.project.isSymlink('.agents/skills/ki-example')).toBe(true)
      expect((await box.project.read('.ki-config.toml')).includes('["example/harness:ki-example"]')).toBe(false)
    })

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
      await writeFile(join(box.project.path, '.ki-config.toml'), '["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]\n')
      const projectRoot = await realpath(box.project.path)
      const link = join(projectRoot, '.claude', 'skills', 'ki-example')

      const added = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)
      const linkStat = await lstat(link)
      const configAfterAdd = await box.project.read('.ki-config.toml')
      expect(added).toEqual({ exitCode: 0, output: `ki skill repo add: linked ki-example into ${projectRoot} for claude-code\n` })
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(configAfterAdd).toContain('["example/harness:ki-example"]')

      const removed = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      const configAfterRemove = await box.project.read('.ki-config.toml')
      expect(removed).toEqual({ exitCode: 0, output: `ki skill repo remove: removed ki-example in ${projectRoot} for claude-code\n` })
      await expect(lstat(link)).rejects.toThrow()
      expect(configAfterRemove).not.toContain('["example/harness:ki-example"]')

      const repeated = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      expect(repeated).toEqual({
        exitCode: 0,
        output: `ki skill repo remove: no KI-managed link or declaration for ki-example in ${projectRoot} for claude-code\n`
      })
    })

    test('declares a repository skill when its configuration has no final newline', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]')

      const added = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)

      expect(added.exitCode).toBe(0)
      expect(await box.project.read('.ki-config.toml')).toBe(
        '["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]\n\n["example/harness:ki-example"]\n'
      )
    })

    test('refuses to remove a foreign repository skill directory', async () => {
      const box = await sandbox()
      await bootstrapClaudeCode(box)
      await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]\n')
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
      await box.project.write(
        '.ki-config.toml',
        '["example/harness:ki-example"]\nsetting = true\n\n["example/harness:ki-example".nested]\nvalue = 2\n\n["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]\n\n[other]\nvalue = 1'
      )

      const repeated = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)
      const removed = await box.run(`ki skill repo remove ki-example --repo ${box.project.path}`)
      const configuration = await box.project.read('.ki-config.toml')

      expect(repeated.exitCode).toBe(0)
      expect(removed.exitCode).toBe(0)
      expect(configuration).toBe('["example/harness:ki-repo"]\nsupported_runtimes = ["claude-code"]\n\n[other]\nvalue = 1')
    })

    test('rejects a non-table declared skill before preparing an educational catalogue', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '"example/harness:ki-example" = []\n')

      const result = await box.run(`ki repo educate --repo ${box.project.path}`)

      expect(result).toEqual({ exitCode: 1, output: 'ki: error: declared skill example/harness:ki-example must use a TOML table\n' })
    })

    test('rejects bare, malformed, and duplicate qualified repository declarations', async () => {
      const box = await sandbox()
      const run = async (configuration: string) => {
        await box.project.write('.ki-config.toml', configuration)
        return box.run(`ki repo educate --repo ${box.project.path}`)
      }

      const bare = await run('[ki-example]\n')
      const malformedProvider = await run('["invalid:ki-example"]\n')
      const malformedSkill = await run('["example/harness:not-a-skill"]\n')
      const repeatedSeparator = await run('["example/harness:ki-example:again"]\n')
      const duplicate = await run('["example/harness:ki-example"]\n["other/harness:ki-example"]\n')

      expect(bare.output).toContain('declared skill ki-example must use a qualified')
      expect(malformedProvider.output).toContain('declared skill invalid:ki-example must use a qualified')
      expect(malformedSkill.output).toContain('declared skill example/harness:not-a-skill must use a qualified')
      expect(repeatedSeparator.output).toContain('declared skill example/harness:ki-example:again must use a qualified')
      expect(duplicate.output).toContain('declared skill ki-example is repeated by multiple providers')
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
      await box.project.write(
        '.ki-config.toml',
        '["example/harness:ki-a"]\n["example/harness:ki-b"]\n["example/harness:ki-c"]\n["example/harness:ki-d"]\n'
      )

      const result = await box.run(`ki repo audit --repo ${box.project.path} --skill ki-a`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('example/harness:ki-d does not provide a rubric catalogue')
    })
  })
})
