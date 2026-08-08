import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// Builds a full direct `scripts/rubric/items/index.ts` catalogue. Most tests use a
// compact literal which this fixture expands into the real family/item contract;
// dedicated catalogue tests below exercise the unabridged shape.
const rubric = (families: string, skill = 'ki-example'): string =>
  `
const item = (value) => {
  if (!value || typeof value !== 'object') return value
  if (value.kind === 'mechanical') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Mechanical test criterion.',
    sources: value.sources ?? ['standard.md'],
    mechanical: {
      level: value.level,
      remediation: value.remediation ?? (value.conform === undefined ? { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' } : { class: 'automatic' }),
      audit: { phase: value.phase, run: value.audit },
      ...(value.conform === undefined ? {} : {
        conform: {
          phase: 'PRIMARY',
          run: async (context) => { context.propose(await value.conform(context)) }
        }
      })
    }
  }
  if (value.kind === 'judgment') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Judgment test criterion.',
    sources: value.sources ?? ['standard.md'],
    judgment: { scope: value.scope ?? 'Review the supplied evidence.', prompt: value.prompt, outcomes: value.outcomes ?? ['accepted'], guidance: value.guidance ?? 'Record the selected outcome.' }
  }
  return {
    ...value,
    description: value.description ?? 'Invalid test criterion.',
    sources: value.sources ?? ['standard.md']
  }
}
const family = (value) => !value || typeof value !== 'object' ? value : ({
  ...value,
  description: value.description ?? 'Test family.',
  standard: value.standard ?? 'standard.md',
  selectContext: value.selectContext ?? ((context) => context),
  items: Array.isArray(value.items) ? value.items.map(item) : value.items
})
const families = Array.isArray(${families}) ? (${families}).map(family) : ${families}
export default {
  contract: 1,
  name: '${skill}',
  concern: 'test governance',
  createSession: async ({ repository }) => {
    const proposals = []
    const context = { repository, propose: (proposal) => proposals.push(proposal) }
    return {
      subjects: [{ families: Array.isArray(families) ? families.map(({ code }) => code) : [], context: () => context }],
      proposal: () => proposals.length === 1 ? proposals[0] : ({
        writes: proposals.flatMap(({ writes = [] }) => writes),
        commands: proposals.flatMap(({ commands = [] }) => commands)
      })
    }
  },
  families
}
`
describe('[ki repo conform execution]', () => {
  test('refuses conflicting user-home writes proposed by separate skills', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n[skills.ki-extra]\n'
    )
    await box.home.write('.managed/setting.txt', 'before\n')
    const userHomeRubric = (skill: string, code: string, content: string): string =>
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: '${content}' }] })
        }] }]`,
        skill
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    await box.setupExampleHarness({ rubric: userHomeRubric('ki-example', 'EXAMPLE-1', 'first\\n') })
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/SKILL.md',
      '---\nname: ki-extra\nki-depends-on: []\n---\n'
    )
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts',
      userHomeRubric('ki-extra', 'EXTRA-1', 'second\\n')
    )

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform repeats write path .managed/setting.txt with different content')
    expect(await box.home.read('.managed/setting.txt')).toBe('before\n')
  })

  test('refuses a user-home write outside the declaring skill filesystem scope', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.home.write('.outside/setting.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.outside/setting.txt', content: 'after\\n' }] })
        }] }]`,
        'ki-example'
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'direct conform write path .outside/setting.txt is outside its declared filesystem scope'
    )
    expect(await box.home.read('.outside/setting.txt')).toBe('before\n')
  })

  test('refuses user-home conform commands before running them', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.home.write('.managed/setting.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'false', arguments: [] }] })
        }] }]`,
        'ki-example'
      ).replace(
        "concern: 'test governance',",
        "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'user-home rubric conform actions must be guarded direct writes; conform commands are not permitted'
    )
    expect(await box.home.read('.managed/setting.txt')).toBe('before\n')
  })

  test('refuses an explicit create target that already exists', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('created.txt', 'existing\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: 'created.txt', content: 'created\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform create target created.txt must not already exist')
    await expect(box.project.read('created.txt')).resolves.toBe('existing\n')
  })

  test('an unfixed violation (no conform function) blocks conform and is reported', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'not fixable' }]
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('× fail  [Example (EXAMPLE-1)] — not fixable')
    expect(result.output).toContain('repository conform found failures')
  })

  test('a conform proposing no writes leaves its violation reported and unfixed', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'nothing safe to propose' }],
            conform: async () => ({ writes: [] })
          }]
        }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('! warn  [Example (EXAMPLE-1)] — nothing safe to propose')
  })

  test('reports subprocess conforms in dry-run mode without executing them, then runs and re-audits them', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'NORMALISE',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/conformed.txt')
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "require('node:fs').writeFileSync('conformed.txt', 'ok')"] }] })
        }] }]`)
    })

    const dryRun = await box.run('ki repo conform --dry-run')
    const conformed = await box.run('ki repo conform')

    expect(dryRun.output).toContain(`would run "node" "-e" "require('node:fs').writeFileSync('conformed.txt', 'ok')"\n`)
    expect(conformed.output).toContain(`run "node" "-e" "require('node:fs').writeFileSync('conformed.txt', 'ok')"\n`)
    expect(conformed.output).toContain('↺ fixed [Example (EXAMPLE-1)] — conformed')
    await expect(box.project.read('conformed.txt')).resolves.toBe('ok')
  })

  test('reports a failed subprocess conform with its command output', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.stdout.write('detail'); process.exit(3)"] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'direct subprocess conform failed: "node" "-e" "process.stdout.write(\'detail\'); process.exit(3)"\ndetail'
    )
  })

  test('combines stdout and stderr from a failed subprocess conform', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      "\"process.stdout.write('out'); process.stderr.write('err'); process.exit(3)\"\nout\nerr"
    )
  })

  test('conforms INFO outcomes explicitly opted into conforming and retains a fixed subject', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    await box.setupExampleHarness({
      rubric: `
import { readFile } from 'node:fs/promises'

export default {
  contract: 1,
  name: 'ki-example',
  concern: 'INFO conforming',
  createSession: async ({ repository }) => ({
    subjects: [{ families: ['F'], subject: 'workspace', context: () => ({ repository }) }],
    proposal: () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
  }),
  families: [{
    code: 'F', title: 'Family', description: 'Test family.', standard: 'standard.md', selectContext: (context) => context,
    items: [
      {
        code: 'INFO-1', title: 'Info conform', description: 'Conforms an opted-in INFO result.', sources: ['standard.md'],
        mechanical: {
          level: 'WARN', conformOn: ['INFO'],
          remediation: { class: 'automatic' },
          audit: { phase: 'PRIMARY', run: async ({ repository }) =>
            (await readFile(repository + '/governed.txt', 'utf8')) === 'after\\n'
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'INFO', message: 'needs normalisation' }]
          },
          conform: { phase: 'PRIMARY', run: async () => {} }
        }
      },
      {
        code: 'SKIP-1', title: 'Skipped conform', description: 'Does not conform a non-violation.', sources: ['standard.md'],
        mechanical: {
          level: 'WARN',
          remediation: { class: 'diagnostic', guidance: 'No action is required.' },
          audit: { phase: 'PRIMARY', run: async () => [{ status: 'NOT_APPLICABLE', message: 'not applicable' }] },
        }
      }
    ]
  }]
}
`
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('↺ fixed [Info conform (INFO-1)] workspace — conformed')
    expect(await box.project.read('governed.txt')).toBe('after\n')
  })

  test('orders same-phase conform actions by their family declaration', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[
          { code: 'SECOND', title: 'Second', items: [{
            kind: 'mechanical', code: 'SECOND-1', title: 'Second item', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'second' }],
            conform: async () => ({ writes: [] })
          }] },
          { code: 'FIRST', title: 'First', items: [{
            kind: 'mechanical', code: 'FIRST-1', title: 'First item', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'first' }],
            conform: async () => ({ writes: [] })
          }] }
        ]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(0)
    expect(result.output.indexOf('[Second item (SECOND-1)]')).toBeLessThan(
      result.output.indexOf('[First item (FIRST-1)]')
    )
  })

  test('refuses an unsafe direct conform write before publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '../outside.txt', content: 'after\\n', create: true }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write path ../outside.txt is unsafe')
    await expect(box.root.read('outside.txt')).rejects.toThrow()
  })

  test('reports a failed silent subprocess conform without an empty detail line', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', 'process.exit(3)'] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╭─ KI REPO CONFORM')
    expect(result.output).toContain('proposed run "node" "-e" "process.exit(3)"\nrun "node" "-e" "process.exit(3)"')
    expect(result.output).toContain('ki: error: direct subprocess conform failed: "node" "-e" "process.exit(3)"')
  })

  test('reports a subprocess terminated by a signal as a failed conform', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.kill(process.pid, 'SIGTERM')"] }] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('╭─ KI REPO CONFORM')
    expect(result.output).toContain(
      'proposed run "node" "-e" "process.kill(process.pid, \'SIGTERM\')"\nrun "node" "-e" "process.kill(process.pid, \'SIGTERM\')"'
    )
    expect(result.output).toContain(
      'ki: error: direct subprocess conform failed: "node" "-e" "process.kill(process.pid, \'SIGTERM\')"'
    )
  })

  test('rejects a malformed subprocess conform proposal before execution', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{}] })
        }] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('rubric session proposal command 0 must have a program and arguments')
  })
})
