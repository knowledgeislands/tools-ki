import { lstat, realpath, rm, symlink } from 'node:fs/promises'
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

const projectRoot = (area: SandboxArea): Promise<string> => realpath(area.path)

const rubricWithSession = (session: string): string => `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'session validation',
  createSession: () => (${session}),
  families: [{
    code: 'F',
    title: 'Family',
    description: 'Test family.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: []
  }]
}
`

const setupPrefixCollisionHarness = async (data: SandboxArea): Promise<void> => {
  for (const { name, code, marker } of [
    { name: 'ki-website', code: 'WEB-1', marker: 'website.txt' },
    { name: 'ki-website-cloudflare', code: 'WCF-1', marker: 'cloudflare.txt' }
  ]) {
    const base = `ki/harnesses/example/harness/skills/${name}`
    await data.write(`${base}/SKILL.md`, `---\nname: ${name}\nki-depends-on: []\n---\n`)
    await data.write(
      `${base}/scripts/rubric/items/index.ts`,
      rubric(
        `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: '${name}', level: 'WARN', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/${marker}')
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          conform: async () => ({ writes: [{ path: '${marker}', content: '${name}\\n', create: true }] })
        }] }]`,
        name
      )
    )
  }
}

describe('[ki repo]', () => {
  describe('repo educate', () => {
    test('renders only the static catalogue for one declared skill', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('renders an explicitly declared repository scope', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric('[]').replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'repository' },")
      })

      const result = await box.run('ki repo educate')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('  Scope: repository\n')
    })

    test('renders user-home scope and a heuristic hybrid item in the static catalogue', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          code: 'HYBRID-1', title: 'Heuristic hybrid',
          mechanical: { level: 'WARN', heuristic: true, audit: { phase: 'PRIMARY', run: async () => [] } },
          judgment: { prompt: 'Review the result.' }
        }] }]`).replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
      })

      const result = await box.run('ki repo educate')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('  Scope: user home (.managed)\n')
      expect(result.output).toContain('HYBRID-1 [M-heuristic + J]: Heuristic hybrid')
    })
  })

  describe('repo audit', () => {
    test('requires a resolved KI repository', async () => {
      const box = await sandbox()

      const result = await box.run('ki repo audit')

      expect(result).toEqual({ exitCode: 2, output: 'ki: error: no KI repository found from the current working directory\n' })
    })

    test("runs only a declared skill's mechanical rubric items", async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

      const result = await box.run('ki repo audit --skill ki-example --reporter-levels info')

      expect(result).toEqual({
        exitCode: 0,
        output: `
==> ${await projectRoot(box.project)} [example/harness:ki-example] audit
  ℹ️  info  [Example (EXAMPLE-1)] — ok
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=1
  ✅ pass  complete

==> recap
  ℹ️  info  example/harness:ki-example [Example (EXAMPLE-1)] — ok
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=1
`
      })
    })

    test('filters complete outcome levels by default and renders every level on request', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [
          { kind: 'mechanical', code: 'PASS-1', title: 'Pass', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'PASS', message: 'pass evidence' }] },
          { kind: 'mechanical', code: 'NA-1', title: 'Not applicable', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'NOT_APPLICABLE', message: 'not applicable evidence' }] },
          { kind: 'mechanical', code: 'INFO-1', title: 'Info', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'INFO', message: 'info evidence' }] },
          { kind: 'mechanical', code: 'WARN-1', title: 'Warn', level: 'WARN', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'warn evidence' }] },
          { kind: 'mechanical', code: 'FAIL-1', title: 'Fail', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'VIOLATION', message: 'fail evidence' }] }
        ] }]`)
      })

      const defaults = await box.run('ki repo audit')
      const all = await box.run('ki repo audit --reporter-levels all')
      const warnings = await box.run('ki repo audit --reporter-levels wArN')

      expect(defaults.exitCode).toBe(1)
      expect(defaults.output).toContain('warn evidence')
      expect(defaults.output).toContain('fail evidence')
      expect(defaults.output).not.toContain('pass evidence')
      expect(defaults.output).not.toContain('not applicable evidence')
      expect(defaults.output).not.toContain('info evidence')
      expect(all.output).toContain('✅ pass')
      expect(all.output).toContain('🚫 na')
      expect(all.output).toContain('ℹ️  info')
      expect(all.output).toContain('⚠️  warn')
      expect(all.output).toContain('❌ fail')
      expect(warnings.output).toContain('warn evidence')
      expect(warnings.output).not.toContain('fail evidence')
      expect(warnings.output).toContain('FAIL=1 WARN=1')
    })

    test('exposes and validates repository-operation output controls', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const help = await box.run('ki repo audit --help')
      const never = await box.run('ki repo audit --progress never', { interactive: true, now: () => 0 })
      const always = await box.run('ki repo audit --progress always', { now: () => 0 })
      const multi = await box.run('ki repo audit --progress always --progress-style multi', { now: () => 0 })
      const multiInteractive = await box.run('ki repo audit --progress-style multi', { interactive: true, now: () => 0 })
      const invalidProgress = await box.run('ki repo audit --progress later')
      const invalidStyle = await box.run('ki repo audit --progress-style rows')
      const invalidLevels = await box.run('ki repo audit --reporter-levels nope')

      expect(help.output).toContain('--progress <mode>')
      expect(help.output).toContain('--progress-style <style>')
      expect(help.output).toContain('--reporter-levels <levels>')
      expect(never.output).not.toContain('\r\x1b[2K')
      expect(always.output).toContain('AUDIT')
      expect(always.output).not.toContain('\r\x1b[2K')
      expect(multi.output).toContain('[ki-example]')
      expect(multiInteractive.output).toContain('\x1b[1A')
      expect(invalidProgress).toMatchObject({ exitCode: 2 })
      expect(invalidProgress.output).toContain('--progress accepts auto, always, or never')
      expect(invalidStyle).toMatchObject({ exitCode: 2 })
      expect(invalidStyle.output).toContain('--progress-style accepts single or multi')
      expect(invalidLevels).toMatchObject({ exitCode: 2 })
      expect(invalidLevels.output).toContain('--reporter-levels accepts FAIL, WARN, FIXED, INFO, NOT_APPLICABLE, PASS, or all')
    })

    test('selects an exact capability when another declared skill extends its name', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-website"]\n["example/harness:ki-website-cloudflare"]\n')
      await setupPrefixCollisionHarness(box.data)

      const result = await box.run(`ki repo audit --repo ${box.project.path} --skill ki-website`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain(`==> ${await projectRoot(box.project)} [example/harness:ki-website] audit`)
      expect(result.output).not.toContain('ki-website-cloudflare')
    })

    test('reports clean when no families declare items', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit')

      expect(result).toEqual({
        exitCode: 0,
        output: `ki repo audit: clean (1 skills)

==> ${await projectRoot(box.project)} [example/harness:ki-example] audit
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> recap
  ✅ no findings across audited skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('reports an interactive zero-item audit as complete', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit', { interactive: true, now: () => 0 })

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('AUDIT      [################################] 0/0 100% starting')
      expect(result.output).toContain('AUDIT      [################################] 0/0 100% complete')
    })

    test('uses the fallback progress width when a TTY reports an invalid column count', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit', { interactive: true, columns: Number.NaN, now: () => 0 })

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('AUDIT      [################################] 0/0 100% complete')
    })

    test('renders per-rubric progress with bounded three-column TTY status without changing non-interactive output', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n["example/harness:ki-extra"]\n')
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
==> ${await projectRoot(box.project)} [example/harness:ki-example] audit
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> ${await projectRoot(box.project)} [example/harness:ki-extra] audit
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

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

      const multi = await box.run('ki repo audit --progress-style multi', { interactive: true, now: () => 0 })
      expect(multi.output).toContain('[ki-example] EXAMPLE-1')
      expect(multi.output).toContain('[ki-extra] EXTRA-1')

      const nonInteractive = await box.run('ki repo audit')
      expect(nonInteractive).toEqual({
        exitCode: 0,
        output: `ki repo audit: clean (2 skills)

==> ${await projectRoot(box.project)} [example/harness:ki-example] audit
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> ${await projectRoot(box.project)} [example/harness:ki-extra] audit
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> recap
  ✅ no findings across audited skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test.each([
      [Number.MIN_VALUE, ''],
      [1, '.'],
      [3, '...'],
      [8, '0.0s ...']
    ])('renders a safe abbreviated TTY progress frame at %p columns', async (columns, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY', audit: async () => []
        }] }]`)
      })

      const result = await box.run('ki repo audit', { interactive: true, columns, now: () => 0 })
      const frames = result.output
        .split('\r\x1b[2K')
        .slice(1)
        .map((frame) => frame.replace('\n', ''))

      expect(result.exitCode).toBe(0)
      expect(frames[0]).toBe(expected)
    })

    test('finishes an interactive progress line when loading a malformed provider fails', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: 'this is not valid javascript syntax {{{\n' })

      const result = await box.run('ki repo audit', { interactive: true, now: () => 0 })
      const forcedSingle = await box.run('ki repo audit --progress always', { now: () => 0 })
      const multi = await box.run('ki repo audit --progress always --progress-style multi', { now: () => 0 })

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('\r\x1b[2K')
      expect(result.output).toContain('\nki: error: example/harness:ki-example rubric catalogue could not be imported')
      expect(forcedSingle.exitCode).toBe(1)
      expect(multi.exitCode).toBe(1)
      expect(multi.output).toContain('[ki-example] failed')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness()

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not provide a rubric catalogue')
    })

    test('fails when a FAIL-level item reports a violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'INFO', message: 'ok', subject: 'some/file.ts' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit --reporter-levels info')

      expect(result).toEqual({
        exitCode: 0,
        output: `
==> ${await projectRoot(box.project)} [example/harness:ki-example] audit
  ℹ️  info  [Example (EXAMPLE-1)] some/file.ts — ok
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> recap
  ℹ️  info  example/harness:ki-example [Example (EXAMPLE-1)] some/file.ts — ok
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('inherits a rubric-session subject when an outcome leaves it unspecified', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'INFO', message: 'ok' }]
        }] }]`).replace(
          'subjects: [{ families: Array.isArray(families) ? families.map(({ code }) => code) : [], context: () => context }]',
          "subjects: [{ families: Array.isArray(families) ? families.map(({ code }) => code) : [], context: () => context, subject: 'workspace' }]"
        )
      })

      const result = await box.run('ki repo audit --reporter-levels info')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[Example (EXAMPLE-1)] workspace — ok')
    })

    test('executes a full direct catalogue with family context selection, hybrid judgment, and a declared level override', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'direct catalogue',
  createSession: ({ repository }) => {
    const context = { evidence: { repository } }
    return {
      subjects: [{ families: ['DIRECT'], context: () => context }],
      proposal: () => ({ writes: [] })
    }
  },
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
    test('documents the shared output controls', async () => {
      const box = await sandbox()

      const result = await box.run('ki repo conform --help')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('--progress <mode>')
      expect(result.output).toContain('--progress-style <style>')
      expect(result.output).toContain('--reporter-levels <levels>')
      expect(result.output).toContain('FAIL,WARN,FIXED')
    })

    test('selects an exact capability when another conforming skill extends its name', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-website"]\n["example/harness:ki-website-cloudflare"]\n')
      await setupPrefixCollisionHarness(box.data)

      const result = await box.run(`ki repo conform --repo ${box.project.path} --skill ki-website`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('write website.txt')
      expect(result.output).not.toContain('cloudflare.txt')
      await expect(box.project.read('website.txt')).resolves.toBe('ki-website\n')
      await expect(box.project.read('cloudflare.txt')).rejects.toThrow()
    })

    const governedItem = (level = 'FAIL') => `[{
      code: 'F', title: 'Family',
      items: [{
        kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: '${level}', phase: 'PRIMARY',
        audit: async ({ repository }) => {
          const { readFile } = await import('node:fs/promises')
          const content = await readFile(repository + '/governed.txt', 'utf8')
          return content === 'after\\n' ? [] : [{ status: 'VIOLATION', message: 'not conformed' }]
        },
        conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
      }]
    }]`

    test('reports nothing for an unconformable item whose outcome is not a violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
==> ${await projectRoot(box.project)} [example/harness:ki-example] conform
  ✅ summary: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
  ✅ pass  complete

==> recap
  ✅ no FAIL / WARN / FIXED findings across conformed skills
  ✅ totals: FAIL=0 WARN=0 FIXED=0 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('publishes a complete conform write set, supports dry-run, and re-audits', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('deduplicates identical same-target conform proposals', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'one' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'two' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] }) }
          ]
        }]`)
      })

      const result = await box.run('ki repo conform --dry-run')

      expect(result.output).toContain('would write governed.txt\n')
      expect(result.output).toContain('==> recap')
      expect(await box.project.read('governed.txt')).toBe('before\n')
    })

    test('applies ordered item conforms to one shared draft and publishes one final write', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.write('governed.txt', 'start\n')
      await box.setupExampleHarness({
        rubric: `
import { readFileSync } from 'node:fs'
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'ordered conform',
  createSession: ({ repository }) => {
    const original = readFileSync(repository + '/governed.txt', 'utf8')
    let draft = original
    const context = {
      read: () => draft,
      append: (line) => { draft += line }
    }
    return {
      subjects: [{ families: ['ORDER'], context: () => context }],
      proposal: () => ({ writes: draft === original ? [] : [{ path: 'governed.txt', content: draft }] })
    }
  },
  families: [{
    code: 'ORDER',
    title: 'Ordered changes',
    description: 'Several rules share one draft.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'ORDER-1',
      title: 'Primary line',
      description: 'Adds the primary line.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        audit: {
          phase: 'INSPECT',
          run: ({ read }) => read().includes('primary\\n')
            ? [{ status: 'PASS', message: 'primary line is present' }]
            : [{ status: 'VIOLATION', message: 'primary line is absent' }]
        },
        conform: { phase: 'PRIMARY', run: ({ append }) => { append('primary\\n') } }
      }
    }, {
      code: 'ORDER-2',
      title: 'Normalised line',
      description: 'Adds the final line.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        audit: {
          phase: 'INSPECT',
          run: ({ read }) => read().includes('normalised\\n')
            ? [{ status: 'PASS', message: 'normalised line is present' }]
            : [{ status: 'VIOLATION', message: 'normalised line is absent' }]
        },
        conform: { phase: 'NORMALISE', run: ({ append }) => { append('normalised\\n') } }
      }
    }]
  }]
}
`
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(0)
      expect(result.output.match(/^write governed\.txt$/gm)).toHaveLength(1)
      expect(await box.project.read('governed.txt')).toBe('start\nprimary\nnormalised\n')
    })

    test('rejects same-target conform proposals with different replacement content', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'one' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after-one\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'two' }],
              conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after-two\\n' }] }) }
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    // is refused before any guarded write, leaving the symlink and its shadowed file
    // untouched.
    test('refuses to conform a conform write target that has become a symlink', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
    test('refuses to conform a conform write target that escapes the repository through a symlinked directory', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.root.write('outside/target.txt', 'before\n')
      await symlink(join(box.root.path, 'outside'), join(box.project.path, 'escape'))
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
            conform: async () => ({ writes: [{ path: 'escape/target.txt', content: 'after\\n' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target escape/target.txt escapes the repository')
      expect(await box.root.read('outside/target.txt')).toBe('before\n')
    })

    test('retains an earlier successful write when a later target is unsafe', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.write('governed-1.txt', 'before-1\n')
      await box.project.write('elsewhere.txt', 'shadow\n')
      await symlink(join(box.project.path, 'elsewhere.txt'), join(box.project.path, 'governed-2.txt'))
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'mechanical', code: 'EXAMPLE-1', title: 'One', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'x' }],
              conform: async () => ({ writes: [{ path: 'governed-1.txt', content: 'after-1\\n' }] }) },
            { kind: 'mechanical', code: 'EXAMPLE-2', title: 'Two', level: 'FAIL', phase: 'PRIMARY',
              audit: async () => [{ status: 'VIOLATION', message: 'y' }],
              conform: async () => ({ writes: [{ path: 'governed-2.txt', content: 'after-2\\n' }] }) }
          ]
        }]`)
      })

      const dryRun = await box.run('ki repo conform --dry-run')

      expect(dryRun.exitCode).toBe(1)
      expect(dryRun.output).toContain('direct conform write target governed-2.txt must be an existing regular file')
      expect(await box.project.read('governed-1.txt')).toBe('before-1\n')

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target governed-2.txt must be an existing regular file')
      expect(await box.project.read('governed-1.txt')).toBe('after-1\n')
    })

    test('reports FIXED when a re-audited item that was violated is now clean', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
            conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result).toEqual({
        exitCode: 0,
        output: `write governed.txt

==> ${await projectRoot(box.project)} [example/harness:ki-example] conform
  ✅ fixed [Example (EXAMPLE-1)] — conformed
  ✅ summary: FAIL=0 WARN=0 FIXED=1 JUDGMENT_UNEVALUATED=0
  ✅ fixed complete

==> recap
  ✅ fixed example/harness:ki-example [Example (EXAMPLE-1)] — conformed
  ✅ totals: FAIL=0 WARN=0 FIXED=1 JUDGMENT_UNEVALUATED=0
`
      })
    })

    test('fails when re-audit after conform still finds the violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'always fails' }],
            conform: async () => ({ writes: [{ path: 'governed.txt', content: 'after\\n' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('❌ fail  [Example (EXAMPLE-1)] — always fails')
      expect(result.output).toContain('re-audit found failures')
    })

    test('rejects a conform write whose target does not exist as a regular file', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
            conform: async () => ({ writes: [{ path: 'missing.txt', content: 'x' }] })
          }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target missing.txt must be an existing regular file')
    })

    test('creates an explicitly declared new regular file atomically', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'created.txt', content: 'created\\n', create: true }] })
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

    test('creates an explicit target beneath absent repository directories', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/missing/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'missing/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('write missing/created.txt')
      await expect(box.project.read('missing/created.txt')).resolves.toBe('created\n')
    })

    test('creates an explicit target beneath an existing repository directory', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.mkdir('existing')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/existing/created.txt')
              ? [{ status: 'PASS', message: 'created' }]
              : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'existing/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(0)
      await expect(box.project.read('existing/created.txt')).resolves.toBe('created\n')
    })

    test('refuses nested create targets below a file or symbolic-link parent', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.project.write('blocked', 'not a directory\n')
      await box.root.mkdir('outside')
      await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
          conform: async () => ({ writes: [
            { path: 'blocked/created.txt', content: 'created\\n', create: true },
            { path: 'linked/created.txt', content: 'created\\n', create: true }
          ] })
        }] }]`)
      })

      const dryRun = await box.run('ki repo conform --dry-run')

      expect(dryRun.exitCode).toBe(1)
      expect(dryRun.output).toContain('direct conform create target blocked/created.txt escapes the repository')

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform create target blocked/created.txt escapes the repository')
    })

    test('refuses a nested create target below a symbolic-link parent', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.root.mkdir('outside')
      await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'missing' }],
          conform: async () => ({ writes: [{ path: 'linked/created.txt', content: 'created\\n', create: true }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform create target linked/created.txt escapes the repository')
    })

    test('conforms a declared user-home path incrementally', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.home.write('.managed/setting.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(
          `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ userHome }) => {
            const { readFile } = await import('node:fs/promises')
            return (await readFile(userHome + '/.managed/setting.txt', 'utf8')) === 'after\\n'
              ? [{ status: 'PASS', message: 'conformed' }]
              : [{ status: 'VIOLATION', message: 'not conformed' }]
          },
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: 'after\\n' }] })
        }] }]
`,
          'ki-example'
        )
          .replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
          .replace('createSession: async ({ repository })', 'createSession: async ({ repository, userHome })')
          .replace('const context = { repository,', 'const context = { repository, userHome,')
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('write .managed/setting.txt')
      expect(await box.home.read('.managed/setting.txt')).toBe('after\n')
    })

    test('refuses a user-home rubric when HOME is missing', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric('[]').replace(
          "concern: 'test governance',",
          "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },"
        )
      })
      await rm(box.home.path, { recursive: true })

      const result = await box.run('ki repo audit')

      expect(result).toEqual({ exitCode: 1, output: 'ki: error: user home must be an existing physical directory\n' })
    })

    test('coalesces identical user-home writes proposed by separate skills', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n["example/harness:ki-extra"]\n')
      await box.home.write('.managed/setting.txt', 'before\n')
      const userHomeRubric = (skill: string, code: string): string =>
        rubric(
          `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: 'after\\n' }] })
        }] }]`,
          skill
        ).replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
      await box.setupExampleHarness({ rubric: userHomeRubric('ki-example', 'EXAMPLE-1') })
      await box.data.write('ki/harnesses/example/harness/skills/ki-extra/SKILL.md', '---\nname: ki-extra\nki-depends-on: []\n---\n')
      await box.data.write(
        'ki/harnesses/example/harness/skills/ki-extra/scripts/rubric/items/index.ts',
        userHomeRubric('ki-extra', 'EXTRA-1')
      )

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output.match(/^write \.managed\/setting\.txt$/gm)).toHaveLength(1)
      expect(await box.home.read('.managed/setting.txt')).toBe('after\n')
    })

    test('refuses conflicting user-home writes proposed by separate skills', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n["example/harness:ki-extra"]\n')
      await box.home.write('.managed/setting.txt', 'before\n')
      const userHomeRubric = (skill: string, code: string, content: string): string =>
        rubric(
          `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: '${code}', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.managed/setting.txt', content: '${content}' }] })
        }] }]`,
          skill
        ).replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
      await box.setupExampleHarness({ rubric: userHomeRubric('ki-example', 'EXAMPLE-1', 'first\\n') })
      await box.data.write('ki/harnesses/example/harness/skills/ki-extra/SKILL.md', '---\nname: ki-extra\nki-depends-on: []\n---\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.home.write('.outside/setting.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(
          `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [{ path: '.outside/setting.txt', content: 'after\\n' }] })
        }] }]`,
          'ki-example'
        ).replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write path .outside/setting.txt is outside its declared filesystem scope')
      expect(await box.home.read('.outside/setting.txt')).toBe('before\n')
    })

    test('refuses user-home conform commands before running them', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.home.write('.managed/setting.txt', 'before\n')
      await box.setupExampleHarness({
        rubric: rubric(
          `[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'false', arguments: [] }] })
        }] }]`,
          'ki-example'
        ).replace("concern: 'test governance',", "concern: 'test governance', scope: { kind: 'user-home', paths: ['.managed'] },")
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('user-home rubric conform actions must be guarded direct writes; conform commands are not permitted')
      expect(await box.home.read('.managed/setting.txt')).toBe('before\n')
    })

    test('refuses an explicit create target that already exists', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('a conform proposing no writes leaves its violation reported and unfixed', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      expect(result.output).toContain('⚠️  warn  [Example (EXAMPLE-1)] — nothing safe to propose')
    })

    test('reports subprocess conforms in dry-run mode without executing them, then runs and re-audits them', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      expect(conformed.output).toContain('✅ fixed [Example (EXAMPLE-1)] — conformed')
      await expect(box.project.read('conformed.txt')).resolves.toBe('ok')
    })

    test('reports a failed subprocess conform with its command output', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"] }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("\"process.stdout.write('out'); process.stderr.write('err'); process.exit(3)\"\nout\nerr")
    })

    test('conforms INFO outcomes explicitly opted into conforming and retains a fixed subject', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
          audit: { phase: 'PRIMARY', run: async () => [{ status: 'NOT_APPLICABLE', message: 'not applicable' }] },
          conform: { phase: 'PRIMARY', run: async () => { throw new Error('must not conform') } }
        }
      }
    ]
  }]
}
`
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('✅ fixed [Info conform (INFO-1)] workspace — conformed')
      expect(await box.project.read('governed.txt')).toBe('after\n')
    })

    test('orders same-phase conform actions by their family declaration', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      expect(result.output.indexOf('[Second item (SECOND-1)]')).toBeLessThan(result.output.indexOf('[First item (FIRST-1)]'))
    })

    test('refuses an unsafe direct conform write before publication', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', 'process.exit(3)'] }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result).toEqual({
        exitCode: 1,
        output: 'run "node" "-e" "process.exit(3)"\nki: error: direct subprocess conform failed: "node" "-e" "process.exit(3)"\n'
      })
    })

    test('reports a subprocess terminated by a signal as a failed conform', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'WARN', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
          conform: async () => ({ writes: [], commands: [{ program: 'node', arguments: ['-e', "process.kill(process.pid, 'SIGTERM')"] }] })
        }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result).toEqual({
        exitCode: 1,
        output:
          'run "node" "-e" "process.kill(process.pid, \'SIGTERM\')"\nki: error: direct subprocess conform failed: "node" "-e" "process.kill(process.pid, \'SIGTERM\')"\n'
      })
    })

    test('rejects a malformed subprocess conform proposal before execution', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

  // CLI-004 acceptance evidence (c): a provider that was valid at install time but has
  // since been tampered with on disk — not a malformed payload from the start — is
  // refused at `ki repo audit` time, before any of its rubric items run. Both scenarios
  // reuse the same installed-payload integrity checks `ki harness info`/`list` exercise
  // (src/core/harness.ts enumeratePayloadFiles/frontmatter), proven here end-to-end
  // through the CLI surface CLI-004 names.
  describe('altered installed providers', () => {
    test('refuses a rubric module replaced by a symlink after install', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', 'no frontmatter here\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must declare frontmatter')
    })
  })

  describe('malformed rubric definitions', () => {
    test.each([
      [
        'invalid override levels',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', overrideLevels: ['CRITICAL'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'overrideLevels must contain only FAIL or WARN'
      ],
      [
        'repeated override levels',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', overrideLevels: ['WARN', 'WARN'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'repeats an override level'
      ],
      [
        'a non-boolean heuristic',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', heuristic: 'yes', audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'heuristic must be boolean'
      ],
      [
        'an invalid conform-on status',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', conformOn: ['VIOLATION'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'conformOn must contain unique INFO statuses'
      ],
      [
        'repeated conform-on statuses',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', conformOn: ['INFO', 'INFO'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'conformOn must contain unique INFO statuses'
      ],
      [
        'a mechanical aspect that is not a table',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: null }] }]`,
        'mechanical aspect must be a table'
      ],
      [
        'a conform aspect that is not a table',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] }, conform: null } }] }]`,
        'conform must be a table'
      ],
      [
        'a judgment aspect that is not a table',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', judgment: null }] }]`,
        'judgment must have a prompt'
      ],
      [
        'an empty sources list',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', sources: [], mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'must have a non-empty sources array'
      ],
      [
        'an empty source entry',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', sources: [''], mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'must have a non-empty sources array'
      ]
    ])('rejects %s', async (_case, families, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(families) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test.each([
      [
        'a malformed scope',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: null, createSession: async () => ({}), families: [] }`,
        'rubric definition scope must be a table'
      ],
      [
        'a user-home scope without paths',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'user-home' }, createSession: async () => ({}), families: [] }`,
        'user-home scope must declare paths'
      ],
      [
        'a user-home scope with repeated paths',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'user-home', paths: ['.managed', '.managed'] }, createSession: async () => ({}), families: [] }`,
        'user-home scope repeats a path'
      ],
      [
        'a user-home scope with an unsafe path',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'user-home', paths: ['../managed'] }, createSession: async () => ({}), families: [] }`,
        'user-home scope paths must be safe relative paths'
      ],
      [
        'an unrecognised scope kind',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'workspace', paths: ['managed'] }, createSession: async () => ({}), families: [] }`,
        'user-home scope must declare paths'
      ],
      [
        'a family with no description',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', standard: 'standard.md', selectContext: () => ({}), items: [] }] }`,
        'rubric family F must have a description'
      ],
      [
        'a family with no standard',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', selectContext: () => ({}), items: [] }] }`,
        'rubric family F must name its standard'
      ],
      [
        'a family with no context selector',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', standard: 'standard.md', items: [] }] }`,
        'rubric family F must have a selectContext function'
      ],
      [
        'a repeated family code',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', standard: 'standard.md', selectContext: () => ({}), items: [] }, { code: 'F', title: 'Other', description: 'Other.', standard: 'standard.md', selectContext: () => ({}), items: [] }] }`,
        'rubric repeats family F'
      ],
      [
        'a definition with no concern',
        `export default { contract: 1, name: 'ki-example', createSession: async () => ({}), families: [] }`,
        'rubric catalogue must name its concern'
      ],
      [
        'an item with no description',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', standard: 'standard.md', selectContext: () => ({}), items: [{ code: 'EXAMPLE-1', title: 'Example', sources: ['standard.md'], mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } }] }] }`,
        'rubric item EXAMPLE-1 must have a description'
      ]
    ])('rejects %s', async (_case, source, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: source })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test.each([
      ['a non-table session', 'null', 'rubric context must return a session table'],
      ['no subjects array', `{ subjects: null, proposal: () => ({ writes: [] }) }`, 'rubric session must contain a subjects array'],
      ['no proposal function', `{ subjects: [], proposal: null }`, 'rubric session must provide a proposal function'],
      ['a non-table subject', `{ subjects: [null], proposal: () => ({ writes: [] }) }`, 'rubric subject 0 must be a table'],
      [
        'a subject with no context function',
        `{ subjects: [{ families: ['F'] }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 must provide a context function'
      ],
      [
        'a subject naming an undeclared family',
        `{ subjects: [{ families: ['UNKNOWN'], context: () => ({}) }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 families must name only declared rubric families'
      ],
      [
        'a subject repeating a family',
        `{ subjects: [{ families: ['F', 'F'], context: () => ({}) }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 repeats a family'
      ],
      [
        'a subject with a non-string label',
        `{ subjects: [{ families: ['F'], context: () => ({}), subject: 42 }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 has an invalid subject label'
      ]
    ])('rejects a rubric context with %s', async (_case, session, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubricWithSession(session) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test('rejects a rubric module with no default export', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: '// missing default export\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue default export is not a table')
    })

    test('rejects an audit function returning non-array outcomes', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('rejects a conform returning a non-array writes field', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => ({ writes: 'not an array' }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric session proposal must return a writes array')
    })

    test('rejects an audit outcome that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('rejects a conform write that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => ({ writes: [null] }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric session proposal write 0 must have string path and content')
    })

    test('rejects an audit outcome missing a status', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('rejects an audit outcome with an undeclared level', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric:
          rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', level: 'WARN', message: 'x' }] }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('uses an undeclared level')
    })

    test('rejects an audit outcome that sets a level outside a violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric:
          rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'INFO', level: 'WARN', message: 'x' }] }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('sets a level outside VIOLATION')
    })

    test('rejects a rubric module whose native module fails to import', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: 'this is not valid javascript syntax {{{\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue could not be imported')
    })

    test('rejects a conform that does not return a writes table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => null }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric session proposal must return a table')
    })

    test('rejects a conform write entry with a non-string path or content', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => ({ writes: [{ path: 1, content: 'x' }] }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must have string path and content')
    })

    test.each([
      ['a non-boolean create flag', `{ writes: [{ path: 'governed.txt', content: 'x', create: 'yes' }] }`, 'create must be boolean'],
      ['a non-array commands field', `{ writes: [], commands: 'not an array' }`, 'proposal commands must be an array'],
      ['a non-table command', `{ writes: [], commands: [null] }`, 'command 0 must have a program and arguments'],
      [
        'an invalid command program',
        `{ writes: [], commands: [{ program: '../false', arguments: [] }] }`,
        'command 0 must have a program and arguments'
      ],
      [
        'a command argument with a NUL byte',
        `{ writes: [], commands: [{ program: 'false', arguments: ['a\\0b'] }] }`,
        'arguments must be strings without NUL bytes'
      ],
      [
        'a non-string command argument',
        `{ writes: [], commands: [{ program: 'false', arguments: [1] }] }`,
        'arguments must be strings without NUL bytes'
      ]
    ])('rejects %s in a conform proposal', async (_case, proposal, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric:
          rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'x' }], conform: async () => (${proposal}) }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test('rejects a rubric item with an invalid level', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

    test('rejects a rubric item whose conform is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            code: 'EXAMPLE-1', title: 'Example',
            mechanical: {
              level: 'FAIL',
              audit: { phase: 'PRIMARY', run: async () => [] },
              conform: { phase: 'PRIMARY', run: 'not a function' }
            }
          }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('conform must have a run function')
    })

    test('rejects a rubric definition whose declared skill does not match the installed capability', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]', 'ki-other') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue name does not match the installed capability')
    })

    test('rejects an audit outcome with a non-string subject', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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

      const result = await box.run('ki repo audit --reporter-levels info')

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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', title: 'Family', items: [null] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item must be a table')
    })

    test('rejects a rubric item with no code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', title: 'Example' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item must have a code')
    })

    test('rejects a rubric item with no title', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item EXAMPLE-1 must have a title')
    })

    test('rejects a rubric definition that repeats an item code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'judgment', code: 'J-1', title: 'Judgment' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item J-1 judgment must have a prompt')
    })

    test('rejects a rubric item with neither aspect', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'unknown', code: 'X-1', title: 'X' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item X-1 must be mechanical, judgment, or both')
    })

    test('rejects a rubric family that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[null]') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family must be a table')
    })

    test('rejects a rubric family with no code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ title: 'Family', items: [] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family must have a code')
    })

    test('rejects a rubric family with no title', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', items: [] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family F must have a title')
    })

    test('rejects a rubric family whose items is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', title: 'Family', items: 'not an array' }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family F must have an items array')
    })

    test('rejects a rubric definition with an unsupported contract version', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 2, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue has an unsupported contract version')
    })

    test('rejects a rubric definition whose createSession is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: 'not a function', families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue must have a createSession function')
    })

    test('rejects a rubric definition whose families is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: 'not an array' }`
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
      const declarations = `["example/harness:ki-feature"]

["example/harness:ki-foundation"]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit --reporter-levels info')

      expect(result.exitCode).toBe(0)
      expect(result.output.indexOf(`==> ${await projectRoot(box.project)} [example/harness:ki-foundation] audit`)).toBeLessThan(
        result.output.indexOf(`==> ${await projectRoot(box.project)} [example/harness:ki-feature] audit`)
      )
      expect(result.output).toContain('[Order (R-1)] — ki-foundation')
      expect(result.output).toContain('[Order (R-1)] — ki-feature')
    })

    test('uses a stable topological order independent of declaration and dependency-list order', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-a-feature', deps: ['ki-z-foundation', 'ki-y-foundation'] },
        { name: 'ki-b-independent', deps: [] },
        { name: 'ki-y-foundation', deps: [] },
        { name: 'ki-z-foundation', deps: [] }
      ])
      const declarations = `["example/harness:ki-z-foundation"]

["example/harness:ki-a-feature"]

["example/harness:ki-y-foundation"]

["example/harness:ki-b-independent"]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit --reporter-levels info')
      const target = await projectRoot(box.project)
      const positions = ['ki-b-independent', 'ki-y-foundation', 'ki-z-foundation', 'ki-a-feature'].map((name) =>
        result.output.indexOf(`==> ${target} [example/harness:${name}] audit`)
      )

      expect(result.exitCode).toBe(0)
      expect(positions.every((position) => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((left, right) => left - right))
    })

    test('refuses a declared skill whose dependency is undeclared', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await box.project.write('.ki-config.toml', '["example/harness:ki-feature"]\n')

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
      const declarations = `["example/harness:ki-first"]

["example/harness:ki-second"]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has a dependency cycle')
    })

    test('refuses --skill naming a skill not among the declared skills', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [{ name: 'ki-foundation', deps: [] }])
      await box.project.write('.ki-config.toml', '["example/harness:ki-foundation"]\n')

      const result = await box.run('ki repo audit --skill ki-nonexistent')

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--skill must name one declared resolved skill')
    })

    test('refuses a declared skill not available from any installed harness', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-missing"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('requires installed harness example/harness')
    })

    test('refuses a declared skill missing from its installed provider', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.project.write('.ki-config.toml', '["example/harness:ki-missing"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('installed harness example/harness does not provide declared skill ki-missing')
    })

    test('uses the declared provider when another installed harness provides the same skill', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [{ name: 'ki-shared', deps: [] }])
      const base = 'ki/harnesses/other/harness/skills/ki-shared'
      await box.data.write(`${base}/SKILL.md`, '---\nname: ki-shared\nki-depends-on: []\n---\n')
      await box.project.write('.ki-config.toml', '["example/harness:ki-shared"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('[example/harness:ki-shared] audit')
      expect(result.output).not.toContain('[other/harness:ki-shared] audit')
    })

    test('selecting one skill by --skill pulls in its declared dependency', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await box.project.write('.ki-config.toml', '["example/harness:ki-feature"]\n\n["example/harness:ki-foundation"]\n')

      const result = await box.run('ki repo audit --skill example/harness:ki-feature --reporter-levels info')

      expect(result.exitCode).toBe(0)
      expect(result.output.indexOf(`==> ${await projectRoot(box.project)} [example/harness:ki-foundation] audit`)).toBeLessThan(
        result.output.indexOf(`==> ${await projectRoot(box.project)} [example/harness:ki-feature] audit`)
      )
    })
  })
})
