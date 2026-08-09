import { stripVTControlCharacters } from 'node:util'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// KI-TOOL-CLI-022. Evidence gathering happens inside `createSession`, before any criterion
// runs, and on a real catalogue it dominates the operation. These exercise the emitter the
// contract gives a session for that span, and the host's own bracket around it for a session
// that emits nothing at all.
const emittingRubric = (body: string, skill = 'ki-example'): string => `
export default {
  contract: 1,
  name: '${skill}',
  concern: 'test governance',
  createSession: async ({ emit }) => {
    ${body}
    return {
      subjects: [{ families: ['F'], context: () => ({}) }],
      proposal: () => ({ writes: [], commands: [] })
    }
  },
  families: [{
    code: 'F',
    title: 'Family',
    description: 'Test family.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'EXAMPLE-1',
      title: 'Example',
      description: 'Mechanical test criterion.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        remediation: { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' },
        audit: { phase: 'PRIMARY', run: async () => [] }
      }
    }]
  }]
}
`

const withRubric = async (body: string): Promise<Awaited<ReturnType<typeof sandbox>>> => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
  await box.setupExampleHarness({ rubric: emittingRubric(body) })
  return box
}

// A plain stream keeps the bar beside its text, so each frame is one greppable log line.
const plainFrames = (output: string): readonly string[] =>
  output
    .split('\n')
    .filter((line) => line.startsWith('├─ progress'))
    .map((line) =>
      stripVTControlCharacters(line)
        .replace(/^├─ progress \[[#>.]*\] /, '')
        .trimEnd()
    )

const barFor = (output: string, text: string): string =>
  output
    .split('\n')
    .find((line) => line.includes(text))
    ?.match(/\[([#>.]+)\]/)?.[1] ?? ''

describe('[ki repo audit evidence progress]', () => {
  test('names the stages and steps a session reports while it gathers evidence', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'start', label: 'engineering evidence' })
      emit({ kind: 'step', label: 'biome check', code: 'BIO-1' })
      emit({ kind: 'step', label: 'tsc --noEmit', code: 'TSC-1' })
      emit({ kind: 'stage', edge: 'end', label: 'engineering evidence' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    // Loading and the counted evidence phase stay visible before item audit begins. Within a
    // session's unmeasured stage, elapsed time remains the one quantity honestly known.
    expect(plainFrames(result.output)).toEqual([
      'audit loading definitions · 0/1 0% 0.0s',
      'audit loading definitions · 1/1 100% 0.0s',
      'audit loading definitions complete · 1/1 100% 0.0s',
      'audit gathering evidence · 0/1 0% 0.0s',
      'audit ki-example gathering evidence · 0.0s',
      'audit ki-example engineering evidence · 0.0s',
      'audit ki-example engineering evidence biome check · 0.0s',
      'audit ki-example engineering evidence tsc --noEmit · 0.0s',
      'audit ki-example gathering evidence engineering evidence done · 0.0s',
      'audit ki-example gathering evidence done · 0/1 0% 0.0s',
      'audit gathering evidence · 1/1 100% 0.0s',
      'audit gathering evidence complete · 1/1 100% 0.0s',
      'audit starting · 0/1 0% 0.0s',
      'audit ki-example running EXAMPLE-1 · 0/1 0% 0.0s',
      'audit ki-example EXAMPLE-1 · 1/1 100% 0.0s',
      'audit complete · 1/1 100% 0.0s'
    ])
  })

  test('shows a counted step as a determinate share of its own work', async () => {
    const box = await withRubric(`
      emit({ kind: 'step', label: 'scanning', completed: 3, total: 4 })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(plainFrames(result.output)).toContain('audit ki-example gathering evidence scanning · 3/4 75% 0.0s')
    // The counted step fills three quarters of its own bar, where the enclosing stage animated.
    expect(barFor(result.output, 'scanning · 3/4')).toBe(`${'#'.repeat(29)}${'.'.repeat(9)}`)
  })

  test('reverts to the item count when a session ends a stage it never opened', async () => {
    // An unbalanced end pops one level, which is the host's own bracket; a step reported after
    // it still names its work rather than being dropped on the floor.
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'end', label: 'never opened' })
      emit({ kind: 'step', label: 'orphaned work' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(plainFrames(result.output)).toContain('audit ki-example never opened done · 0/1 0% 0.0s')
    expect(plainFrames(result.output)).toContain('audit ki-example orphaned work · 0.0s')
  })

  test('renders an open stage as an unmeasured row in the per-skill layout', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'start', label: 'engineering evidence' })
      emit({ kind: 'stage', edge: 'end', label: 'engineering evidence' })
    `)

    const result = await box.run('ki repo audit --progress always --progress-style multi', {
      interactive: true,
      now: () => 0
    })
    const single = await box.run('ki repo audit --progress always', { interactive: true, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(stripVTControlCharacters(result.output)).toContain('[ki-example] engineering evidence')
    expect(stripVTControlCharacters(result.output)).toContain('[ki-example] EXAMPLE-1')
    // A completed phase collapses from one skill row plus its summary to its retained summary;
    // the next live panel starts below it rather than rewinding over it.
    expect(result.output).toContain('\x1b[1A')
    const evidenceComplete = single.output.indexOf('audit gathering evidence complete')
    const auditStart = single.output.indexOf('audit starting', evidenceComplete)
    // Frames fill the terminal width. An explicit CRLF resolves the terminal's deferred
    // wrap before the next phase begins, so their physical rows cannot overlap.
    expect(single.output.slice(evidenceComplete, auditStart)).toContain('\r\n\r\x1b[2K')
  })

  test('strips terminal control sequences from a rubric-supplied label', async () => {
    const box = await withRubric(`
      emit({ kind: 'step', label: '\\u001b[31mred\\u001b[0m command' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(plainFrames(result.output)).toContain('audit ki-example gathering evidence red command · 0.0s')
    expect(result.output).not.toContain('\x1b[31m')
  })

  test('withholds the emitter when nothing is displaying progress', async () => {
    const box = await withRubric(`
      if (emit !== undefined) throw new Error('emitter offered with no display')
    `)

    const result = await box.run('ki repo audit --progress never')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('PASS=1 WARN=0 FAIL=0')
    expect(result.output).not.toContain('├─ progress')
  })

  test.each([
    ["emit('not an object')", 'is not an object'],
    ["emit({ kind: 'step' })", 'has no label'],
    ["emit({ kind: 'step', label: 'x', code: 7 })", 'has a non-string code'],
    ["emit({ kind: 'stage', edge: 'middle', label: 'x' })", 'has an invalid stage edge'],
    ["emit({ kind: 'phase', label: 'x' })", 'has an unknown kind'],
    ["emit({ kind: 'step', label: 'x', completed: 1 })", 'reports a partial step count']
  ])('rejects %s as a malformed progress event', async (body, message) => {
    const box = await withRubric(body)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(`example/harness:ki-example rubric progress event ${message}`)
  })
})
