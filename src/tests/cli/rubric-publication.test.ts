import { lstat, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const publicationRubric = `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'generated publication',
  createSession: async ({ repository, publication }) => {
    const context = { repository, publication }
    return {
      subjects: [{ families: ['PUBLICATION'], context: () => context }],
      proposal: () => ({ writes: [] })
    }
  },
  families: [{
    code: 'PUBLICATION',
    title: 'Publication',
    description: 'Generated rubric publication.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'EXAMPLE-PUB-1',
      title: 'Generated publication',
      description: 'The publication matches the canonical catalogue.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        audit: {
          phase: 'DERIVED',
          run: ({ publication }) => [publication.state === 'in-sync'
            ? { status: 'PASS', message: 'publication is in sync', subject: publication.target }
            : { status: 'VIOLATION', message: 'publication is ' + publication.state, subject: publication.target }]
        },
        conform: { phase: 'DERIVED', run: ({ publication }) => publication.propose() }
      }
    }]
  }]
}
`

const projectLinkedHarness = async (box: Awaited<ReturnType<typeof sandbox>>): Promise<void> => {
  await box.setupExampleHarness()
  await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
  await box.project.write('skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')
  await box.project.write('skills/ki-example/scripts/rubric/items/index.ts', publicationRubric)
  const installedSkills = join(box.data.path, 'ki/harnesses/example/harness/skills')
  await rm(installedSkills, { recursive: true, force: true })
  await symlink(join(box.project.path, 'skills'), installedSkills)
}

const auditProposalRubric = `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'generated publication',
  createSession: async ({ repository, publication }) => ({
    subjects: [{ families: ['PUBLICATION'], context: () => ({ repository, publication }) }],
    proposal: () => ({ writes: [] })
  }),
  families: [{
    code: 'PUBLICATION', title: 'Publication', description: 'Generated rubric publication.', standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'EXAMPLE-PUB-1', title: 'Generated publication', description: 'The publication matches the canonical catalogue.', sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        audit: { phase: 'DERIVED', run: ({ publication }) => { publication.propose(); return [] } }
      }
    }]
  }]
}
`

describe('[ki generated rubric publication]', () => {
  test.each([
    ['missing', undefined],
    ['stale', 'stale publication\n']
  ])('reports %s publication evidence through the rubric context', async (_, existing) => {
    const box = await sandbox()
    await projectLinkedHarness(box)
    if (existing !== undefined) await box.project.write('skills/ki-example/references/rubric.md', existing)

    const result = await box.run('ki repo audit --reporter-levels all')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(`publication is ${_}`)
    expect(result.output).toContain('references/rubric.md')
  })

  test('keeps dry-run publication proposals in memory, publishes incrementally, and is idempotent', async () => {
    const box = await sandbox()
    await projectLinkedHarness(box)
    const target = 'skills/ki-example/references/rubric.md'

    const dryRun = await box.run('ki repo conform --dry-run')
    expect(dryRun.exitCode).toBe(0)
    expect(dryRun.output).toContain(`would apply write ${target}`)
    await expect(box.project.read(target)).rejects.toThrow()

    const conformed = await box.run('ki repo conform')
    expect(conformed.exitCode).toBe(0)
    expect(conformed.output).toContain(`applied write ${target}`)
    expect(conformed.output).toContain('fixed [Generated publication (EXAMPLE-PUB-1)]')

    const clean = await box.run('ki repo audit --reporter-levels all')
    expect(clean.exitCode).toBe(0)
    expect(clean.output).toContain('publication is in sync')

    const repeated = await box.run('ki repo conform')
    expect(repeated.exitCode).toBe(0)
    expect(repeated.output).not.toContain(`write ${target}`)
  })

  test('refuses an unsafe publication target before a repository conform can publish', async () => {
    const box = await sandbox()
    await projectLinkedHarness(box)
    await box.root.write('outside-rubric.md', 'outside\n')
    await box.project.mkdir('skills/ki-example/references')
    await symlink(join(box.root.path, 'outside-rubric.md'), join(box.project.path, 'skills/ki-example/references/rubric.md'))

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('installed harness payload skills/ki-example/references/rubric.md must not be a symlink')
    expect(await box.root.read('outside-rubric.md')).toBe('outside\n')
  })

  test('refuses a publication request outside the repository publication scope', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: publicationRubric })
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('rubric publication is outside the repository publication scope')
  })

  test('refuses a publication request during audit', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: auditProposalRubric })
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')

    const audit = await box.run('ki repo audit')
    const conform = await box.run('ki repo conform')

    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain('rubric publication can be proposed only from a conform action')
    expect(conform.exitCode).toBe(1)
    expect(conform.output).toContain('rubric publication can be proposed only from a conform action')
  })

  test('refuses a directory where a generated publication file belongs', async () => {
    const box = await sandbox()
    await projectLinkedHarness(box)
    await box.project.mkdir('skills/ki-example/references/rubric.md')

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('rubric publication target must be a regular file')
  })

  test('propagates an unexpected publication metadata read failure', async () => {
    const box = await sandbox()
    await projectLinkedHarness(box)
    await box.project.write('skills/ki-example/references/rubric.md', 'stale publication\n')
    const suffix = '/skills/ki-example/references/rubric.md'
    const failingLstat = (async (path, options) => {
      if (String(path).endsWith(suffix)) throw Object.assign(new Error('publication lstat failure'), { code: 'EACCES' })
      return lstat(path, options)
    }) as typeof lstat
    box.setLstat(failingLstat)

    await expect(box.run('ki repo audit')).rejects.toThrow('publication lstat failure')
  })

  test('uses byte-identical publication bytes for standalone rendering and repository conform', async () => {
    const box = await sandbox()
    await projectLinkedHarness(box)
    const target = 'skills/ki-example/references/rubric.md'

    const standalone = await box.run('ki dev skill rubric ki-example --write')
    expect(standalone.exitCode).toBe(0)
    const rendered = await box.project.read(target)
    await box.project.write(target, 'stale publication\n')

    const conformed = await box.run('ki repo conform')

    expect(conformed.exitCode).toBe(0)
    expect(await box.project.read(target)).toBe(rendered)
  })
})
