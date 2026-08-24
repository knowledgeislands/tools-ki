import { lstat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const declaration = (name = 'ki-self'): string => `[repo]\nharnesses = ["example/harness"]\n\n[skills.${name}]\n`

const rubric = (name = 'ki-self', publication = false, importSentinel?: string): string => `
${importSentinel ? `await Bun.write(${JSON.stringify(importSentinel)}, 'imported')` : ''}
export default {
  contract: 1,
  name: '${name}',
  concern: 'repository-local test governance',
  createSession: ({ publication }) => ({
    subjects: [{ families: ['SELF'], context: () => ({ publication }) }],
    proposal: () => ({ writes: [] })
  }),
  families: [{
    code: 'SELF',
    title: 'Repository local',
    description: 'Exercises repository-local governance.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'SELF-1',
      title: 'Local source',
      description: 'Reports from the canonical local source.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        remediation: ${publication ? "{ class: 'automatic' }" : "{ class: 'diagnostic', guidance: 'Inspect local source.' }"},
        audit: {
          phase: 'PRIMARY',
          run: (context) => [${
            publication
              ? "context.publication.state === 'in-sync' ? { status: 'PASS', message: 'publication in sync' } : { status: 'VIOLATION', message: 'publication out of sync' }"
              : "{ status: 'INFO', message: 'repository-local audit ran' }"
          }]
        }${publication ? ", conform: { phase: 'PRIMARY', run: (context) => context.publication.propose() }" : ''}
      }
    }]
  }]
}
`

describe('[ki repo] repository-local ki-self provider', () => {
  test('audits one explicitly declared physical canonical source', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration())
    await box.setupRepositoryLocalSkill({ rubric: rubric() })

    const result = await box.run('ki repo audit --skill ki-self --reporter-levels info')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('repository-local:ki-self')
  })

  test('conforms generated publication inside the selected repository and re-audits', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration())
    await box.setupRepositoryLocalSkill({ rubric: rubric('ki-self', true) })

    const result = await box.run('ki repo conform --skill ki-self')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('repository-local:ki-self FIXED')
    expect(await box.project.read('.agents/skills/ki-self/references/rubric.md')).toContain(
      '# Generated rubric — repository-local test governance'
    )
  })

  test('ignores an undeclared local source without importing it', async () => {
    const box = await sandbox()
    const sentinel = join(box.project.path, 'imported.txt')
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.setupRepositoryLocalSkill({ rubric: rubric('ki-self', false, sentinel) })

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('--skill must name one declared resolved skill')
    expect(await lstat(sentinel).catch(() => undefined)).toBeUndefined()
  })

  test('does not resolve a foreign repository-local skill name', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration('ki-other'))
    await box.setupRepositoryLocalSkill({
      source: '.agents/skills/ki-other',
      name: 'ki-other',
      rubric: rubric('ki-other')
    })

    const result = await box.run('ki repo audit --skill ki-other')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('declared skill ki-other is provided by no declared harness')
  })

  test('rejects a declared source with no catalogue', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration())
    await box.setupRepositoryLocalSkill()

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('repository-local skill ki-self does not provide rubric catalogue')
  })

  test('rejects a missing declared source', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration())

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('.agents/skills/ki-self/SKILL.md must be a regular file')
  })

  test('rejects a linked source before importing its catalogue', async () => {
    const box = await sandbox()
    const sentinel = join(box.project.path, 'imported.txt')
    await box.project.write('.ki-config.toml', declaration())
    await box.root.write('external-self/SKILL.md', '---\nname: ki-self\nki-depends-on: []\n---\n')
    await box.root.write('external-self/scripts/rubric/items/index.ts', rubric('ki-self', false, sentinel))
    await box.project.mkdir('.agents/skills')
    await symlink(join(box.root.path, 'external-self'), join(box.project.path, '.agents/skills/ki-self'))

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('repository-local skill source .agents/skills/ki-self must not be a symlink')
    expect(await lstat(sentinel).catch(() => undefined)).toBeUndefined()
  })

  test('rejects a canonical source that physically escapes through an ancestor link', async () => {
    const box = await sandbox()
    const sentinel = join(box.project.path, 'imported.txt')
    await box.project.write('.ki-config.toml', declaration())
    await box.root.write('external-agents/skills/ki-self/SKILL.md', '---\nname: ki-self\nki-depends-on: []\n---\n')
    await box.root.write(
      'external-agents/skills/ki-self/scripts/rubric/items/index.ts',
      rubric('ki-self', false, sentinel)
    )
    await symlink(join(box.root.path, 'external-agents'), join(box.project.path, '.agents'))

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('repository-local skill source .agents/skills/ki-self escapes its root')
    expect(await lstat(sentinel).catch(() => undefined)).toBeUndefined()
  })

  test('rejects a linked catalogue before importing it', async () => {
    const box = await sandbox()
    const sentinel = join(box.project.path, 'imported.txt')
    await box.project.write('.ki-config.toml', declaration())
    await box.setupRepositoryLocalSkill()
    await box.root.write('external-rubric.ts', rubric('ki-self', false, sentinel))
    await box.project.mkdir('.agents/skills/ki-self/scripts/rubric/items')
    await symlink(
      join(box.root.path, 'external-rubric.ts'),
      join(box.project.path, '.agents/skills/ki-self/scripts/rubric/items/index.ts')
    )

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('must not be a symlink')
    expect(await lstat(sentinel).catch(() => undefined)).toBeUndefined()
  })

  test('rejects a canonical directory whose skill names a foreign capability', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration())
    await box.setupRepositoryLocalSkill({ name: 'ki-other', rubric: rubric('ki-other') })

    const result = await box.run('ki repo audit --skill ki-self')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('must name ki-self')
  })

  test('leaves installed Harness resolution unchanged for every other skill', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', declaration('ki-example'))
    await box.setupExampleHarness({ rubric: rubric('ki-example') })

    const result = await box.run('ki repo audit --skill ki-example --reporter-levels info')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('example/harness:ki-example')
    expect(result.output).not.toContain('repository-local:')
  })

  test('diagnoses local provenance without inventing a projection and excludes it from repair and upgrade', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.setupExampleHarness({ name: 'ki-repo' })
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\nsupported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-self]\n'
    )
    await box.setupRepositoryLocalSkill({ rubric: rubric() })

    const diagnostic = await box.run('ki repo diag')
    const repair = await box.run('ki repo repair')
    await box.project.write('.ki-config.toml', declaration())
    const upgrade = await box.run('ki repo upgrade')

    expect(diagnostic.output).toContain('repository-local:ki-self: canonical repository source')
    expect(diagnostic.exitCode).toBe(0)
    expect(diagnostic.output).not.toContain('ki-self: projection is missing')
    expect(repair.exitCode).toBe(0)
    expect(repair.output).not.toContain('ki-self')
    expect(upgrade.exitCode).toBe(0)
    expect(upgrade.output).toContain('providers (0)')
  })
})
