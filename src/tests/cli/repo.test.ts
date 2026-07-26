import { describe, expect, test } from 'vitest'
import { type SandboxArea, sandbox } from './_cli_helper.ts'

// Builds a full `scripts/rubric/index.ts` module source, wrapping the contract's
// required boilerplate (contract version, skill name, createContext) around a caller-
// supplied `families` array literal. Keeps each test's fixture down to just the
// families/items shape it actually exercises.
const rubric = (families: string, skill = 'ki-example'): string => `
export default {
  contract: 1,
  skill: '${skill}',
  createContext: async ({ repository }) => ({ repository }),
  families: ${families}
}
`

describe('[ki repo]', () => {
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

      expect(result).toEqual({ exitCode: 0, output: 'info EXAMPLE-1: ok\n' })
    })

    test('reports clean when no families declare items', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })

      const result = await box.run('ki repo audit')

      expect(result).toEqual({ exitCode: 0, output: 'ki repo audit: clean (1 skills)\n' })
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
      expect(result.output).toContain('does not provide a native rubric definition')
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
      expect(result.output).toContain('fail EXAMPLE-1: not conformed\n')
      expect(result.output).toContain('native repository audit found failures')
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

      expect(result).toEqual({ exitCode: 0, output: 'info EXAMPLE-1: ok — some/file.ts\n' })
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

      expect(result).toEqual({ exitCode: 0, output: '' })
    })

    test('publishes a complete repair write set, supports dry-run, and re-audits', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({ rubric: rubric(governedItem()) })

      const dryRun = await box.run('ki repo conform --dry-run')
      const beforeContent = await box.project.read('governed.txt')
      expect(dryRun).toEqual({ exitCode: 0, output: 'would write governed.txt\n' })
      expect(beforeContent).toBe('before\n')

      const conformed = await box.run('ki repo conform')
      const afterContent = await box.project.read('governed.txt')
      expect(conformed).toEqual({ exitCode: 0, output: 'write governed.txt\n' })
      expect(afterContent).toBe('after\n')
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

      expect(result).toEqual({ exitCode: 0, output: 'write governed.txt\nFIXED EXAMPLE-1: conformed\n' })
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
      expect(result.output).toContain('fail EXAMPLE-1: always fails')
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
      expect(result.output).toContain('native conform write target missing.txt must be an existing regular file')
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
      expect(result.output).toContain('fail EXAMPLE-1: not fixable')
      expect(result.output).toContain('native repository conform found failures')
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
      expect(result.output).toContain('warn EXAMPLE-1: nothing safe to propose')
    })
  })

  describe('malformed rubric definitions', () => {
    test('rejects a rubric module with no default export', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: '// missing default export\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric definition export is not a table')
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
      expect(result.output).toContain('rubric definition could not be imported')
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
      expect(result.output).toContain('repair must be a function')
    })

    test('rejects a rubric definition whose declared skill does not match the installed capability', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]', 'ki-other') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric definition skill does not match the installed capability')
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

      expect(result.output).toBe('info B1: B1\ninfo A1: A1\ninfo A2: A2\ninfo C1: C1\n')
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
      expect(result.output).toContain('must have an audit function')
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
      expect(result.output).toContain('rubric item J-1 must have a prompt')
    })

    test('rejects a rubric item with an invalid kind', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'unknown', code: 'X-1', title: 'X' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item X-1 has an invalid kind')
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
        rubric: `export default { contract: 2, skill: 'ki-example', createContext: async () => ({}), families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric definition has an unsupported contract version')
    })

    test('rejects a rubric definition whose createContext is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, skill: 'ki-example', createContext: 'not a function', families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric definition must have a createContext function')
    })

    test('rejects a rubric definition whose families is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, skill: 'ki-example', createContext: async () => ({}), families: 'not an array' }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric definition must have a families array')
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
          `${base}/scripts/rubric/index.ts`,
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

      expect(result).toEqual({
        exitCode: 0,
        output: `info R-1: ki-foundation
info R-1: ki-feature
`
      })
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

      expect(result).toEqual({
        exitCode: 0,
        output: `info R-1: ki-foundation
info R-1: ki-feature
`
      })
    })
  })
})
