import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import packageMetadata from '../../package.json' with { type: 'json' }
import { run as runCli } from '../cli.ts'
import { createContext } from '../core/context.ts'
import { cleanupTemporaryDirectories, executable, installer, repository, runKi, runProcess, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('command-line interface', () => {
  test('provide help, version, plural completions, and diagnostics', async () => {
    const home = await temporaryDirectory()
    const missingHome = join(home, 'missing-home')
    const help = await runKi(['--help'])
    const completions = await runKi(['completions', 'zsh'])
    const version = await runKi(['version'])
    const diag = await runKi(['diag'], {
      XDG_DATA_HOME: join(missingHome, 'data'),
      XDG_CONFIG_HOME: join(missingHome, 'config'),
      XDG_CACHE_HOME: join(missingHome, 'cache'),
      XDG_STATE_HOME: join(missingHome, 'state')
    })
    const singular = await runKi(['completion', 'bash'])

    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('acquire')
    expect(completions.output).toContain('#compdef ki')
    expect(version.output).toBe(`ki ${packageMetadata.version}\n`)
    expect(diag.output).toContain(`Executable    ${executable}`)
    expect(diag.output).toContain(`Data          ${missingHome}/data/ki`)
    expect(singular.exitCode).toBe(2)
  })

  test('prints the root, nested and unknown-help command interfaces', async () => {
    const root = await runKi([])
    const nested = await runKi(['help', 'acquire', 'chatgpt', 'import'])
    const unknown = await runKi(['help', 'missing'])

    expect(root.output).toContain('Usage: ki')
    expect(nested.exitCode).toBe(0)
    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: unknown help topic: missing\n' })
  })

  test('reports every baseline output variant and command grammar errors', async () => {
    const root = await temporaryDirectory()
    const environment = {
      XDG_DATA_HOME: join(root, 'data'),
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_CACHE_HOME: join(root, 'cache'),
      XDG_STATE_HOME: join(root, 'state')
    }
    const bash = await runKi(['completions', 'bash'])
    const invalidCompletion = await runKi(['completions', 'fish'])
    const diag = await runKi(['diag'], environment)
    const doctor = await runKi(['doctor'], environment)
    const doctorJson = await runKi(['doctor', '--json'], environment)
    const optionVersion = await runKi(['--version'])
    const missingCompletionShell = await runKi(['completions'])
    const unknown = await runKi(['unknown'])

    expect(bash.output).toContain(
      'complete -W "acquire bootstrap completions diag dev doctor harness help repo version --help --version" ki'
    )
    expect(invalidCompletion).toEqual({ exitCode: 2, output: 'ki: error: completions shell must be bash or zsh\n' })
    expect(diag.output).toContain(`Data          ${root}/data/ki`)
    expect(doctor.output).toContain('KI doctor\n  ✗ Configuration: missing; run ki bootstrap')
    expect(doctorJson.exitCode).toBe(2)
    expect(optionVersion).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
    expect(missingCompletionShell.exitCode).toBe(2)
    expect(unknown.exitCode).toBe(2)
  })

  test('creates a context when the caller does not supply one and rethrows unexpected command errors', async () => {
    expect(await runCli(['version'])).toBe(0)
    const root = await temporaryDirectory()
    const context = await createContext({
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      executable,
      workingDirectory: repository,
      environment: { ...process.env, HOME: root }
    })
    await expect(
      runCli(['version'], { ...context, stdout: { write: () => Promise.reject(new Error('unexpected output')) } })
    ).rejects.toThrow('unexpected output')
  })

  test('distinguishes a linked source installation', async () => {
    const root = await temporaryDirectory()
    const installDirectory = join(root, 'bin')
    const result = await runProcess(['bash', installer, '--link'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await runProcess([join(installDirectory, 'ki'), 'diag'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(true)
    expect(doctor.output).toContain('Installation  linked development checkout')
  })

  test('installs a compiled regular executable without Bun at runtime', async () => {
    const root = await temporaryDirectory()
    const installDirectory = join(root, 'bin')
    expect((await runProcess(['bun', 'run', 'build'])).exitCode).toBe(0)
    const result = await runProcess(['bash', installer, '--copy'], { KI_CLI_INSTALL_DIR: installDirectory })
    const doctor = await runProcess([join(installDirectory, 'ki'), 'diag'])

    expect(result.exitCode).toBe(0)
    expect((await lstat(join(installDirectory, 'ki'))).isSymbolicLink()).toBe(false)
    expect(doctor.output).toContain('Installation  regular executable')
  })
})
