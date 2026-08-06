import { access, chmod, copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import packageMetadata from '../../../package.json' with { type: 'json' }
import { installSandbox } from './_helper.ts'

const releaseEnvironment = (
  baseUrl: string,
  publicKey: string,
  extra: Record<string, string> = {}
): Record<string, string> => ({
  KI_INSTALL_TEST_MODE: '1',
  KI_INSTALL_TEST_BASE_URL: baseUrl,
  KI_INSTALL_TEST_PUBLIC_KEY: publicKey,
  ...extra
})

describe('install.sh', () => {
  test('embeds the tracked release signing public key', async () => {
    const [installer, anchor] = await Promise.all([
      readFile(new URL('../../../install.sh', import.meta.url), 'utf8'),
      readFile(new URL('../../../release/ki-release-signing-public.pem', import.meta.url), 'utf8')
    ])

    expect(installer).toContain(anchor.trim())
  })

  test('prints usage and rejects non-version arguments', async () => {
    const box = await installSandbox()
    const help = await box.exec([box.installer, '--help'])
    const unknown = await box.exec([box.installer, '--bogus'])
    const malformed = await box.exec([box.installer, '1.2.3'])

    expect(help).toEqual({ exitCode: 0, output: expect.stringContaining('Usage: ./install.sh [vX.Y.Z]') })
    expect(unknown).toEqual({ exitCode: 2, output: expect.stringContaining('expected an exact version') })
    expect(malformed).toEqual({ exitCode: 2, output: expect.stringContaining('expected an exact version') })
  })

  test('installs an exact signed release for the detected target', async () => {
    const box = await installSandbox()
    const fixture = await box.release({ version: 'v1.2.3', target: 'darwin-arm64' })
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    const result = await box.exec([box.installer, fixture.version], {
      environment: releaseEnvironment(fixture.baseUrl, fixture.publicKey, {
        KI_CLI_INSTALL_DIR: installDir,
        KI_MAN_INSTALL_DIR: manDir,
        KI_INSTALL_TEST_UNAME_S: 'Darwin',
        KI_INSTALL_TEST_UNAME_M: 'arm64'
      })
    })

    expect(result).toEqual({
      exitCode: 0,
      output: expect.stringContaining('installed verified release v1.2.3 (darwin-arm64)')
    })
    expect(await box.exec([join(installDir, 'ki'), '--version'])).toEqual({ exitCode: 0, output: '1.2.3\n' })
    await expect(access(join(manDir, 'ki.1'))).resolves.toBeUndefined()
    expect(await readFile(join(box.path, 'home', '.local', 'state', 'ki', 'installation.toml'), 'utf8')).toContain(
      `executable = "${join(installDir, 'ki')}"`
    )
  })

  test('installs from an installer without a sibling release directory', async () => {
    const box = await installSandbox()
    const fixture = await box.release({ version: 'v1.2.3', target: 'linux-x64' })
    const emptyDirectory = join(box.path, 'empty')
    const installer = join(emptyDirectory, 'install.sh')
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    await mkdir(emptyDirectory)
    await copyFile(box.installer, installer)
    await chmod(installer, 0o755)

    const result = await box.exec([installer, fixture.version], {
      environment: releaseEnvironment(fixture.baseUrl, fixture.publicKey, {
        KI_CLI_INSTALL_DIR: installDir,
        KI_MAN_INSTALL_DIR: manDir,
        KI_INSTALL_TEST_UNAME_S: 'Linux',
        KI_INSTALL_TEST_UNAME_M: 'x86_64'
      })
    })

    expect(result).toEqual({
      exitCode: 0,
      output: expect.stringContaining('installed verified release v1.2.3 (linux-x64)')
    })
    expect(await box.exec([join(installDir, 'ki'), '--version'])).toEqual({ exitCode: 0, output: '1.2.3\n' })
  })

  test('rejects a release signed by a substituted test key', async () => {
    const box = await installSandbox()
    const release = await box.release({ version: 'v1.2.3', target: 'linux-x64' })
    const substitutedKey = await box.release({ version: 'v1.2.3', target: 'linux-x64' })
    const result = await box.exec([box.installer, release.version], {
      environment: releaseEnvironment(release.baseUrl, substitutedKey.publicKey, {
        KI_CLI_INSTALL_DIR: join(box.path, 'bin'),
        KI_MAN_INSTALL_DIR: join(box.path, 'man1'),
        KI_INSTALL_TEST_UNAME_S: 'Linux',
        KI_INSTALL_TEST_UNAME_M: 'x86_64'
      })
    })

    expect(result).toEqual({
      exitCode: 1,
      output: expect.stringContaining('release manifest signature could not be verified')
    })
    await expect(access(join(box.path, 'bin', 'ki'))).rejects.toThrow()
  })

  test('resolves latest to an exact immutable release before downloading assets', async () => {
    const box = await installSandbox()
    const fixture = await box.release({ version: 'v2.3.4', target: 'linux-x64' })
    const result = await box.exec([box.installer], {
      environment: releaseEnvironment(fixture.baseUrl, fixture.publicKey, {
        KI_CLI_INSTALL_DIR: join(box.path, 'bin'),
        KI_MAN_INSTALL_DIR: join(box.path, 'man1'),
        KI_INSTALL_TEST_UNAME_S: 'Linux',
        KI_INSTALL_TEST_UNAME_M: 'x86_64'
      })
    })

    expect(result).toEqual({ exitCode: 0, output: expect.stringContaining('v2.3.4 (linux-x64)') })
  })

  test('rejects unsigned, malformed, or checksum-mismatched releases before changing an existing install', async () => {
    const box = await installSandbox()
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    await Promise.all([
      writeFile(join(box.path, 'old-ki'), 'old executable\n'),
      writeFile(join(box.path, 'old-man'), 'old manual\n')
    ])
    await box.exec(['mkdir', '-p', installDir, manDir])
    await Promise.all([
      writeFile(join(installDir, 'ki'), 'old executable\n'),
      writeFile(join(manDir, 'ki.1'), 'old manual\n')
    ])
    const fixtures = await Promise.all([
      box.release({ unsigned: true }),
      box.release({ manifest: 'format=ki-release-checksums-v1\nversion=v1.2.3\nnot a checksum\n' }),
      box.release({
        manifest:
          'format=ki-release-checksums-v1\nversion=v1.2.3\n0000000000000000000000000000000000000000000000000000000000000000  ki-v1.2.3-darwin-arm64.tar.gz\n0000000000000000000000000000000000000000000000000000000000000000  ki-v1.2.3-darwin-x64.tar.gz\n0000000000000000000000000000000000000000000000000000000000000000  ki-v1.2.3-linux-x64.tar.gz\n'
      })
    ])

    for (const fixture of fixtures) {
      const result = await box.exec([box.installer, fixture.version], {
        environment: releaseEnvironment(fixture.baseUrl, fixture.publicKey, {
          KI_CLI_INSTALL_DIR: installDir,
          KI_MAN_INSTALL_DIR: manDir,
          KI_INSTALL_TEST_UNAME_S: 'Darwin',
          KI_INSTALL_TEST_UNAME_M: 'arm64'
        })
      })
      expect(result.exitCode).toBe(1)
      expect(await readFile(join(installDir, 'ki'), 'utf8')).toBe('old executable\n')
      expect(await readFile(join(manDir, 'ki.1'), 'utf8')).toBe('old manual\n')
    }
  })

  test('rolls back an existing executable if manual replacement fails', async () => {
    const box = await installSandbox()
    const fixture = await box.release()
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    await box.exec(['mkdir', '-p', installDir, manDir])
    await Promise.all([
      writeFile(join(installDir, 'ki'), 'old executable\n'),
      writeFile(join(manDir, 'ki.1'), 'old manual\n')
    ])
    const result = await box.exec([box.installer, fixture.version], {
      environment: releaseEnvironment(fixture.baseUrl, fixture.publicKey, {
        KI_CLI_INSTALL_DIR: installDir,
        KI_MAN_INSTALL_DIR: manDir,
        KI_INSTALL_TEST_UNAME_S: 'Darwin',
        KI_INSTALL_TEST_UNAME_M: 'arm64',
        KI_INSTALL_TEST_FAIL_MAN_REPLACE: '1'
      })
    })

    expect(result).toEqual({ exitCode: 1, output: expect.stringContaining('restored previous installation') })
    expect(await readFile(join(installDir, 'ki'), 'utf8')).toBe('old executable\n')
    expect(await readFile(join(manDir, 'ki.1'), 'utf8')).toBe('old manual\n')
  })

  test('removes a newly installed executable when manual replacement fails without a prior install', async () => {
    const box = await installSandbox()
    const fixture = await box.release()
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    const result = await box.exec([box.installer, fixture.version], {
      environment: releaseEnvironment(fixture.baseUrl, fixture.publicKey, {
        KI_CLI_INSTALL_DIR: installDir,
        KI_MAN_INSTALL_DIR: manDir,
        KI_INSTALL_TEST_UNAME_S: 'Darwin',
        KI_INSTALL_TEST_UNAME_M: 'arm64',
        KI_INSTALL_TEST_FAIL_MAN_REPLACE: '1'
      })
    })

    expect(result).toEqual({ exitCode: 1, output: expect.stringContaining('restored previous installation') })
    await expect(access(join(installDir, 'ki'))).rejects.toThrow()
    await expect(access(join(manDir, 'ki.1'))).rejects.toThrow()
  })

  test('links a Bun launcher to this checkout source entry for local development', async () => {
    const box = await installSandbox()
    const installDir = join(box.path, 'bin')
    const manDir = join(box.path, 'man1')
    const result = await box.exec([box.installer, '--link'], {
      environment: { KI_CLI_INSTALL_DIR: installDir, KI_MAN_INSTALL_DIR: manDir }
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('src/main.ts')
    expect((await lstat(join(installDir, 'ki'))).isSymbolicLink()).toBe(true)
    expect(await box.exec([join(installDir, 'ki'), '--version'])).toEqual({
      exitCode: 0,
      output: `${packageMetadata.version}\n`
    })
  })
})
