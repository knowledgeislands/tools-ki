import { lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, installBootstrapHarness, installHarness, runKi, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki skill', () => {
  const bootstrapClaudeCode = async (
    root: string
  ): Promise<{
    readonly home: string
    readonly configuration: string
    readonly data: string
    readonly environment: Record<string, string>
  }> => {
    const home = join(root, 'home')
    const configuration = join(root, 'config')
    const data = join(root, 'data')
    await mkdir(join(home, '.claude'), { recursive: true })
    await installBootstrapHarness(data)
    await installHarness(data)
    const environment = { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data }
    await runKi(['bootstrap'], environment)
    return { home, configuration, data, environment }
  }

  describe('user scope', () => {
    test('links and declares a user skill, then unlinks and undeclares it', async () => {
      const root = await temporaryDirectory()
      const { home, configuration, data, environment } = await bootstrapClaudeCode(root)
      const configurationFile = join(configuration, 'ki', 'config.toml')
      const link = join(home, '.claude', 'skills', 'ki-example')
      const source = join(data, 'ki', 'harnesses', 'example', 'harness', 'skills', 'ki-example')

      const added = await runKi(['skill', 'user', 'add', 'ki-example'], environment)
      expect(added).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await realpath(link)).toBe(await realpath(source))
      expect(await readFile(configurationFile, 'utf8')).toContain('[skills.ki-example]\nharness = "example/harness"')

      const removed = await runKi(['skill', 'user', 'remove', 'ki-example'], environment)
      expect(removed).toEqual({ exitCode: 0, output: 'ki skill user remove: unlinked ki-example for claude-code\n' })
      await expect(lstat(link)).rejects.toThrow()
      expect(await readFile(configurationFile, 'utf8')).not.toContain('ki-example')

      const repeated = await runKi(['skill', 'user', 'remove', 'ki-example'], environment)
      expect(repeated).toEqual({ exitCode: 0, output: 'ki skill user remove: no KI-managed link for ki-example for claude-code\n' })
    })

    test('re-points a divergent KI-managed user link only under --replace', async () => {
      const root = await temporaryDirectory()
      const { home, data, environment } = await bootstrapClaudeCode(root)
      const decoy = join(root, 'decoy')
      await mkdir(decoy, { recursive: true })
      const link = join(home, '.claude', 'skills', 'ki-example')
      await symlink(decoy, link, 'dir')

      const refused = await runKi(['skill', 'user', 'add', 'ki-example'], environment)
      expect(refused.exitCode).toBe(1)
      expect(refused.output).toContain('points elsewhere; pass --replace to re-point')
      expect(await realpath(link)).toBe(await realpath(decoy))

      const replaced = await runKi(['skill', 'user', 'add', 'ki-example', '--replace'], environment)
      expect(replaced).toEqual({ exitCode: 0, output: 'ki skill user add: linked ki-example for claude-code\n' })
      expect(await realpath(link)).toBe(await realpath(join(data, 'ki', 'harnesses', 'example', 'harness', 'skills', 'ki-example')))
    })

    test('refuses to adopt a foreign user skill directory', async () => {
      const root = await temporaryDirectory()
      const { home, environment } = await bootstrapClaudeCode(root)
      await mkdir(join(home, '.claude', 'skills', 'ki-example'), { recursive: true })

      const guarded = await runKi(['skill', 'user', 'add', 'ki-example'], environment)
      expect(guarded.exitCode).toBe(1)
      expect(guarded.output).toContain('is not KI-managed')
    })
  })

  describe('repository scope', () => {
    test('links and declares a repository skill, then removes and undeclares it', async () => {
      const root = await temporaryDirectory()
      const { environment } = await bootstrapClaudeCode(root)
      const project = join(root, 'project')
      await mkdir(project, { recursive: true })
      await writeFile(join(project, '.ki-config.toml'), '# project declarations\n')
      const projectRoot = await realpath(project)
      const link = join(projectRoot, '.claude', 'skills', 'ki-example')

      const added = await runKi(['skill', 'repo', 'add', 'ki-example', '--repo', project], environment)
      expect(added).toEqual({ exitCode: 0, output: `ki skill repo add: linked ki-example into ${projectRoot} for claude-code\n` })
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await readFile(join(project, '.ki-config.toml'), 'utf8')).toContain('[ki-example]')

      const removed = await runKi(['skill', 'repo', 'remove', 'ki-example', '--repo', project], environment)
      expect(removed).toEqual({ exitCode: 0, output: `ki skill repo remove: removed ki-example in ${projectRoot} for claude-code\n` })
      await expect(lstat(link)).rejects.toThrow()
      expect(await readFile(join(project, '.ki-config.toml'), 'utf8')).not.toContain('[ki-example]')

      const repeated = await runKi(['skill', 'repo', 'remove', 'ki-example', '--repo', project], environment)
      expect(repeated).toEqual({
        exitCode: 0,
        output: `ki skill repo remove: no KI-managed link or declaration for ki-example in ${projectRoot} for claude-code\n`
      })
    })
  })
})
