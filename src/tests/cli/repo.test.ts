import { lstat, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type SandboxArea, sandbox } from './_cli_helper.ts'

// Builds a full direct `scripts/rubric/items/index.ts` catalogue. Most tests use a
// compact literal which this fixture expands into the real family/item contract;
// dedicated catalogue tests below exercise the unabridged shape.
const rubric = (families: string, skill = 'ki-example'): string => `
const item = (value) => {
  if (!value || typeof value !== 'object') return value
  if (value.kind === 'mechanical') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Mechanical test criterion.',
    sources: value.sources ?? ['standard.md'],
    mechanical: {
      level: value.level,
      audit: { phase: value.phase, run: value.audit },
      ...(value.repair === undefined ? {} : { repair: { phase: 'PRIMARY', run: value.repair } })
    }
  }
  if (value.kind === 'judgment') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Judgment test criterion.',
    sources: value.sources ?? ['standard.md'],
    judgment: { prompt: value.prompt }
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
export default {
  contract: 1,
  name: '${skill}',
  concern: 'test governance',
  createContext: async ({ repository }) => ({ repository }),
  families: Array.isArray(${families}) ? (${families}).map(family) : ${families}
}
`

describe('[ki repo]', () => {
  describe('repo educate', () => {
    test('renders only the static catalogue for one declared skill', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(
          `[{\n          code: 'F', title: 'Family',\n          items: [\n            { kind: 'judgment', code: 'J-1', title: 'Judgment', prompt: 'Review the design.' },\n            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',\n              audit: async () => { throw new Error('educate must not execute items') } }\n          ]\n        }]`
        )
      })

      const result = await box.run('ki repo educate --skill ki-example')

      expect(result).toEqual({
        exitCode: 0,
        output:
          'example/harness:ki-example\n  Concern: test governance\n  Scope: repository\n  F: Family\n    Test family.\n    Standard: standard.md\n    J-1 [J]: Judgment\n      Judgment test criterion.\n      Sources: standard.md\n      Review: Review the design.\n    EXAMPLE-1 [M]: Example\n      Mechanical test criterion.\n      Sources: standard.md\n'
      })
    })

    test('reports when the repository declares no skills', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '# no skills\n')

      const result = await box.run('ki repo educate')

      expect(result).toEqual({ exitCode: 0, output: 'ki repo educate: no declared skills\n' })
    })
  })

  describe('repo audit', () => {
    test("runs only a declared skill's mechanical rubric items", async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'judgment', code: 'J-1', title: 'Judgment', prompt: 'never executed' },
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'INFO', message: 'ok' }] }
          ]
        }]`)
      })

      const result = await box.run('ki repo audit --skill ki-example')

      expect(result).toEqual({
        exitCode: 0,
        output: `
==> example/harness:ki-example:audit
  ℹ️  info  [Example (EXAMPLE-1)] — ok
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=1

==> recap
  ℹ️  info  example/harness:ki-example [Example (EXAMPLE-1)] — ok
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=1
`
      })
    })

    test('reports clean when no families declare items', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit')

      expect(result).toEqual({
        exitCode: 0,
        output: `ki repo audit: clean (1 skills)

==> recap
  ✅ no findings across audited skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('renders per-rubric progress with bounded three-column TTY status without changing non-interactive output', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n[ki-extra]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [
          { kind: 'mechanical', code: 'EXAMPLE-1', title: 'First', level: 'FAIL', phase: 'PRIMARY', audit: async () => [] },
          { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Second', level: 'FAIL', phase: 'DERIVED', audit: async () => [] }
        ] }]`)
      })
      await box.data.write('ki/harnesses/example/harness/skills/ki-extra/SKILL.md', '---\nname: ki-extra\nki-depends-on: []\n---\n')
      await box.data.write(
        'ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts',
        rubric(
          `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXTRA-1', title: 'Extra', level: 'FAIL', phase: 'PRIMARY', audit: async () => [] }] }]`,
          'ki-extra'
        )
      )
      const times = [0, 0, 1_250, 1_500]
      const now = (): number => times.shift() ?? 1_500

      const result = await box.run('ki repo audit', { interactive: true, now })
      const [progressOutput = '', standardOutput] = result.output.split('ki repo audit: clean (2 skills)\n')
      const frames = progressOutput
        .replace(/\n$/, '')
        .split('\r\x1b[2K')
        .filter(Boolean)
        .map((frame) => frame.replace('\n', ''))

      expect(result.exitCode).toBe(0)
      expect(standardOutput).toBe(`
==> recap
  ✅ no findings across audited skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`)
      expect(frames.map((frame) => frame.trimEnd())).toEqual([
        'AUDIT      [>...............................] 0.0s loading 0/2 definitions',
        'AUDIT      [>...............................] 1.3s loading 1/2 definitions',
        'AUDIT      [>...............................] 1.5s loading 2/2 definitions',
        'AUDIT      [................................] 0/3 0% starting',
        'AUDIT      [##########......................] 1/3 33% ki-example EXAMPLE-1',
        'AUDIT      [#####################...........] 2/3 67% ki-example EXAMPLE-2',
        'AUDIT      [################################] 3/3 100% ki-extra EXTRA-1',
        'AUDIT      [################################] 3/3 100% complete'
      ])
      expect(frames.every((frame) => frame.length === 80)).toBe(true)

      const wide = await box.run('ki repo audit', { interactive: true, columns: 240, now: () => 0 })
      const firstBar = wide.output.match(/\[(>[^\]]*)\]/)?.[1]
      expect(firstBar).toHaveLength(98)

      const nonInteractive = await box.run('ki repo audit')
      expect(nonInteractive).toEqual({
        exitCode: 0,
        output: `ki repo audit: clean (2 skills)

==> recap
  ✅ no findings across audited skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('rejects a repository configuration that is not valid TOML', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('.ki-config.toml must be valid TOML')
    })

    test('refuses a declared skill with no rubric definition module', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness()

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not provide a rubric catalogue')
    })

    test('fails when a FAIL-level item reports a violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('❌ fail  [Example (EXAMPLE-1)] — not conformed')
      expect(result.output).toContain('repository audit found failures')
    })

    test('appends the subject to a finding message when an outcome declares one', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'INFO', message: 'ok', subject: 'some/file.ts' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result).toEqual({
        exitCode: 0,
        output: `
==> example/harness:ki-example:audit
  ℹ️  info  [Example (EXAMPLE-1)] some/file.ts — ok
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0

==> recap
  ℹ️  info  example/harness:ki-example [Example (EXAMPLE-1)] some/file.ts — ok
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('executes a full direct catalogue with family context selection, hybrid judgment, and a declared level override', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'direct catalogue',
  createContext: ({ repository }) => ({ evidence: { repository } }),
  families: [{
    code: 'DIRECT',
    title: 'Direct family',
    description: 'Exercises the complete direct contract.',
    standard: 'standard.md#direct',
    selectContext: (root) => root.evidence,
    items: [{
      code: 'DIRECT-1',
      title: 'Hybrid evidence',
      description: 'Uses selected family evidence.',
      sources: ['standard.md#direct'],
      mechanical: {
        level: 'FAIL',
        overrideLevels: ['WARN'],
        heuristic: true,
        audit: {
          phase: 'INSPECT',
          run: ({ repository }) => [{ status: 'VIOLATION', level: 'WARN', message: repository }]
        }
      },
      judgment: { prompt: 'Review the evidence.' }
    }]
  }]
}
`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('⚠️  warn  [Hybrid evidence (DIRECT-1)]')
      expect(result.output).toContain('JUDGMENT_UNEVALUATED=1')
    })
  })

  describe('repo conform', () => {
    const governedItem = (level = 'FAIL') => `[{
      code: 'F', title: 'Family',
      items: [{
        kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: '${level}', phase: 'PRIMARY',
        audit: async ({ repository }) => {
          const { readFile } = await import('node:fs/promises')
          const content = await readFile(repository + '/governed.txt', 'utf8')
          return content === 'after\\n' ? [] : [{ status: 'VIOLATION', message: 'not conformed' }]
        },
        repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
      }]
    }]`

    test('reports nothing for an unrepairable item whose outcome is not a violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'PASS', message: 'already conformed' }] }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result).toEqual({
        exitCode: 0,
        output: `
==> recap
  ✅ no findings across conformed skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('publishes a complete repair write set, supports dry-run, and re-audits', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({ rubric: rubric(governedItem()) })

      const dryRun = await box.run('ki repo conform --dry-run')
      const beforeContent = await box.project.read('governed.txt')
      expect(dryRun.output).toContain('would write governed.txt\n')
      expect(dryRun.output).toContain('==> recap\n  ✅ no findings across conformed skills')
      expect(beforeContent).toBe('before\n')

      const conformed = await box.run('ki repo conform')
      const afterContent = await box.project.read('governed.txt')
      expect(conformed.output).toContain('write governed.txt\n')
      expect(conformed.output).toContain('✅ no findings across conformed skills')
      expect(afterContent).toBe('after\n')
    })

    test('deduplicates identical same-target repair proposals', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'one' }],
              repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'two' }],
              repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] }) }
          ]
        }]`)
      })

      const result = await box.run('ki repo conform --dry-run')

      expect(result.output).toContain('would write governed.txt\n')
      expect(result.output).toContain('==> recap')
      expect(await box.project.read('governed.txt')).toBe('before\n')
    })

    test('rejects same-target repair proposals with different replacement content', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'one' }],
              repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after-one\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'two' }],
              repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after-two\\n' }] }) }
          ]
        }]`)
      })

      const result = await box.run('ki repo conform --dry-run')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform repeats write path governed.txt with different content')
      expect(await box.project.read('governed.txt')).toBe('before\n')
    })

    // CLI-004 acceptance evidence (d): dry run is observational — repeating it changes
    // nothing (content or mtime) and produces byte-identical output each time; only the
    // real conform differs, in its `write` (not `would write`) line and its actual effect.
    test('a repeated dry run is byte-identical and touches nothing; only a real conform writes', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({ rubric: rubric(governedItem()) })
      const targetPath = join(box.project.path, 'governed.txt')
      const beforeStat = await lstat(targetPath)

      const firstDryRun = await box.run('ki repo conform --dry-run')
      const secondDryRun = await box.run('ki repo conform --dry-run')
      const afterDryRunsStat = await lstat(targetPath)

      expect(firstDryRun).toEqual(secondDryRun)
      expect(firstDryRun.output).toContain('would write governed.txt\n')
      expect(await box.project.read('governed.txt')).toBe('before\n')
      expect(afterDryRunsStat.mtimeMs).toBe(beforeStat.mtimeMs)
      expect(afterDryRunsStat.size).toBe(beforeStat.size)

      const conformed = await box.run('ki repo conform')

      expect(conformed.output).not.toBe(firstDryRun.output)
      expect(conformed.output).toContain('write governed.txt\n')
      expect(await box.project.read('governed.txt')).toBe('after\n')
    })

    // CLI-004 acceptance evidence (e): a write target replaced by a symlink before conform
    // runs (the CLI-reachable shape of "concurrent target replacement" — no live process
    // interleaving needed, since prepareWrites' regular-file check runs fresh every call)
    // is refused before any transaction write, leaving the symlink and its shadowed file
    // untouched.
    test('refuses to conform a repair write target that has become a symlink', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('elsewhere.txt', 'shadow\n')
      await symlink(join(box.project.path, 'elsewhere.txt'), join(box.project.path, 'governed.txt'))
      await box.setupExampleHarness({ rubric: rubric(governedItem()) })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target governed.txt must be an existing regular file')
      expect((await lstat(join(box.project.path, 'governed.txt'))).isSymbolicLink()).toBe(true)
      expect(await box.project.read('elsewhere.txt')).toBe('shadow\n')
    })

    // CLI-004 acceptance evidence (e): a write target that resolves, through a symlinked
    // parent directory, outside the repository root is refused even though its own lstat
    // looks like an ordinary regular file — the escape only shows up once the path is
    // fully resolved.
    test('refuses to conform a repair write target that escapes the repository through a symlinked directory', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.root.write('outside/target.txt', 'before\n')
      await symlink(join(box.root.path, 'outside'), join(box.project.path, 'escape'))
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
            repair: async () => ({ writes: [{ path: 'escape/target.txt', content: 'after\\n' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target escape/target.txt escapes the repository')
      expect(await box.root.read('outside/target.txt')).toBe('before\n')
    })

    // CLI-004 acceptance evidence (f): prepareWrites validates every write in the batch
    // before publishWrites touches any of them, so a second write's rejection leaves the
    // first write's — otherwise perfectly valid — target untouched. No mid-publication
    // failure is needed to prove this half of "rollback/recovery": nothing was ever
    // published in the first place.
    test('a later write failing validation blocks the whole batch, leaving an earlier valid write unpublished', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed-1.txt', 'before-1\n')
      await box.project.write('elsewhere.txt', 'shadow\n')
      await symlink(join(box.project.path, 'elsewhere.txt'), join(box.project.path, 'governed-2.txt'))
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'x' }],
              repair: async () => ({ writes: [{ path: 'governed-1.txt', content: 'after-1\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'y' }],
              repair: async () => ({ writes: [{ path: 'governed-2.txt', content: 'after-2\\n' }] }) }
          ]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target governed-2.txt must be an existing regular file')
      expect(await box.project.read('governed-1.txt')).toBe('before-1\n')
    })

    test('reports FIXED when a re-audited item that was violated is now clean', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async ({ repository }) => {
              const { readFile } = await import('node:fs/promises')
              const content = await readFile(repository + '/governed.txt', 'utf8')
              return content === 'after\\n' ? [{ status: 'PASS', message: 'conformed' }] : [{ status: 'VIOLATION', message: 'not conformed' }]
            },
            repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result).toEqual({
        exitCode: 0,
        output: `write governed.txt

==> example/harness:ki-example:conform
  ✅ fixed [Example (EXAMPLE-1)] — conformed
  ✅ summary: FAIL=0 WARN=0 FIXED=1 JUDGMENT_UNEVALUATED=0

==> recap
  ✅ fixed example/harness:ki-example [Example (EXAMPLE-1)] — conformed
  ✅ totals: FAIL=0 WARN=0 FIXED=1 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('fails when re-audit after conform still finds the violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'always fails' }],
            repair: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('❌ fail  [Example (EXAMPLE-1)] — always fails')
      expect(result.output).toContain('re-audit found failures')
    })

    test('rejects a repair write whose target does not exist as a regular file', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
            repair: async () => ({ writes: [{ path: 'missing.txt', content: 'x' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target missing.txt must be an existing regular file')
    })

    test('creates an explicitly declared new regular file transactionally', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          repair: async () => ({ writes: [{ path: 'created.txt', content: 'created\\n', create: true }] })
        }] }]`)
      })

      const dryRun = await box.run('ki repo conform --dry-run')
      expect(dryRun.output).toContain('would write created.txt\n')
      await expect(box.project.read('created.txt')).rejects.toThrow()

      const result = await box.run('ki repo conform')
      expect(result.output).toContain('write created.txt\n')
      expect(result.output).toContain('✅ fixed [Example (EXAMPLE-1)] — created')
      await expect(box.project.read('created.txt')).resolves.toBe('created\n')
    })

    test('refuses an explicit create target that already exists', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('created.txt', 'existing\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          repair: async () => ({ writes: [{ path: 'created.txt', content: 'created\\n', create: true }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform create target created.txt must not already exist')
      await expect(box.project.read('created.txt')).resolves.toBe('existing\n')
    })

    test('an unfixed violation (no repair function) blocks conform and is reported', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
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
      expect(result.output).toContain('❌ fail  [Example (EXAMPLE-1)] — not fixable')
      expect(result.output).toContain('repository conform found failures')
    })

    test('a repair proposing no writes leaves its violation reported and unfixed', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'nothing safe to propose' }],
            repair: async () => ({ writes: [] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('⚠️  warn  [Example (EXAMPLE-1)] — nothing safe to propose')
    })

    test('reports subprocess repairs in dry-run mode without executing them, then runs and re-audits them', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'NORMALISE',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/conformed.txt')
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          repair: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "require('node:fs').writeFileSync('conformed.txt', 'ok')"] }] })
        }] }]`)
      })

      const dryRun = await box.run('ki repo conform --dry-run')
      const conformed = await box.run('ki repo conform')

      expect(dryRun.output).toContain(`would run "node" "-e" "require('node:fs').writeFileSync('conformed.txt', 'ok')"\n`)
      expect(conformed.output).toContain(`run "node" "-e" "require('node:fs').writeFileSync('conformed.txt', 'ok')"\n`)
      expect(conformed.output).toContain('✅ fixed [Example (EXAMPLE-1)] — conformed')
      await expect(box.project.read('conformed.txt')).resolves.toBe('ok')
    })

    test('rejects a malformed subprocess repair proposal before execution', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          repair: async () => ({ writes: [], commands: [{}] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('repair command 0 must have a program and arguments')
    })
  })

  // CLI-004 acceptance evidence (c): a provider that was valid at install time but has
  // since been tampered with on disk — not a malformed payload from the start — is
  // refused at `ki repo audit` time, before any of its rubric items run. Both scenarios
  // reuse the same installed-payload integrity checks `ki harness info`/`list` exercise
  // (src/core/harness.ts enumeratePayloadFiles/frontmatter), proven here end-to-end
  // through the CLI surface CLI-004 names.
  describe('altered installed providers', () => {
    test('refuses a rubric module replaced by a symlink after install', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      const base = 'ki/harnesses/example/harness/skills/ki-example'
      await box.data.write(`${base}/scripts/rubric/notes.ts`, '// alternate target\n')
      const rubricModulePath = `${box.data.path}/${base}/scripts/rubric/items/index.ts`
      await rm(rubricModulePath)
      await symlink(`${box.data.path}/${base}/scripts/rubric/notes.ts`, rubricModulePath)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must not be a symlink')
    })

    test('refuses a skill whose SKILL.md frontmatter was broken after install', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', 'no frontmatter here\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must declare frontmatter')
    })
  })

  describe('malformed rubric definitions', () => {
    test('rejects a rubric module with no default export', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: '// missing default export\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue default export is not a table')
    })

    test('rejects an audit function returning non-array outcomes', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => ({ status: 'INFO' }) }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must return an outcomes array')
    })

    test('rejects a repair returning a non-array writes field', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            repair: async () => ({ writes: 'not an array' }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('repair must return a writes array')
    })

    test('rejects an audit outcome that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [null] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('audit outcome 0 must be a table')
    })

    test('rejects a repair write that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            repair: async () => ({ writes: [null] }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('repair write 0 must have string path and content')
    })

    test('rejects an audit outcome missing a status', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'invalid', message: 'x' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid status')
    })

    test('rejects an audit outcome missing a message', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'INFO' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must have a message')
    })

    test('rejects a rubric module whose native module fails to import', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: 'this is not valid javascript syntax {{{\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue could not be imported')
    })

    test('rejects a repair that does not return a writes table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            repair: async () => null }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('repair must return a table')
    })

    test('rejects a repair write entry with a non-string path or content', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            repair: async () => ({ writes: [{ path: 1, content: 'x' }] }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must have string path and content')
    })

    test('rejects a rubric item with an invalid level', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'CRITICAL', phase: 'PRIMARY',
            audit: async () => [] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid level')
    })

    test('rejects a rubric item with an invalid phase', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'NEVER',
            audit: async () => [] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid phase')
    })

    test('rejects a rubric item whose repair is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [], repair: 'not a function' }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('repair must have a run function')
    })

    test('rejects a rubric definition whose declared skill does not match the installed capability', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]', 'ki-other') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue name does not match the installed capability')
    })

    test('rejects an audit outcome with a non-string subject', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'INFO', message: 'x', subject: 7 }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid subject')
    })

    test('orders mechanical items across families by phase, then family, then item position', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      const item = (
        code: string,
        phase: string
      ) => `{ kind: 'mechanical', code: '${code}', title: '${code}', level: 'FAIL', phase: '${phase}',
        audit: async () => [{ status: 'INFO', message: '${code}' }] }`
      await box.setupExampleHarness({
        rubric: rubric(`[
          { code: 'FC', title: 'C', items: [${item('C1', 'INSPECT')}] },
          { code: 'FB', title: 'B', items: [${item('B1', 'PREPARE')}] },
          { code: 'FA', title: 'A', items: [${item('A1', 'PREPARE')}, ${item('A2', 'PREPARE')}] }
        ]`)
      })

      const result = await box.run('ki repo audit')

      const first = result.output.indexOf('[B1 (B1)] — B1')
      const second = result.output.indexOf('[A1 (A1)] — A1')
      const third = result.output.indexOf('[A2 (A2)] — A2')
      const fourth = result.output.indexOf('[C1 (C1)] — C1')
      expect([first, second, third, fourth].every((index) => index >= 0)).toBe(true)
      expect(first).toBeLessThan(second)
      expect(second).toBeLessThan(third)
      expect(third).toBeLessThan(fourth)
    })

    test('rejects a rubric item whose audit is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY', audit: 'not a function' }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('audit must have a run function')
    })

    test('rejects a rubric item that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', title: 'Family', items: [null] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item must be a table')
    })

    test('rejects a rubric item with no code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', title: 'Example' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item must have a code')
    })

    test('rejects a rubric item with no title', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item EXAMPLE-1 must have a title')
    })

    test('rejects a rubric definition that repeats an item code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'judgment', code: 'EXAMPLE-1', title: 'One', prompt: 'a' },
            { kind: 'judgment', code: 'EXAMPLE-1', title: 'Two', prompt: 'b' }
          ]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric repeats code EXAMPLE-1')
    })

    test('rejects a judgment item with no prompt', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'judgment', code: 'J-1', title: 'Judgment' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item J-1 judgment must have a prompt')
    })

    test('rejects a rubric item with neither aspect', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'unknown', code: 'X-1', title: 'X' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item X-1 must be mechanical, judgment, or both')
    })

    test('rejects a rubric family that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[null]') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family must be a table')
    })

    test('rejects a rubric family with no code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ title: 'Family', items: [] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family must have a code')
    })

    test('rejects a rubric family with no title', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', items: [] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family F must have a title')
    })

    test('rejects a rubric family whose items is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', title: 'Family', items: 'not an array' }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family F must have an items array')
    })

    test('rejects a rubric definition with an unsupported contract version', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 2, name: 'ki-example', concern: 'test', createContext: async () => ({}), families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue has an unsupported contract version')
    })

    test('rejects a rubric definition whose createContext is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, name: 'ki-example', concern: 'test', createContext: 'not a function', families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue must have a createContext function')
    })

    test('rejects a rubric definition whose families is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, name: 'ki-example', concern: 'test', createContext: async () => ({}), families: 'not an array' }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue must have a families array')
    })
  })

  describe('skill resolution', () => {
    const installSkillsHarness = async (
      data: SandboxArea,
      specs: readonly { readonly name: string; readonly deps: readonly string[] }[]
    ): Promise<void> => {
      for (const { name, deps } of specs) {
        const base = `ki/harnesses/example/harness/skills/${name}`
        const list = `[${deps.join(', ')}]`
        const skillMarkdown = `---
name: ${name}
ki-depends-on: ${list}
---
`
        await data.write(`${base}/SKILL.md`, skillMarkdown)
        await data.write(
          `${base}/scripts/rubric/items/index.ts`,
          rubric(
            `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'R-1', title: 'Order', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'INFO', message: '${name}' }] }] }]`,
            name
          )
        )
      }
    }

    test('audits declared skills in dependency order', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      const declarations = `[ki-feature]

[ki-foundation]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(0)
      expect(result.output.indexOf('==> example/harness:ki-foundation:audit')).toBeLessThan(
        result.output.indexOf('==> example/harness:ki-feature:audit')
      )
      expect(result.output).toContain('[Order (R-1)] — ki-foundation')
      expect(result.output).toContain('[Order (R-1)] — ki-feature')
    })

    test('refuses a declared skill whose dependency is undeclared', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await box.project.write('.ki-config.toml', '[ki-feature]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('requires declared dependency ki-foundation')
    })

    test('refuses a dependency cycle between declared skills', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-first', deps: ['ki-second'] },
        { name: 'ki-second', deps: ['ki-first'] }
      ])
      const declarations = `[ki-first]

[ki-second]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has a dependency cycle')
    })

    test('refuses --skill naming a skill not among the declared skills', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [{ name: 'ki-foundation', deps: [] }])
      await box.project.write('.ki-config.toml', '[ki-foundation]\n')

      const result = await box.run('ki repo audit --skill ki-nonexistent')

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--skill must name one declared resolved skill')
    })

    test('refuses a declared skill not available from any installed harness', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-missing]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('declared skill ki-missing is not available from an installed harness')
    })

    test('refuses an ambiguous declared skill provided by more than one installed harness', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [{ name: 'ki-shared', deps: [] }])
      const base = 'ki/harnesses/other/harness/skills/ki-shared'
      await box.data.write(`${base}/SKILL.md`, '---\nname: ki-shared\nki-depends-on: []\n---\n')
      await box.project.write('.ki-config.toml', '[ki-shared]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('declared skill ki-shared is ambiguous; qualify its harness before activation')
    })

    test('selecting one skill by --skill pulls in its declared dependency', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await box.project.write('.ki-config.toml', '[ki-feature]\n\n[ki-foundation]\n')

      const result = await box.run('ki repo audit --skill ki-feature')

      expect(result.exitCode).toBe(0)
      expect(result.output.indexOf('==> example/harness:ki-foundation:audit')).toBeLessThan(
        result.output.indexOf('==> example/harness:ki-feature:audit')
      )
    })
  })
})
