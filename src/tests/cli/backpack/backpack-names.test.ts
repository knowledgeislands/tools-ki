import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { describe, expect, test } from 'vitest'
import { makeBackpackArchive } from '../_archive_helper.ts'
import { sandbox } from '../_cli_helper.ts'

// Backpack repositories were `*-agentic-harness` until 14 November 2026. For one release `ki`
// reads either spelling, reports the backpack spelling, and finds a slot still on disk under the
// retired one.
const retired = 'example/demo-agentic-harness'
const backpack = 'example/demo-agent-backpack'
const canonical = 'knowledgeislands/ki-agent-backpack'
const retiredCanonical = 'knowledgeislands/ki-agentic-harness'

const repositoryDeclaration = (identifier: string): string =>
  `[repo]\nbackpacks = ["${identifier}"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nsupported_runtimes = ["claude-code"]\n`

describe('[backpack names]', () => {
  describe('installed slots', () => {
    test('finds a backpack installed under its retired spelling by either name', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack({ identifier: retired })

      const listed = await box.run('ki backpack list')
      const byRetired = await box.run(`ki backpack info ${retired}`)
      const byBackpack = await box.run(`ki backpack info ${backpack}`)

      expect(listed.exitCode).toBe(0)
      expect(listed.output).toContain(`${backpack} (1)`)
      expect(listed.output).not.toContain(retired)
      expect(byRetired.exitCode).toBe(0)
      expect(byRetired.output).toContain(backpack)
      expect(byBackpack).toEqual(byRetired)
    })

    test('refuses a backpack installed under both spellings', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack({ identifier: retired })
      await box.setupExampleBackpack({ identifier: backpack })

      const listed = await box.run('ki backpack list')

      expect(listed.exitCode).toBe(1)
      expect(listed.output).toContain(
        `installed backpack ${backpack} is installed under both ${backpack} and ${retired}; remove one`
      )
    })

    test('reads a prefix still declared under the retired ki-repo-harness skill', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack({ identifier: backpack })
      await box.data.write(`ki/backpacks/${backpack}/.ki.toml`, '[skills.ki-repo-harness]\nprefix = "ki"\n')

      const inspected = await box.run(`ki backpack info ${backpack}`)

      expect(inspected.exitCode).toBe(0)
      expect(inspected.output).toContain('ki-example')
    })

    test('accepts the guild keys in skill front matter', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack({ identifier: backpack })
      await box.data.write(
        `ki/backpacks/${backpack}/skills/ki-example/SKILL.md`,
        '---\nname: ki-example\nki-guild: keystone\nki-leads: example\nki-depends-on: []\n---\n'
      )

      const inspected = await box.run(`ki backpack info ${backpack}`)

      expect(inspected.exitCode).toBe(0)
      expect(inspected.output).toContain('ki-example')
    })
  })

  describe('repository declarations', () => {
    test.each([
      [retiredCanonical, retiredCanonical],
      [canonical, retiredCanonical],
      [retiredCanonical, canonical]
    ])('resolves a declaration of %s against a slot spelt %s', async (declared, slot) => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.setupExampleBackpack({ name: 'ki-repo' })
      await box.setupExampleBackpack()
      await box.run('ki bootstrap')
      if (slot !== canonical)
        await rename(join(box.data.path, `ki/backpacks/${canonical}`), join(box.data.path, `ki/backpacks/${slot}`))
      await box.project.write('.ki.toml', repositoryDeclaration(declared))

      const added = await box.run(`ki repo --repo ${box.project.path} skill add ki-example`)

      expect(added.exitCode).toBe(0)
      expect(await box.project.read('.ki.toml')).toContain('[skills.ki-example]')
    })

    test('refuses a declaration that names one backpack under both spellings', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.setupExampleBackpack()
      await box.run('ki bootstrap')
      await box.project.write(
        '.ki.toml',
        repositoryDeclaration(canonical).replace(`["${canonical}"]`, `["${canonical}", "${retiredCanonical}"]`)
      )

      const added = await box.run(`ki repo --repo ${box.project.path} skill add ki-example`)

      expect(added.exitCode).toBe(1)
      expect(added.output).toContain('[repo] backpacks must not repeat a backpack')
    })
  })

  describe('user configuration', () => {
    test('reads the retired harness key with a deprecation warning', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.config.write(
        'ki/config.toml',
        `[agents]\nids = ["claude-code"]\n\n[backpacks]\nids = ["${retiredCanonical}"]\n\n[skills.ki-next]\nharness = "${retiredCanonical}"\n`
      )

      const diag = await box.run('ki diag --full')

      expect(diag.output).toContain('! skills.ki-next uses the retired key harness; rename it to backpack')
      expect(diag.output).toContain(canonical)
      expect(diag.output).not.toContain('× skills.ki-next')
    })

    test('refuses a skill table that declares both the backpack and the retired harness key', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[agents]\nids = []\n\n[backpacks]\nids = []\n\n[skills.ki-next]\nbackpack = "${canonical}"\nharness = "${canonical}"\n`
      )

      const diag = await box.run('ki diag --full')

      expect(diag.output).toContain('× skills.ki-next must declare backpack only; remove its retired harness key')
    })

    test('rewrites a retired harness key as backpack when bootstrap refreshes the configuration', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      const written = await box.config.read('ki/config.toml')
      await box.config.write('ki/config.toml', written.replaceAll('backpack = ', 'harness = '))

      const refreshed = await box.run('ki bootstrap --refresh')
      const rewritten = await box.config.read('ki/config.toml')
      const skills = (parse(rewritten) as { skills: Record<string, Record<string, unknown>> }).skills

      expect(refreshed.exitCode).toBe(0)
      expect(rewritten).not.toContain('harness = ')
      expect(Object.values(skills).every((skill) => skill['backpack'] === canonical)).toBe(true)
      expect(Object.keys(skills)).toContain('ki-next')
    })

    test('switches to a checkout remembered under the retired spelling', async () => {
      const box = await sandbox()
      const checkout = await box.setupLocalCanonicalBackpack(`dev/${canonical}`)
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.state.write('ki/locals.toml', `[locals."${retiredCanonical}"]\npath = ${JSON.stringify(checkout)}\n`)

      const on = await box.run(`ki dev local on ${retiredCanonical}`)

      expect(on.exitCode).toBe(0)
      expect(on.output).toContain(`development backpack enabled ${canonical}\t${checkout}`)
    })

    test('refuses a release that overrides the canonical backpack under its retired spelling', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "${retiredCanonical}", url = "https://releases.example.test/ki.tgz", sha256 = "${'a'.repeat(64)}" }]\n`
      )

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(`must not override the built-in canonical backpack ${canonical}`)
    })

    test('installs a private backpack whose codeload URL still names its retired repository', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        'source-revision/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      const url = `https://codeload.github.com/${retired}/tar.gz/0123456789abcdef`
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nids = []\nreleases = [{ id = "${retired}", url = "${url}", sha256 = "${sha256}", auth = "github-cli" }]\n`
      )
      box.setRunner(async () => ({ exitCode: 0, output: 'test-token\n' }))
      box.setFetcher(async (input) => {
        expect(input).toBe(url)
        return new Response(payload)
      })

      const result = await box.run(`ki backpack install ${retired}`)
      const recorded = parse(await box.config.read('ki/config.toml')) as { backpacks: { ids: string[] } }

      expect(result).toEqual({ exitCode: 0, output: `installed ${backpack}\tarchive ${sha256}\n` })
      expect(await box.data.isSymlink(`ki/backpacks/${backpack}`)).toBe(false)
      expect((await box.run(`ki backpack info ${backpack}`)).exitCode).toBe(0)
      expect(recorded.backpacks.ids).toEqual([backpack])
    })
  })

  describe('canonical bootstrap skills', () => {
    test('links the Keystone and Work leads when the canonical backpack offers them', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      for (const [group, skill] of [
        ['keystone', 'ki-keystone'],
        ['work', 'ki-work']
      ] as const)
        await box.data.write(
          `ki/backpacks/${canonical}/skills/${group}/${skill}/SKILL.md`,
          `---\nname: ${skill}\nki-guild: keystone\nki-leads: ${skill.slice(3)}\nki-depends-on: []\n---\n`
        )

      const bootstrapped = await box.run('ki bootstrap')

      expect(bootstrapped.exitCode).toBe(0)
      expect(bootstrapped.output).toContain('ki-keystone for claude-code installed')
      expect(bootstrapped.output).toContain('ki-work for claude-code installed')
      expect(bootstrapped.output).not.toContain('ki-next for claude-code')
      expect(await box.home.isSymlink('.claude/skills/ki-keystone')).toBe(true)
    })

    test('keeps the retired bootstrap skills of a canonical backpack still installed under its retired spelling', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await rename(
        join(box.data.path, `ki/backpacks/${canonical}`),
        join(box.data.path, `ki/backpacks/${retiredCanonical}`)
      )

      const bootstrapped = await box.run('ki bootstrap')
      const configured = await box.config.read('ki/config.toml')

      expect(bootstrapped.exitCode).toBe(0)
      expect(bootstrapped.output).toContain('ki-bootstrap for claude-code installed')
      expect(bootstrapped.output).toContain('ki-next for claude-code installed')
      expect(configured).toContain(`[skills.ki-next]\nbackpack = "${canonical}"`)
      expect(await box.data.isSymlink(`ki/backpacks/${canonical}`).catch(() => 'absent')).toBe('absent')
    })
  })
})
