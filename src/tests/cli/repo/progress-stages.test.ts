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

const visibleLines = (output: string): readonly string[] =>
  stripVTControlCharacters(output)
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)

const barFor = (output: string, text: string): string =>
  output
    .split('\n')
    .find((line) => line.includes(text))
    ?.match(/\[([#>.]+)\]/)?.[1] ?? ''

describe('[ki repo audit evidence progress]', () => {
  test('names live evidence work and keeps only timed phase receipts', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'start', label: 'engineering evidence' })
      emit({ kind: 'step', label: 'biome check', code: 'BIO-1' })
      emit({ kind: 'step', label: 'tsc --noEmit', code: 'TSC-1' })
      emit({ kind: 'stage', edge: 'end', label: 'engineering evidence' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('engineering evidence biome check · 0.0s')
    expect(result.output).toContain('engineering evidence tsc --noEmit · 0.0s')
    expect(result.output).toMatch(/✓ loading +\[#+\] definitions loaded · 1 skill · 0\.0s/)
    expect(result.output).toMatch(/✓ evidence +\[#+\] evidence gathered · 1 skill · 0\.0s/)
    expect(result.output).toMatch(/✓ audit +\[#+\] complete · 0\.0s · total 0\.0s/)
    expect(result.output).not.toContain('timings')
    expect(result.output).not.toMatch(/\d+\/\d+ \d+%/)
  })

  test('accounts repeated phase reports without resetting elapsed time', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'start', label: 'engineering evidence' })
      emit({ kind: 'stage', edge: 'end', label: 'engineering evidence' })
    `)
    let clock = 0

    const result = await box.run('ki repo audit --progress always', {
      columns: 240,
      now: () => {
        clock += 29
        return clock
      }
    })
    const evidence = result.output.match(/evidence gathered · 1 skill · ([\d.]+)s/)?.[1]
    const completion = result.output.match(/✓ audit .*complete · ([\d.]+)s · total ([\d.]+)s/)?.slice(1)

    expect(result.exitCode).toBe(0)
    expect(Number(evidence)).toBeGreaterThan(0)
    expect(Number(completion?.[0])).toBeGreaterThan(0)
    expect(Number(completion?.[1])).toBeGreaterThan(Number(evidence))
  })

  test('keeps a counted evidence step indeterminate instead of treating it as estimated completion', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'start', label: 'engineering evidence' })
      emit({ kind: 'step', label: 'scanning', completed: 1, total: 4 })
      emit({ kind: 'step', label: 'scanning', completed: 3, total: 4 })
      emit({ kind: 'stage', edge: 'end', label: 'engineering evidence' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(barFor(result.output, 'engineering evidence scanning')).toContain('>')
    expect(result.output).not.toContain('3/4')
  })

  test('renders conform evidence as live activity and one aggregate receipt', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'start', label: 'engineering evidence' })
      emit({ kind: 'step', label: 'biome check', code: 'BIO-1' })
      emit({ kind: 'step', label: 'tsc --noEmit', code: 'TSC-1' })
      emit({ kind: 'step', label: 'vitest run', code: 'TEST-4' })
      emit({ kind: 'step', label: 'vitest run --coverage', code: 'TEST-5' })
      emit({ kind: 'step', label: 'syncpack lint', code: 'SYNC-1' })
      emit({ kind: 'stage', edge: 'end', label: 'engineering evidence' })
    `)

    const result = await box.run('ki repo conform --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    for (const command of ['biome check', 'tsc --noEmit', 'vitest run', 'vitest run --coverage', 'syncpack lint'])
      expect(result.output).toContain(`engineering evidence ${command}`)
    expect(result.output).toMatch(/✓ evidence +\[#+\] evidence gathered · 1 skill · 0\.0s/)
    expect(result.output).not.toMatch(/conform .*engineering evidence/)
  })

  test('shows evidence-ready skills as full receipts, then collapses them once', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-first]\n[skills.ki-second]\n[skills.ki-third]\n'
    )
    await box.setupExampleHarness({ rubric: emittingRubric('', 'ki-first'), name: 'ki-first' })
    await box.setupExampleHarness({ rubric: emittingRubric('', 'ki-second'), name: 'ki-second' })
    await box.setupExampleHarness({ rubric: emittingRubric('', 'ki-third'), name: 'ki-third' })

    const result = await box.run('ki repo conform --progress-style multi', {
      interactive: true,
      columns: 240,
      now: () => 0
    })
    const lines = visibleLines(result.output)

    expect(result.exitCode).toBe(0)
    for (const skill of ['ki-first', 'ki-second', 'ki-third']) {
      const receipt = lines.find((line) => line.includes(`✓ ${skill}`) && line.includes('evidence ready'))
      expect(receipt).toMatch(/\[#+\]/)
      expect(lines.filter((line) => line.includes(`✓ ${skill}`) && line.includes('evidence ready'))).toHaveLength(1)
    }
    expect(result.output).toContain('\x1b[3A')
    expect(result.output).not.toContain('\x1b[4A')
    expect(lines.some((line) => line.includes('queued'))).toBe(false)
    expect(lines.some((line) => line.includes('pending'))).toBe(false)
    expect(lines.some((line) => /✓ evidence .*evidence gathered · 3 skills · 0\.0s/.test(line))).toBe(true)
  })

  test('keeps repeated and unbalanced evidence reports readable on the live row', async () => {
    const box = await withRubric(`
      emit({ kind: 'stage', edge: 'end', label: 'never opened' })
      emit({ kind: 'step', label: 'scanning' })
      emit({ kind: 'step', label: 'scanning' })
      emit({ kind: 'step', label: 'orphaned work' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(result.output.match(/scanning · 0\.0s/g)).toHaveLength(2)
    expect(result.output).toContain('orphaned work · 0.0s')
  })

  test('strips terminal control sequences from a rubric-supplied label', async () => {
    const box = await withRubric(`
      emit({ kind: 'step', label: '\\u001b[31mred\\u001b[0m command' })
    `)

    const result = await box.run('ki repo audit --progress always', { columns: 240, now: () => 0 })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('red command · 0.0s')
    expect(result.output).not.toContain('\x1b[31m')
  })

  test('withholds the emitter when nothing is displaying progress', async () => {
    const box = await withRubric(`
      if (emit !== undefined) throw new Error('emitter offered with no display')
    `)

    const result = await box.run('ki repo audit --progress never')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('PASS · 1 skill')
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
