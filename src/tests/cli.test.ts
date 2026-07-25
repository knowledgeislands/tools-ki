import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import packageMetadata from '../../package.json' with { type: 'json' }
import { run as runCli } from '../cli.ts'
import { createContext } from '../core/context.ts'
import { sandbox } from './testkit.ts'

afterEach(sandbox.cleanupAll)

describe('command-line interface', () => {
  test('provide help, version, plural completions, and diagnostics', async () => {
    const box = await sandbox()
    const missingHome = join(box.root.path, 'missing-home')
    const help = await box.run(['--help'])
    const completions = await box.run(['completions', 'zsh'])
    const version = await box.run(['version'])
    const diag = await box.run(['diag'], {
      XDG_DATA_HOME: join(missingHome, 'data'),
      XDG_CONFIG_HOME: join(missingHome, 'config'),
      XDG_CACHE_HOME: join(missingHome, 'cache'),
      XDG_STATE_HOME: join(missingHome, 'state')
    })
    const singular = await box.run(['completion', 'bash'])

    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('acquire')
    expect(completions.output).toContain('#compdef ki')
    expect(version.output).toBe(`ki ${packageMetadata.version}\n`)
    expect(diag.output).toContain(`Executable    ${box.repo.executable}`)
    expect(diag.output).toContain(`Data          ${missingHome}/data/ki`)
    expect(singular.exitCode).toBe(2)
  })

  test('prints the root, nested and unknown-help command interfaces', async () => {
    const box = await sandbox()
    const root = await box.run([])
    const nested = await box.run(['help', 'acquire', 'chatgpt', 'import'])
    const unknown = await box.run(['help', 'missing'])

    expect(root.output).toContain('Usage: ki')
    expect(nested.exitCode).toBe(0)
    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: unknown help topic: missing\n' })
  })

  test('reports every baseline output variant and command grammar errors', async () => {
    const box = await sandbox()
    const environment = {
      XDG_DATA_HOME: join(box.root.path, 'data'),
      XDG_CONFIG_HOME: join(box.root.path, 'config'),
      XDG_CACHE_HOME: join(box.root.path, 'cache'),
      XDG_STATE_HOME: join(box.root.path, 'state')
    }
    const bash = await box.run(['completions', 'bash'])
    const invalidCompletion = await box.run(['completions', 'fish'])
    const diag = await box.run(['diag'], environment)
    const doctor = await box.run(['doctor'], environment)
    const doctorJson = await box.run(['doctor', '--json'], environment)
    const optionVersion = await box.run(['--version'])
    const missingCompletionShell = await box.run(['completions'])
    const unknown = await box.run(['unknown'])

    expect(bash.output).toContain(
      'complete -W "acquire bootstrap completions diag dev doctor harness help repo version --help --version" ki'
    )
    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completions shell must be bash or zsh\n' })
    expect(diag.output).toContain(`Data          ${box.root.path}/data/ki`)
    expect(doctor.output).toContain('KI doctor\n  ✗ Configuration: missing; run ki bootstrap')
    expect(doctorJson.exitCode).toBe(2)
    expect(optionVersion).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
    expect(missingCompletionShell.exitCode).toBe(2)
    expect(unknown.exitCode).toBe(2)
  })

  test('creates a context when the caller does not supply one and rethrows unexpected command errors', async () => {
    expect(await runCli(['version'])).toBe(0)
    const box = await sandbox()
    const context = await createContext({
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      executable: box.repo.executable,
      workingDirectory: box.repo.root,
      environment: { ...process.env, HOME: box.home.path }
    })
    await expect(
      runCli(['version'], { ...context, stdout: { write: () => Promise.reject(new Error('unexpected output')) } })
    ).rejects.toThrow('unexpected output')
  })

  test('distinguishes a linked source installation', async () => {
    const box = await sandbox()
    const installDirectory = join(box.root.path, 'bin')
    const result = await box.exec(['bash', box.repo.installer, '--link'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await box.exec([join(installDirectory, 'ki'), 'diag'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(true)
    expect(doctor.output).toContain('Installation  linked development checkout')
  })

  test('installs a compiled regular executable without Bun at runtime', async () => {
    const box = await sandbox()
    const installDirectory = join(box.root.path, 'bin')
    expect((await box.exec(['bun', 'run', 'build'])).exitCode).toBe(0)
    const result = await box.exec(['bash', box.repo.installer, '--copy'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await box.exec([join(installDirectory, 'ki'), 'diag'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(false)
    expect(doctor.output).toContain('Installation  regular executable')
  })
})
