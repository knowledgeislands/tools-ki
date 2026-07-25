import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, installHarness, runKiAt, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki repo', () => {
  describe('repo audit', () => {
    test("runs only a declared skill's registered native audit operation", async () => {
      const root = await temporaryDirectory()
      const home = join(root, 'home')
      const data = join(root, 'data')
      const project = join(root, 'project')
      await mkdir(home)
      await mkdir(project)
      await writeFile(join(project, '.ki-config.toml'), '[ki-example]\n')
      await installHarness(
        data,
        'export const audit = async ({ capability }) => [{ level: "info", code: "EXAMPLE-1", message: capability.identity }]\n'
      )

      const result = await runKiAt(['repo', 'audit', '--skill', 'ki-example'], project, { HOME: home, XDG_DATA_HOME: data })

      expect(result).toEqual({ exitCode: 0, output: 'info EXAMPLE-1: example/harness:ki-example\n' })
    })
  })

  describe('repo conform', () => {
    test('publishes a complete native conform write set, supports dry-run, and re-audits', async () => {
      const root = await temporaryDirectory()
      const home = join(root, 'home')
      const data = join(root, 'data')
      const project = join(root, 'project')
      await mkdir(home)
      await mkdir(project)
      await writeFile(join(project, '.ki-config.toml'), '[ki-example]\n')
      await writeFile(join(project, 'governed.txt'), 'before\n')
      await installHarness(
        data,
        'import { readFile } from "node:fs/promises"\nexport const audit = async ({ repository }) => (await readFile(repository + "/governed.txt", "utf8")) === "after\\n" ? [] : [{ level: "fail", code: "EXAMPLE-1", message: "not conformed" }]\n',
        'export const conform = async () => ({ findings: [], writes: [{ path: "governed.txt", content: "after\\n" }] })\n'
      )

      const dryRun = await runKiAt(['repo', 'conform', '--dry-run'], project, { HOME: home, XDG_DATA_HOME: data })
      expect(dryRun).toEqual({ exitCode: 0, output: 'would write governed.txt\n' })
      expect(await readFile(join(project, 'governed.txt'), 'utf8')).toBe('before\n')

      const conformed = await runKiAt(['repo', 'conform'], project, { HOME: home, XDG_DATA_HOME: data })
      expect(conformed).toEqual({ exitCode: 0, output: 'write governed.txt\n' })
      expect(await readFile(join(project, 'governed.txt'), 'utf8')).toBe('after\n')
    })
  })
})
