import { lstat, readlink, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { runCommand, type Sandbox, sandbox } from '../_cli_helper.ts'

const BACKPACK = 'ki/backpacks/knowledgeislands/ki-agent-backpack'

// A catalogue whose one item reports the configuration keys its session received, so a test can
// see which keys reach a skill's own rubric. It reports them as a violation, since the audit
// renders the findings of a failing skill only.
const echoRubric = (name: string): string => `
export default {
  contract: 1,
  name: '${name}',
  concern: 'vendored-skill test governance',
  createSession: ({ configuration }) => ({
    subjects: [{ families: ['ECHO'], context: () => ({ configuration }) }],
    proposal: () => ({ writes: [] })
  }),
  families: [{
    code: 'ECHO',
    title: 'Echo',
    description: 'Reports the configuration keys it received.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'ECHO-1',
      title: 'Configuration keys',
      description: 'Reports the configuration keys it received.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        remediation: { class: 'diagnostic', guidance: 'None.' },
        audit: {
          phase: 'PRIMARY',
          run: (context) => [{ status: 'VIOLATION', message: '${name} keys: ' + (Object.keys(context.configuration).sort().join(',') || 'none') }]
        }
      }
    }]
  }]
}
`

const declaration = (meeting: string, extra = ''): string => `
[repo]
backpacks = ["knowledgeislands/ki-agent-backpack"]

[skills.ki-repo-project]

[skills.ki-repo]
repo_type = "project"
primary_shape = "ki-repo-project"
repository = "https://github.com/example/project"
title = "Example"
description = "Example repository."
repo_code = "EXAMPLE"
supported_runtimes = ["claude-code", "chatgpt-codex"]
visibility = "private"
${extra}
[skills.ki-meeting]
${meeting}
`

const SKILL = '---\nname: ki-meeting\nki-depends-on: []\n---\n'

/** A bootstrapped sandbox whose backpack provides ki-repo and ki-meeting, and whose project vendors ki-meeting. */
const prepared = async (meeting = 'mode = "vendored"', extra = ''): Promise<Sandbox> => {
  const box = await sandbox()
  await box.setupAgentHome('claude-code')
  await box.setupAgentHome('chatgpt-codex')
  await box.run('ki bootstrap')
  await box.setupExampleBackpack({ name: 'ki-repo', rubric: echoRubric('ki-repo') })
  await box.setupExampleBackpack({ name: 'ki-meeting', rubric: echoRubric('ki-meeting') })
  await box.project.write('.ki.toml', declaration(meeting, extra))
  await box.project.write('.agents/skills/ki-meeting/SKILL.md', SKILL)
  await box.project.mkdir('.claude/skills')
  await symlink('../../.agents/skills/ki-meeting', join(box.project.path, '.claude/skills/ki-meeting'))
  return box
}

/** Makes the installed backpack a Git checkout and returns the commit holding its current skills. */
const committedBackpack = async (box: Sandbox, format: 'sha1' | 'sha256' = 'sha1'): Promise<string> => {
  await box.data.git(['init', '-q', `--object-format=${format}`], BACKPACK)
  await box.data.git(['add', '-A'], BACKPACK)
  await box.data.git(['commit', '-q', '-m', 'backpack'], BACKPACK)
  box.setRunner(runCommand)
  return box.data.git(['rev-parse', 'HEAD'], BACKPACK)
}

/** Copies the backpack's ki-meeting into the project's vendored copy, file for file. */
const vendorFromBackpack = async (box: Sandbox): Promise<void> => {
  for (const file of ['SKILL.md', 'scripts/rubric/items/index.ts'])
    await box.project.write(
      `.agents/skills/ki-meeting/${file}`,
      await box.data.read(`${BACKPACK}/skills/ki-meeting/${file}`)
    )
}

describe('[ki repo] vendored skills', () => {
  test('a vendored skill is neither selected nor run by audit', async () => {
    const box = await prepared()

    const result = await box.run('ki repo audit --reporter-levels all')

    expect(result.output).toContain('knowledgeislands/ki-agent-backpack:ki-repo')
    expect(result.output).not.toContain('ki-agent-backpack:ki-meeting')
    expect(result.output).not.toContain('ki-meeting keys')
  })

  test('--skill naming a vendored skill is a usage error', async () => {
    const box = await prepared()

    const result = await box.run('ki repo audit --skill ki-meeting')

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('--skill ki-meeting names a vendored skill, which ki does not run')
  })

  test('mode = "current" behaves as no mode, and the skill never sees the host-owned key', async () => {
    const box = await prepared('mode = "current"\nchannel = "weekly"')

    const result = await box.run('ki repo audit --skill ki-meeting --reporter-levels all')

    expect(result.output).toContain('knowledgeislands/ki-agent-backpack:ki-meeting')
    expect(result.output).toContain('ki-meeting keys: channel')
  })

  test('a skill without mode keeps every key of its own table', async () => {
    const box = await prepared('channel = "weekly"\ncommit = "kept"')

    const result = await box.run('ki repo audit --skill ki-meeting --reporter-levels all')

    expect(result.output).toContain('ki-meeting keys: channel,commit')
  })

  test.each([
    ['mode = "vendor"', 'declared skill ki-meeting mode must be "current" or "vendored"'],
    ['mode = true', 'declared skill ki-meeting mode must be "current" or "vendored"'],
    [
      'mode = "vendored"\ncommit = "063b219"',
      'declared skill ki-meeting commit must be a full lower-case Git commit hash'
    ],
    ['mode = "vendored"\ncommit = 1', 'declared skill ki-meeting commit must be a full lower-case Git commit hash']
  ])('rejects %j', async (meeting, message) => {
    const box = await prepared(meeting)

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(message)
  })

  test('a vendored skill satisfies a declared skill that depends on it', async () => {
    const box = await prepared()
    await box.data.write(
      `${BACKPACK}/skills/ki-example/SKILL.md`,
      '---\nname: ki-example\nki-depends-on: [ki-meeting]\n---\n'
    )
    await box.data.write(`${BACKPACK}/skills/ki-example/scripts/rubric/items/index.ts`, echoRubric('ki-example'))
    await box.project.write('.ki.toml', declaration('mode = "vendored"', '\n[skills.ki-example]\n'))

    const result = await box.run('ki repo audit --skill ki-example --reporter-levels all')

    expect(result.output).toContain('ki-example keys: none')
    expect(result.output).not.toContain('requires declared dependency')
  })

  test('the repository-local ki-self cannot be vendored', async () => {
    const box = await prepared()
    await box.setupRepositoryLocalSkill()
    await box.project.write('.ki.toml', declaration('', '\n[skills.ki-self]\nmode = "vendored"\n'))

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('declared skill ki-self is repository-local and cannot be vendored')
  })

  test('repair leaves the committed copy and its link alone', async () => {
    const box = await prepared()

    const repair = await box.run('ki repo repair')

    expect(repair.output).toContain('i ki-meeting: vendored copy, left alone')
    expect(repair.output).not.toContain('ki-meeting: projection')
    expect(repair.output).toContain('result: healthy')
    expect((await lstat(join(box.project.path, '.agents/skills/ki-meeting'))).isDirectory()).toBe(true)
    expect(await readlink(join(box.project.path, '.claude/skills/ki-meeting'))).toBe('../../.agents/skills/ki-meeting')
    expect(await box.project.isSymlink('.agents/skills/ki-repo')).toBe(true)
  })

  test('repair never removes a vendored skill link as an orphan, even while it dangles', async () => {
    const box = await prepared()
    await rm(join(box.project.path, '.agents/skills/ki-meeting'), { recursive: true })

    const repair = await box.run('ki repo repair')

    expect(repair.output).not.toContain('undeclared projection is dangling')
    expect(await readlink(join(box.project.path, '.claude/skills/ki-meeting'))).toBe('../../.agents/skills/ki-meeting')
  })

  test('diag reports the vendored copy with its recorded commit', async () => {
    const box = await prepared(`mode = "vendored"\ncommit = "${'a'.repeat(40)}"`)

    const diag = await box.run('ki repo diag')

    expect(diag.output).toContain(`i ki-meeting: vendored copy from ${'a'.repeat(12)}, left alone`)
  })

  test('skill add and remove refuse a vendored skill', async () => {
    const box = await prepared()

    const add = await box.run('ki repo skill add ki-meeting')
    const remove = await box.run('ki repo skill remove ki-meeting')

    expect(add.exitCode).toBe(1)
    expect(add.output).toContain('skill ki-meeting is declared vendored; ki leaves its committed copy alone')
    expect(remove.exitCode).toBe(1)
    expect(remove.output).toContain('skill ki-meeting is declared vendored; remove its committed copy and declaration')
    expect(await box.project.read('.ki.toml')).toContain('[skills.ki-meeting]')
    expect(await readlink(join(box.project.path, '.claude/skills/ki-meeting'))).toBe('../../.agents/skills/ki-meeting')
  })

  describe('checking the copy against its recorded commit', () => {
    test('a matching copy is reported as information', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await vendorFromBackpack(box)

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain(
        `vendored ki-meeting matches knowledgeislands/ki-agent-backpack at ${commit.slice(0, 12)}`
      )
      expect(result.output).not.toContain('has drifted')
    })

    test('a drifted copy is a warning naming each changed, added and removed file', async () => {
      const box = await prepared()
      await box.data.write(`${BACKPACK}/skills/ki-meeting/references/standard.md`, '# Standard\n')
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await box.project.write('.agents/skills/ki-meeting/SKILL.md', `${SKILL}\nA local edit.\n`)
      await box.project.write('.agents/skills/ki-meeting/notes.md', 'Local notes.\n')

      const result = await box.run('ki repo audit')

      expect(result.output).toContain('! warn [Vendored skill copy (VENDORED-COPY)] .agents/skills/ki-meeting')
      expect(result.output).toContain(
        `vendored ki-meeting has drifted from knowledgeislands/ki-agent-backpack at ${commit.slice(0, 12)}: 1 changed (SKILL.md); 1 added (notes.md); 2 removed (references/standard.md, scripts/rubric/items/index.ts)`
      )
      // The warning is the owner's to resolve: audit changes nothing in the copy.
      expect(await box.project.read('.agents/skills/ki-meeting/notes.md')).toBe('Local notes.\n')
    })

    test('the copy is read as Git records it, so an ignored file is not drift', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await box.project.git(['init', '-q'])
      await vendorFromBackpack(box)
      await box.project.write('.gitignore', '.DS_Store\n')
      await box.project.write('.agents/skills/ki-meeting/.DS_Store', 'finder state')

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain('vendored ki-meeting matches')
    })

    test('a backpack that is not a Git checkout leaves the copy unverified, as information', async () => {
      const box = await prepared(`mode = "vendored"\ncommit = "${'b'.repeat(40)}"`)
      box.setRunner(runCommand)

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain(
        `i info [Vendored skill copy (VENDORED-COPY)] .agents/skills/ki-meeting — vendored ki-meeting cannot be checked against ${'b'.repeat(12)}: no declared backpack is a Git checkout holding that commit`
      )
      expect(result.output).not.toContain('! warn [Vendored skill copy')
    })

    test('a commit without the skill leaves the copy unverified', async () => {
      const box = await prepared()
      await rm(join(box.data.path, BACKPACK, 'skills/ki-meeting'), { recursive: true })
      const commit = await committedBackpack(box)
      await box.setupExampleBackpack({ name: 'ki-meeting' })
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain('knowledgeislands/ki-agent-backpack has no ki-meeting at that commit')
    })

    test('a SHA-256 backpack is checked in its own object format', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box, 'sha256')
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await vendorFromBackpack(box)

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(commit).toHaveLength(64)
      expect(result.output).toContain('vendored ki-meeting matches')
    })

    test('a runner that reports no separate stdout still yields the listing', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      box.setRunner(async (command, arguments_, environment, limits) => {
        const { stdout, ...result } = await runCommand(command, arguments_, environment, limits)
        return { ...result, output: stdout ?? '' }
      })
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await vendorFromBackpack(box)

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain('vendored ki-meeting matches')
    })

    test('a runner that cannot start Git leaves the copy unverified', async () => {
      const box = await prepared(`mode = "vendored"\ncommit = "${'c'.repeat(40)}"`)

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain('no declared backpack is a Git checkout holding that commit')
    })

    test('a skill kept in two places at the commit is read from its current source', async () => {
      const box = await prepared()
      await box.data.write(`${BACKPACK}/skills/retired/ki-meeting/SKILL.md`, 'An older copy.\n')
      const commit = await committedBackpack(box)
      await rm(join(box.data.path, BACKPACK, 'skills/retired'), { recursive: true })
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await vendorFromBackpack(box)

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain('vendored ki-meeting matches')
    })

    test('a long list of drifted files is cut short, and a linked file counts by its target', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await vendorFromBackpack(box)
      for (const name of ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])
        await box.project.write(`.agents/skills/ki-meeting/extra/${name}`, `${name}\n`)
      await symlink('extra/a.md', join(box.project.path, '.agents/skills/ki-meeting/linked.md'))

      const result = await box.run('ki repo audit')

      expect(result.output).toContain(
        ': 6 added (extra/a.md, extra/b.md, extra/c.md, extra/d.md, extra/e.md and 1 more); ki leaves the copy alone'
      )
    })

    test('a tracked file deleted from the copy is removed, and a nested repository is skipped', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await box.project.git(['init', '-q'])
      await vendorFromBackpack(box)
      await box.project.git(['add', '.agents/skills/ki-meeting'])
      await rm(join(box.project.path, '.agents/skills/ki-meeting/SKILL.md'))
      await box.project.git(['init', '-q'], '.agents/skills/ki-meeting/nested')

      const result = await box.run('ki repo audit')

      expect(result.output).toContain(': 1 removed (SKILL.md); ki leaves the copy alone')
    })

    test('a missing copy is unverified rather than drifted', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))
      await rm(join(box.project.path, '.agents/skills/ki-meeting'), { recursive: true })

      const result = await box.run('ki repo audit --reporter-levels all')

      expect(result.output).toContain('.agents/skills/ki-meeting is not a physical directory')
    })

    test('the check runs only alongside ki-repo', async () => {
      const box = await prepared()
      const commit = await committedBackpack(box)
      await box.project.write('.ki.toml', declaration(`mode = "vendored"\ncommit = "${commit}"`))

      const result = await box.run('ki repo audit --skill ki-repo-project --reporter-levels all')

      expect(result.output).not.toContain('VENDORED-COPY')
    })
  })
})
