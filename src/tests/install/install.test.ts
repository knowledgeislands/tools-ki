import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { installSandbox } from './installkit.ts'

describe('install.sh', () => {
  test('prints usage and rejects unknown or excess options', async () => {
    const box = await installSandbox()
    const help = await box.exec([box.installer, '--help'])
    const unknown = await box.exec([box.installer, '--bogus'])
    const excess = await box.exec([box.installer, '--copy', '--link'])

    expect(help).toEqual({ exitCode: 0, output: expect.stringContaining('Usage: ./install.sh [--copy|--link]') })
    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: unknown installer option: --bogus\n' })
    expect(excess).toEqual({ exitCode: 2, output: 'ki: error: installer accepts one option\n' })
  })

  test('copies the compiled executable and manual to the default install directories by default', async () => {
    const box = await installSandbox()
    const installDir = join(box.path, 'bin')
    const shareDir = join(box.path, 'share')
    const result = await box.exec([box.installer], {
      KI_CLI_INSTALL_DIR: installDir,
      KI_MAN_INSTALL_DIR: join(shareDir, 'man', 'man1')
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(`ki: installed ${join(installDir, 'ki')}`)
    expect(result.output).toContain(`ki: installed ${join(shareDir, 'man', 'man1', 'ki.1')}`)
    const version = await box.exec([join(installDir, 'ki'), '--version'])
    expect(version.exitCode).toBe(0)
  })

  test('links the source executable and manual under --link', async () => {
    const box = await installSandbox()
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    const result = await box.exec([box.installer, '--link'], {
      KI_CLI_INSTALL_DIR: installDir,
      KI_MAN_INSTALL_DIR: manDir
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(`ki: linked ${join(installDir, 'ki')} ->`)
    expect(result.output).toContain(`ki: linked ${join(manDir, 'ki.1')} ->`)
  })

  test('honors KI_CLI_SOURCE and fails when the source executable or manual is missing', async () => {
    const box = await installSandbox()
    const missingSource = await box.exec([box.installer], {
      KI_CLI_INSTALL_DIR: join(box.path, 'bin'),
      KI_MAN_INSTALL_DIR: join(box.path, 'man1'),
      KI_CLI_SOURCE: join(box.path, 'no-such-executable')
    })

    expect(missingSource).toEqual({
      exitCode: 1,
      output: `ki: error: source executable not found: ${join(box.path, 'no-such-executable')}\n`
    })
  })

  test('warns when the install directory is not on PATH and stays silent when it is', async () => {
    const box = await installSandbox()
    const installDir = join(box.path, 'bin')
    const notOnPath = await box.exec([box.installer], {
      KI_CLI_INSTALL_DIR: installDir,
      KI_MAN_INSTALL_DIR: join(box.path, 'man1'),
      PATH: '/usr/bin:/bin'
    })
    const onPath = await box.exec([box.installer], {
      KI_CLI_INSTALL_DIR: installDir,
      KI_MAN_INSTALL_DIR: join(box.path, 'man1'),
      PATH: `${installDir}:/usr/bin:/bin`
    })

    expect(notOnPath.output).toContain(`ki: add ${installDir} to PATH to use ki from any directory`)
    expect(onPath.output).not.toContain('add')
  })
})
