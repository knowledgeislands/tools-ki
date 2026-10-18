// A set `KI_QUIET` gives `ki repo audit` and `ki repo conform` the shape of `--concise
// --progress never`, except that a failing repository still renders its failing findings;
// any explicit output flag puts the call back to its ordinary shape.

import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const DECLARATION = '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n'

// A catalogue whose one item reports the findings the caller lists, each as `[status, message, level?]`.
const rubric = (findings: string): string => `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'quiet output',
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
          run: () => (${findings}).map(([status, message, level]) => ({
            status,
            message,
            ...(level === undefined ? {} : { level })
          }))
        }
      }
    }]
  }]
}
`

const repository = async (findings: string): Promise<Sandbox> => {
  const box = await sandbox()
  await box.project.write('.ki.toml', DECLARATION)
  await box.setupExampleHarness({ rubric: rubric(findings) })
  return box
}

const FAILING = `[['VIOLATION', 'broken'], ['VIOLATION', 'needs attention', 'WARN']]`

describe('[KI_QUIET]', () => {
  test('gives a passing audit and conform the concise shape without progress', async () => {
    const box = await repository(`[['PASS', 'fine']]`)
    const audit = await box.run('ki repo audit --concise --progress never')
    const conform = await box.run('ki repo conform --concise --progress never')
    box.setEnv({ KI_QUIET: '1' })

    expect(await box.run('ki repo audit')).toEqual(audit)
    expect(await box.run('ki repo conform')).toEqual(conform)
    expect(audit).toEqual({
      exitCode: 0,
      output: 'summary: KI REPO AUDIT on project PASS · 1 skill · CRITERIA: EVALUATED=1/1 JUDGMENT=0\n'
    })
  })

  test('keeps a warning repository to its summary line', async () => {
    const box = await repository(`[['VIOLATION', 'needs attention', 'WARN']]`)
    box.setEnv({ KI_QUIET: 'yes' })

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/^summary: KI REPO AUDIT on project PASS=0 WARN=1 FAIL=0 [^\n]*\n$/)
  })

  test('renders the failing findings of a failing audit and conform, and nothing quieter', async () => {
    const box = await repository(FAILING)
    box.setEnv({ KI_QUIET: '1' })

    const audit = await box.run('ki repo audit')
    const conform = await box.run('ki repo conform')

    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain('KI REPO AUDIT')
    expect(audit.output).toContain('broken')
    expect(audit.output).not.toContain('needs attention')
    expect(audit.output).toContain('summary: KI REPO AUDIT on project PASS=0 WARN=0 FAIL=1')
    expect(audit.output).toContain('repository audit found failures')
    expect(conform.exitCode).toBe(1)
    expect(conform.output).toContain('KI REPO CONFORM')
    expect(conform.output).toContain('broken')
    expect(conform.output).not.toContain('needs attention')
  })

  test('counts an empty value and 0 as unset', async () => {
    const box = await repository(FAILING)
    const ordinary = await box.run('ki repo audit')

    for (const value of ['', '0']) {
      box.setEnv({ KI_QUIET: value })
      expect(await box.run('ki repo audit')).toEqual(ordinary)
    }
    expect(ordinary.output).toContain('needs attention')
  })

  test('gives way to any explicit output flag', async () => {
    const box = await repository(FAILING)
    for (const flags of ['--concise', '--progress auto', '--progress-style single', '--reporter-levels FAIL,WARN']) {
      box.setEnv({ KI_QUIET: undefined })
      const ordinary = await box.run(`ki repo audit ${flags}`)
      box.setEnv({ KI_QUIET: '1' })
      expect(await box.run(`ki repo audit ${flags}`)).toEqual(ordinary)
    }
  })
})
