// `ki repo audit --staged` and `--paths` narrow the verdict, never the evaluation: every
// finding is still rendered, and only a FAIL finding whose subject is a scoped path, a path
// under one, or a directory containing one makes the audit fail.

import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const DECLARATION = '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n'

// A catalogue whose one item reports the findings the caller lists, each as `[status, message,
// subject?, level?]`; a subject written as `<root>/…` is made absolute against the repository.
const rubric = (findings: string): string => `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'verdict scope',
  createSession: async ({ repository }) => ({
    subjects: [{ families: ['F'], context: () => ({ repository }) }],
    proposal: () => ({ writes: [] })
  }),
  families: [{
    code: 'F',
    title: 'Family',
    description: 'Reports configured findings.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'EXAMPLE-1',
      title: 'Example',
      description: 'Reports configured findings.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        overrideLevels: ['WARN'],
        remediation: { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' },
        audit: {
          phase: 'PRIMARY',
          run: ({ repository }) => (${findings}).map(([status, message, subject, level]) => ({
            status,
            message,
            ...(subject === undefined ? {} : { subject: subject.replace('<root>', repository) }),
            ...(level === undefined ? {} : { level })
          }))
        }
      }
    }]
  }]
}
`

const repository = async (box: Sandbox, findings: string): Promise<string> => {
  await box.project.write('.ki.toml', DECLARATION)
  await box.setupExampleHarness({ rubric: rubric(findings) })
  return realpath(box.project.path)
}

const gitRepository = async (box: Sandbox, findings: string): Promise<string> => {
  const root = await repository(box, findings)
  await box.project.git(['init', '-q'])
  await box.project.write('docs/index.md', '# docs\n')
  await box.project.write('docs/a.md', '# a\n')
  await box.project.write('notes/c.md', '# c\n')
  await box.project.git(['add', '.'])
  await box.project.git(['commit', '-q', '-m', 'baseline'])
  return root
}

describe('[ki repo audit verdict scope]', () => {
  test('scopes the verdict to staged paths and marks findings outside it', async () => {
    const box = await sandbox()
    await gitRepository(
      box,
      `[['VIOLATION', 'broken', 'docs/a.md'], ['VIOLATION', 'needs attention', 'notes/c.md', 'WARN']]`
    )
    await box.project.write('docs/b.md', '# b\n')
    await box.project.git(['add', 'docs/b.md'])

    const unrelated = await box.run('ki repo audit --staged', { runner: 'default' })

    expect(unrelated.exitCode).toBe(0)
    expect(unrelated.output).toContain('╰─ ⌖ verdict scoped to 1 staged path\n')
    expect(unrelated.output).toContain('× fail [Example (EXAMPLE-1)] docs/a.md (outside scope) — broken')
    expect(unrelated.output).toContain('! warn [Example (EXAMPLE-1)] notes/c.md (outside scope) — needs attention')
    expect(unrelated.output).toContain(
      '╰─ summary: KI REPO AUDIT on project PASS · SCOPE: 1 path FAIL=0 WARN=0 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=1 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n'
    )

    await box.project.write('docs/a.md', '# a changed\n')
    await box.project.git(['add', 'docs/a.md'])
    const caused = await box.run('ki repo audit --staged', { runner: 'default' })

    expect(caused.exitCode).toBe(1)
    expect(caused.output).toContain('╰─ ⌖ verdict scoped to 2 staged paths\n')
    expect(caused.output).toContain('× fail [Example (EXAMPLE-1)] docs/a.md — broken')
    expect(caused.output).toContain(
      '╰─ summary: KI REPO AUDIT on project FAIL · SCOPE: 2 paths FAIL=1 WARN=0 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=1'
    )
    expect(caused.output).toContain('repository audit found failures')
  })

  test('keeps a finding on a containing directory in scope when a staged deletion sits under it', async () => {
    const box = await sandbox()
    await gitRepository(box, `[['VIOLATION', 'index note missing', 'docs/']]`)

    const untouched = await box.run('ki repo audit --staged', { runner: 'default' })
    expect(untouched.exitCode).toBe(0)
    expect(untouched.output).toContain('╰─ ⌖ verdict scoped to 0 staged paths\n')
    expect(untouched.output).toContain('docs/ (outside scope) — index note missing')

    await box.project.git(['rm', '-q', 'docs/index.md'])
    const deleted = await box.run('ki repo audit --staged', { runner: 'default' })

    expect(deleted.exitCode).toBe(1)
    expect(deleted.output).toContain('× fail [Example (EXAMPLE-1)] docs/ — index note missing')
  })

  test('scopes the verdict to explicit paths, including everything under a named directory', async () => {
    const box = await sandbox()
    const root = await repository(
      box,
      `[['VIOLATION', 'deep', 'docs/sub/deep.md'], ['VIOLATION', 'elsewhere', 'notes/c.md'], ['VIOLATION', 'tree-wide']]`
    )

    const under = await box.run('ki repo audit --paths ./docs/')
    expect(under.exitCode).toBe(1)
    expect(under.output).toContain('╰─ ⌖ verdict scoped to 1 explicit path\n')
    expect(under.output).toContain('× fail [Example (EXAMPLE-1)] docs/sub/deep.md — deep')
    expect(under.output).toContain('× fail [Example (EXAMPLE-1)] notes/c.md (outside scope) — elsewhere')
    expect(under.output).toContain('× fail [Example (EXAMPLE-1)] (outside scope) — tree-wide')

    const absolute = await box.run(['ki', 'repo', 'audit', '--paths', `${root}/notes/c.md`, '--concise'])
    expect(absolute).toEqual({
      exitCode: 1,
      output:
        'summary: KI REPO AUDIT on project FAIL · SCOPE: 1 path FAIL=1 WARN=0 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=3 WARN=0 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\nki: error: repository audit found failures\n'
    })

    const unrelated = await box.run('ki repo audit --paths README.md docs/other.md --concise')
    expect(unrelated.exitCode).toBe(0)
    expect(unrelated.output).toBe(
      'summary: KI REPO AUDIT on project PASS · SCOPE: 2 paths FAIL=0 WARN=0 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=3 WARN=0 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n'
    )
  })

  test('attributes a finding by its subject within the repository only', async () => {
    const box = await sandbox()
    await repository(
      box,
      `[
        ['VIOLATION', 'absolute inside', '<root>/docs/a.md'],
        ['VIOLATION', 'absolute outside', '/elsewhere/docs/a.md'],
        ['VIOLATION', 'the root itself', '<root>'],
        ['VIOLATION', 'escapes', '../docs/a.md'],
        ['VIOLATION', 'warned', 'docs/a.md', 'WARN']
      ]`
    )

    const result = await box.run('ki repo audit --paths docs/a.md')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('docs/a.md — absolute inside')
    expect(result.output).toContain('/elsewhere/docs/a.md (outside scope) — absolute outside')
    expect(result.output).toContain(' (outside scope) — the root itself')
    expect(result.output).toContain('../docs/a.md (outside scope) — escapes')
    expect(result.output).toContain('! warn [Example (EXAMPLE-1)] docs/a.md — warned')
    expect(result.output).toContain(
      'FAIL · SCOPE: 1 path FAIL=1 WARN=1 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=4 WARN=1'
    )
  })

  test('reports a scoped warning verdict without failing', async () => {
    const box = await sandbox()
    await repository(
      box,
      `[['VIOLATION', 'needs attention', 'docs/a.md', 'WARN'], ['VIOLATION', 'broken', 'notes/c.md']]`
    )

    const result = await box.run('ki repo audit --paths docs --concise')

    expect(result).toEqual({
      exitCode: 0,
      output:
        'summary: KI REPO AUDIT on project WARN · SCOPE: 1 path FAIL=0 WARN=1 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=1 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n'
    })
  })

  test('combines staged and explicit paths into one distinct scope', async () => {
    const box = await sandbox()
    await gitRepository(box, `[['VIOLATION', 'broken', 'notes/c.md']]`)
    await box.project.write('docs/b.md', '# b\n')
    await box.project.git(['add', 'docs/b.md'])

    const result = await box.run('ki repo audit --staged --paths docs/b.md notes', { runner: 'default' })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╰─ ⌖ verdict scoped to 2 staged and explicit paths\n')
    expect(result.output).toContain('× fail [Example (EXAMPLE-1)] notes/c.md — broken')
  })

  test('refuses a path outside the repository and an unreadable index before auditing', async () => {
    const box = await sandbox()
    const root = await repository(box, `[['VIOLATION', 'broken', 'docs/a.md']]`)

    const escaping = await box.run('ki repo audit --paths docs/../../elsewhere.md')
    const absolute = await box.run(['ki', 'repo', 'audit', '--paths', `${root}/../elsewhere.md`])
    const rootItself = await box.run('ki repo audit --paths .')
    const noIndex = await box.run('ki repo audit --staged', { runner: 'default' })

    expect(escaping).toEqual({
      exitCode: 2,
      output: 'ki: error: --paths must name paths inside the repository: docs/../../elsewhere.md\n'
    })
    expect(absolute.exitCode).toBe(2)
    expect(absolute.output).toContain('--paths must name paths inside the repository:')
    expect(rootItself).toEqual({
      exitCode: 2,
      output: 'ki: error: --paths must name paths inside the repository: .\n'
    })
    expect(noIndex.exitCode).toBe(2)
    expect(noIndex.output).toMatch(/^ki: error: --staged requires a Git working tree with a readable index: /)
    expect(noIndex.output).not.toContain('KI REPO AUDIT')
  })

  test('keeps a local registration failure blocking under a scoped verdict', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({
      name: 'ki-repo',
      rubric: `
export default {
  contract: 1,
  name: 'ki-repo',
  concern: 'repository registration',
  createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }),
  families: []
}
`
    })
    await box.project.write(
      '.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\n'
    )
    await box.config.write('ki/config.toml', 'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n')

    const result = await box.run('ki repo audit --paths docs')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('[Local repository registration (REPO-REG-1)]')
    expect(result.output).toContain(
      'FAIL · SCOPE: 1 path FAIL=1 WARN=0 · PASS=2 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=0'
    )
  })

  test('recaps each scoped repository verdict beside its whole-tree counts', async () => {
    const box = await sandbox()
    await box.root.write('first/.ki.toml', DECLARATION)
    await box.root.write('second/.ki.toml', DECLARATION)
    await box.setupExampleHarness({
      rubric: rubric(`[['VIOLATION', 'broken', 'docs/a.md'], ['VIOLATION', 'elsewhere', 'notes/c.md']]`)
    })
    const first = await realpath(`${box.root.path}/first`)
    const second = await realpath(`${box.root.path}/second`)

    const result = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'audit', '--paths', 'notes'])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      `╭─ KI REPO AUDIT · MULTI-REPOSITORY SUMMARY\n│  ├─ × first SCOPE: 1 path FAIL=1 WARN=0 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=2 WARN=0 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n│  ╰─ × second SCOPE: 1 path FAIL=1 WARN=0 · PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=2 WARN=0 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n`
    )

    const clean = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'audit', '--paths', 'README.md'])

    expect(clean.exitCode).toBe(0)
    expect(clean.output).toContain('│  ├─ ✓ first SCOPE: 1 path FAIL=0 WARN=0 · PASS=0 WARN=0 FAIL=1')
  })

  test('leaves the unscoped audit unchanged', async () => {
    const box = await sandbox()
    await repository(box, `[['VIOLATION', 'broken', 'docs/a.md']]`)

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).not.toContain('verdict scoped')
    expect(result.output).not.toContain('outside scope')
    expect(result.output).not.toContain('SCOPE:')
    expect(result.output).toContain('× fail [Example (EXAMPLE-1)] docs/a.md — broken')
    expect(result.output).toContain(
      '╰─ summary: KI REPO AUDIT on project PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=0 · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n'
    )
  })
})
