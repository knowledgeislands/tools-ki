import { describe, expect, test } from 'vitest'
import { run as runCli } from '../../cli.ts'
import { createContext } from '../../core/context.ts'
import { sandbox } from './_cli_helper.ts'

describe('command-line interface', () => {
  test('rejects an unknown command', async () => {
    const box = await sandbox()
    const unknown = await box.run('ki unknown')

    expect(unknown.exitCode).toBe(2)
  })

  test('creates a context when the caller does not supply one and rethrows unexpected command errors', async () => {
    expect(await runCli(['version'])).toBe(0)
    const box = await sandbox()
    const context = await createContext({
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      executable: box.executable,
      workingDirectory: box.root.path,
      environment: { ...process.env, HOME: box.home.path }
    })
    await expect(
      runCli(['version'], { ...context, stdout: { write: () => Promise.reject(new Error('unexpected output')) } })
    ).rejects.toThrow('unexpected output')
  })
})
