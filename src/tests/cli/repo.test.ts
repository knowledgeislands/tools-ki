import { describe, expect, test } from 'vitest'
import { sandbox, type SandboxArea } from './_cli_helper.ts'

describe('[ki repo]', () => {
  describe('repo audit', () => {
    test("runs only a declared skill's registered native audit operation", async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        audit: 'export const audit = async ({ capability }) => [{ level: "info", code: "EXAMPLE-1", message: capability.identity }]\n'
      })

      const result = await box.run('ki repo audit --skill ki-example')

      expect(result).toEqual({ exitCode: 0, output: 'info EXAMPLE-1: example/harness:ki-example\n' })
    })
  })

  describe('repo conform', () => {
    test('publishes a complete native conform write set, supports dry-run, and re-audits', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        audit: `import { readFile } from "node:fs/promises"
export const audit = async ({ repository }) => (await readFile(repository + "/governed.txt", "utf8")) === "after\\n" ? [] : [{ level: "fail", code: "EXAMPLE-1", message: "not conformed" }]
`,
        conform: 'export const conform = async () => ({ findings: [], writes: [{ path: "governed.txt", content: "after\\n" }] })\n'
      })

      const dryRun = await box.run('ki repo conform --dry-run')
      const beforeContent = await box.project.read('governed.txt')
      expect(dryRun).toEqual({ exitCode: 0, output: 'would write governed.txt\n' })
      expect(beforeContent).toBe('before\n')

      const conformed = await box.run('ki repo conform')
      const afterContent = await box.project.read('governed.txt')
      expect(conformed).toEqual({ exitCode: 0, output: 'write governed.txt\n' })
      expect(afterContent).toBe('after\n')
    })

    test('fails when re-audit after conform finds issues', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.project.write('governed.txt', 'before\n')
      await box.setupExampleHarness({
        audit: 'export const audit = async () => [{ level: "fail", code: "EXAMPLE-1", message: "always fails" }]\n',
        conform: 'export const conform = async () => ({ findings: [], writes: [{ path: "governed.txt", content: "after\\n" }] })\n'
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('fail EXAMPLE-1: always fails')
      expect(result.output).toContain('re-audit found failures')
    })
  })

  describe('conform with missing operations', () => {
    test('handles skill without conform operation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        audit: 'export const audit = async () => []\n'
        // No conform operation
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not register a native conform operation')
    })
  })

  describe('malformed operations', () => {
    test('rejects audit operation with missing export', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        audit: '// missing export\n'
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('is not a function')
    })

    test('rejects audit operation returning non-array findings', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        audit: 'export const audit = async () => ({ level: "info" })\n'
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must return')
    })

    test('rejects conform operation returning malformed writes', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        conform: 'export const conform = async () => ({ findings: [], writes: "not an array" })\n'
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must return')
    })

    test('rejects audit operation with malformed finding shape', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '[ki-example]\n')
      await box.setupExampleHarness({
        audit: 'export const audit = async () => [{ level: "info" }]\n'  // missing code and message
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must have a code')
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
          `${base}/scripts/native/audit.mjs`,
          'export const audit = async ({ capability }) => [{ level: "info", code: "R-1", message: capability.identity }]\n'
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
        output: `info R-1: example/harness:ki-foundation
info R-1: example/harness:ki-feature
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
  })
})
