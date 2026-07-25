import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, installHarness, runKiAt, sandbox } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki repo', () => {
  describe('repo audit', () => {
    test("runs only a declared skill's registered native audit operation", async () => {
      const { root, env } = await sandbox()
      const project = join(root, 'project')
      await mkdir(project)
      await writeFile(join(project, '.ki-config.toml'), '[ki-example]\n')
      await installHarness(
        env.XDG_DATA_HOME,
        'export const audit = async ({ capability }) => [{ level: "info", code: "EXAMPLE-1", message: capability.identity }]\n'
      )

      const result = await runKiAt(['repo', 'audit', '--skill', 'ki-example'], project, env)

      expect(result).toEqual({ exitCode: 0, output: 'info EXAMPLE-1: example/harness:ki-example\n' })
    })
  })

  describe('repo conform', () => {
    test('publishes a complete native conform write set, supports dry-run, and re-audits', async () => {
      const { root, env } = await sandbox()
      const project = join(root, 'project')
      await mkdir(project)
      await writeFile(join(project, '.ki-config.toml'), '[ki-example]\n')
      await writeFile(join(project, 'governed.txt'), 'before\n')
      await installHarness(
        env.XDG_DATA_HOME,
        'import { readFile } from "node:fs/promises"\nexport const audit = async ({ repository }) => (await readFile(repository + "/governed.txt", "utf8")) === "after\\n" ? [] : [{ level: "fail", code: "EXAMPLE-1", message: "not conformed" }]\n',
        'export const conform = async () => ({ findings: [], writes: [{ path: "governed.txt", content: "after\\n" }] })\n'
      )

      const dryRun = await runKiAt(['repo', 'conform', '--dry-run'], project, env)
      expect(dryRun).toEqual({ exitCode: 0, output: 'would write governed.txt\n' })
      expect(await readFile(join(project, 'governed.txt'), 'utf8')).toBe('before\n')

      const conformed = await runKiAt(['repo', 'conform'], project, env)
      expect(conformed).toEqual({ exitCode: 0, output: 'write governed.txt\n' })
      expect(await readFile(join(project, 'governed.txt'), 'utf8')).toBe('after\n')
    })
  })

  describe('skill resolution', () => {
    const installSkillsHarness = async (
      data: string,
      specs: readonly { readonly name: string; readonly deps: readonly string[] }[]
    ): Promise<void> => {
      const root = join(data, 'ki', 'harnesses', 'example', 'harness')
      for (const { name, deps } of specs) {
        const directory = join(root, 'skills', name)
        await mkdir(join(directory, 'scripts', 'native'), { recursive: true })
        const list = `[${deps.join(', ')}]`
        await writeFile(join(directory, 'SKILL.md'), `---\nname: ${name}\nki-depends-on: ${list}\n---\n`)
        await writeFile(
          join(directory, 'scripts', 'native', 'audit.mjs'),
          'export const audit = async ({ capability }) => [{ level: "info", code: "R-1", message: capability.identity }]\n'
        )
      }
    }

    test('audits declared skills in dependency order', async () => {
      const { root, data, env } = await sandbox()
      const project = join(root, 'project')
      await mkdir(project)
      await installSkillsHarness(data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await writeFile(join(project, '.ki-config.toml'), '[ki-feature]\n\n[ki-foundation]\n')

      const result = await runKiAt(['repo', 'audit'], project, env)

      expect(result).toEqual({
        exitCode: 0,
        output: 'info R-1: example/harness:ki-foundation\ninfo R-1: example/harness:ki-feature\n'
      })
    })

    test('refuses a declared skill whose dependency is undeclared', async () => {
      const { root, data, env } = await sandbox()
      const project = join(root, 'project')
      await mkdir(project)
      await installSkillsHarness(data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await writeFile(join(project, '.ki-config.toml'), '[ki-feature]\n')

      const result = await runKiAt(['repo', 'audit'], project, env)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('requires declared dependency ki-foundation')
    })

    test('refuses a dependency cycle between declared skills', async () => {
      const { root, data, env } = await sandbox()
      const project = join(root, 'project')
      await mkdir(project)
      await installSkillsHarness(data, [
        { name: 'ki-first', deps: ['ki-second'] },
        { name: 'ki-second', deps: ['ki-first'] }
      ])
      await writeFile(join(project, '.ki-config.toml'), '[ki-first]\n\n[ki-second]\n')

      const result = await runKiAt(['repo', 'audit'], project, env)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has a dependency cycle')
    })
  })
})
