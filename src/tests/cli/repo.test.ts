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
        audit:
          'import { readFile } from "node:fs/promises"\nexport const audit = async ({ repository }) => (await readFile(repository + "/governed.txt", "utf8")) === "after\\n" ? [] : [{ level: "fail", code: "EXAMPLE-1", message: "not conformed" }]\n',
        conform: 'export const conform = async () => ({ findings: [], writes: [{ path: "governed.txt", content: "after\\n" }] })\n'
      })

      const dryRun = await box.run('ki repo conform --dry-run')
      expect(dryRun).toEqual({ exitCode: 0, output: 'would write governed.txt\n' })
      expect(await box.project.read('governed.txt')).toBe('before\n')

      const conformed = await box.run('ki repo conform')
      expect(conformed).toEqual({ exitCode: 0, output: 'write governed.txt\n' })
      expect(await box.project.read('governed.txt')).toBe('after\n')
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
        await data.write(`${base}/SKILL.md`, `---\nname: ${name}\nki-depends-on: ${list}\n---\n`)
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
      await box.project.write('.ki-config.toml', '[ki-feature]\n\n[ki-foundation]\n')

      const result = await box.run('ki repo audit')

      expect(result).toEqual({
        exitCode: 0,
        output: 'info R-1: example/harness:ki-foundation\ninfo R-1: example/harness:ki-feature\n'
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
      await box.project.write('.ki-config.toml', '[ki-first]\n\n[ki-second]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has a dependency cycle')
    })
  })
})
