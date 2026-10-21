import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')

describe('CI native gate', () => {
  test('keeps the released KI pin at the verified compatible baseline or newer', () => {
    const pin = /^ {2}KI_VERSION: v(\d+)\.(\d+)\.\d+$/m.exec(workflow)
    expect(pin).not.toBeNull()
    const major = Number(pin?.[1])
    const minor = Number(pin?.[2])
    expect(major > 0 || (major === 0 && minor >= 12)).toBe(true)
  })

  test('verifies the installed release before one native audit and manual lint', () => {
    const verification = workflow.indexOf('test "v$(ki --version)" = "$KI_VERSION"')
    const audit = workflow.indexOf('run: ki repo audit --repo .')
    const manual = workflow.indexOf('run: bun run ki:tools:lint-man')
    expect(verification).toBeGreaterThanOrEqual(0)
    expect(audit).toBeGreaterThan(verification)
    expect(manual).toBeGreaterThan(audit)
    expect(workflow.match(/run: ki repo audit --repo \./g)).toHaveLength(1)
  })

  test('leaves Biome, TypeScript and coverage execution to the native audit', () => {
    expect(workflow).not.toMatch(/\bbunx\s+(?:(?:@biomejs\/)?biome|tsc)\b/)
    expect(workflow).not.toMatch(/\bbun\s+run\s+test(?::coverage)?\b/)
  })
})
