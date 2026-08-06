import { realpath } from 'node:fs/promises'
import { basename } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type SandboxArea, sandbox } from '../_cli_helper.ts'

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

const projectRoot = (area: SandboxArea): Promise<string> => realpath(area.path)

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
          mechanical: { level: 'WARN', heuristic: true, remediation: { class: 'guarded', guidance: 'Apply the review decision.' }, audit: { phase: 'PRIMARY', run: async () => [] } },
          judgment: { scope: 'The reported result.', prompt: 'Review the result.', outcomes: ['accepted'], guidance: 'Record the result.' }
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
        output: `╭─ KI REPO AUDIT
│  📁 ${basename(await projectRoot(box.project))}
│     ${await projectRoot(box.project)}
│  ✦ 1 skill selected
│     ╰─ example/harness:ki-example
├─ results
│  ╰─ ✓ example/harness:ki-example PASS · FAIL=0 WARN=0
│     ╰─ i info  [Example (EXAMPLE-1)] — ok
╰─ summary: PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0
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
      expect(all.output).toContain('✓ pass')
      expect(all.output).toContain('– na')
      expect(all.output).toContain('i info')
      expect(all.output).toContain('! warn')
      expect(all.output).toContain('× fail')
      expect(all.output).toContain('│     ├─ ✓ pass')
      expect(all.output).toContain('│     ╰─ × fail')
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
      expect(always.output).toContain('├─ progress')
      expect(always.output).not.toContain('\r\x1b[2K')
      expect(always.output).toContain(
        `╭─ KI REPO AUDIT\n│  📁 ${basename(await projectRoot(box.project))}\n│     ${await projectRoot(box.project)}\n│  ✦ 1 skill selected\n│     ╰─ example/harness:ki-example\n├─ progress [`
      )
      expect(always.output.indexOf('╭─ KI REPO AUDIT')).toBeLessThan(always.output.indexOf('├─ progress ['))
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

      const result = await box.run(`ki repo --repo ${box.project.path} audit --skill ki-website`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain(`╰─ ! example/harness:ki-website WARN · FAIL=0 WARN=1`)
      expect(result.output).not.toContain('ki-website-cloudflare')
    })

    test('reports clean when no families declare items', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit')

      expect(result).toEqual({
        exitCode: 0,
        output: `╭─ KI REPO AUDIT
│  📁 ${basename(await projectRoot(box.project))}
│     ${await projectRoot(box.project)}
│  ✦ 1 skill selected
│     ╰─ example/harness:ki-example
├─ results
│  ╰─ ✓ example/harness:ki-example PASS · FAIL=0 WARN=0
╰─ summary: PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0
`
      })
    })

    test('reports an interactive zero-item audit as complete', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit', { interactive: true, now: () => 0 })

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('├─ progress [###############################] 0/0 100% starting')
      expect(result.output).toContain('├─ progress [###############################] 0/0 100% complete')
    })

    test('uses the fallback progress width when a TTY reports an invalid column count', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit', { interactive: true, columns: Number.NaN, now: () => 0 })

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('├─ progress [###############################] 0/0 100% complete')
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
      const [progressOutput = '', standardOutput = ''] = result.output.split('\n├─ results\n')
      const header = `╭─ KI REPO AUDIT\n│  📁 ${basename(await projectRoot(box.project))}\n│     ${await projectRoot(box.project)}\n│  ✦ 2 skills selected\n│     ├─ example/harness:ki-example\n│     ╰─ example/harness:ki-extra\n`
      const frames = progressOutput
        .slice(header.length)
        .replace(/\n$/, '')
        .split('\r\x1b[2K')
        .filter(Boolean)
        .map((frame) => frame.replace('\n', ''))

      expect(result.exitCode).toBe(0)
      expect(progressOutput.startsWith(header)).toBe(true)
      expect(standardOutput).toBe(`│  ├─ ✓ example/harness:ki-example PASS · FAIL=0 WARN=0
│  ╰─ ✓ example/harness:ki-extra PASS · FAIL=0 WARN=0
╰─ summary: PASS=2 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0
`)
      expect(frames.map((frame) => frame.trimEnd())).toEqual([
        '├─ progress [>..............................] 0.0s loading 0/2 definitions',
        '├─ progress [>..............................] 1.3s loading 1/2 definitions',
        '├─ progress [>..............................] 1.5s loading 2/2 definitions',
        '├─ progress [...............................] 0/3 0% starting',
        '├─ progress [##########.....................] 1/3 33% ki-example EXAMPLE-1',
        '├─ progress [####################...........] 2/3 67% ki-example EXAMPLE-2',
        '├─ progress [###############################] 3/3 100% ki-extra EXTRA-1',
        '├─ progress [###############################] 3/3 100% complete'
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
        output: `╭─ KI REPO AUDIT
│  📁 ${basename(await projectRoot(box.project))}
│     ${await projectRoot(box.project)}
│  ✦ 2 skills selected
│     ├─ example/harness:ki-example
│     ╰─ example/harness:ki-extra
├─ results
│  ├─ ✓ example/harness:ki-example PASS · FAIL=0 WARN=0
│  ╰─ ✓ example/harness:ki-extra PASS · FAIL=0 WARN=0
╰─ summary: PASS=2 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0
`
      })
    })

    test.each([
      [Number.MIN_VALUE, ''],
      [1, '.'],
      [3, '...'],
      [8, '0.0s ...'],
      [13, '├─ progress .']
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
      expect(result.output).toContain('× fail  [Example (EXAMPLE-1)] — not conformed')
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
        output: `╭─ KI REPO AUDIT
│  📁 ${basename(await projectRoot(box.project))}
│     ${await projectRoot(box.project)}
│  ✦ 1 skill selected
│     ╰─ example/harness:ki-example
├─ results
│  ╰─ ✓ example/harness:ki-example PASS · FAIL=0 WARN=0
│     ╰─ i info  [Example (EXAMPLE-1)] some/file.ts — ok
╰─ summary: PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0
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
        remediation: { class: 'guarded', guidance: 'Apply the review decision.' },
        overrideLevels: ['WARN'],
        heuristic: true,
        audit: {
          phase: 'INSPECT',
          run: ({ repository }) => [{ status: 'VIOLATION', level: 'WARN', message: repository }]
        }
      },
      judgment: { scope: 'The selected evidence.', prompt: 'Review the evidence.', outcomes: ['accepted'], guidance: 'Record the decision.' }
    }]
  }]
}
`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('! warn  [Hybrid evidence (DIRECT-1)]')
      expect(result.output).toContain('╰─ summary: PASS=0 WARN=1 FAIL=0 · FINDINGS: FAIL=0 WARN=1')
    })
  })
})
