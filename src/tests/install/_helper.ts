import { execFile } from 'node:child_process'
import { generateKeyPairSync, sign } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { onTestFinished } from 'vitest'

const repositoryRoot = new URL('../../../', import.meta.url).pathname
const installerScript = new URL('../../../install.sh', import.meta.url).pathname
const executeFile = promisify(execFile)

export interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

export interface ReleaseFixture {
  readonly baseUrl: string
  readonly publicKey: string
  readonly version: string
  readonly asset: string
  readonly close: () => Promise<void>
}

export interface InstallSandbox {
  readonly path: string
  readonly installer: string
  readonly exec: (
    command: readonly [string, ...string[]],
    options?: { readonly environment?: Record<string, string | undefined> }
  ) => Promise<CommandResult>
  readonly release: (options?: {
    readonly version?: string
    readonly target?: 'darwin-arm64' | 'darwin-x64' | 'linux-x64'
    readonly manifest?: string
    readonly unsigned?: boolean
    readonly corruptArchive?: boolean
  }) => Promise<ReleaseFixture>
}

export const installSandbox = async (): Promise<InstallSandbox> => {
  const path = await mkdtemp(join(tmpdir(), 'ki-install-test-'))
  onTestFinished(() => rm(path, { recursive: true, force: true }))
  const home = join(path, 'home')
  await mkdir(home, { recursive: true })

  const exec = async (
    command: readonly [string, ...string[]],
    { environment = {} }: { readonly environment?: Record<string, string | undefined> } = {}
  ): Promise<CommandResult> => {
    try {
      const result = await executeFile(command[0], command.slice(1), {
        cwd: repositoryRoot,
        // biome-ignore lint/complexity/useLiteralKeys: NodeJS.ProcessEnv declares environment variables through an index signature.
        env: { PATH: process.env['PATH'], TMPDIR: process.env['TMPDIR'], HOME: home, ...environment, _: command[0] }
      })
      return { exitCode: 0, output: `${result.stdout}${result.stderr}` }
    } catch (error: unknown) {
      const result = error as { code?: number; stdout?: string; stderr?: string }
      return { exitCode: result.code ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
    }
  }

  const release = async ({
    version = 'v1.2.3',
    target = 'darwin-arm64',
    manifest,
    unsigned = false,
    corruptArchive = false
  }: {
    readonly version?: string
    readonly target?: 'darwin-arm64' | 'darwin-x64' | 'linux-x64'
    readonly manifest?: string
    readonly unsigned?: boolean
    readonly corruptArchive?: boolean
  } = {}): Promise<ReleaseFixture> => {
    const fixture = join(path, `release-${Math.random().toString(16).slice(2)}`)
    const content = join(fixture, 'content')
    const archiveRoot = join(fixture, 'archive')
    const publicKey = join(fixture, 'public.pem')
    const asset = `ki-${version}-${target}.tar.gz`
    const targets = ['darwin-arm64', 'darwin-x64', 'linux-x64'] as const
    await mkdir(join(archiveRoot, 'man'), { recursive: true })
    await writeFile(join(archiveRoot, 'ki'), `#!/usr/bin/env bash\nprintf '${version.slice(1)}\\n'\n`)
    await chmod(join(archiveRoot, 'ki'), 0o755)
    await writeFile(join(archiveRoot, 'man', 'ki.1'), '.TH KI 1\n')
    await mkdir(content, { recursive: true })
    await executeFile('tar', ['-C', archiveRoot, '-czf', join(content, asset), 'ki', 'man/ki.1'])
    if (corruptArchive) await writeFile(join(content, asset), 'not a tar archive')
    await Promise.all(
      targets
        .filter((candidate) => candidate !== target)
        .map((candidate) => copyFile(join(content, asset), join(content, `ki-${version}-${candidate}.tar.gz`)))
    )
    const hash = String((await executeFile('shasum', ['-a', '256', join(content, asset)])).stdout).split(/\s+/)[0]
    const canonicalManifest = `format=ki-release-checksums-v1\nversion=${version}\n${targets
      .map((candidate) => `${hash}  ki-${version}-${candidate}.tar.gz`)
      .join('\n')}\n`
    const manifestContents = manifest ?? canonicalManifest
    const { privateKey, publicKey: generatedPublicKey } = generateKeyPairSync('ed25519')
    await writeFile(join(content, 'ki-checksums.txt'), manifestContents)
    await writeFile(publicKey, generatedPublicKey.export({ type: 'spki', format: 'pem' }))
    if (!unsigned) {
      await writeFile(join(content, 'ki-checksums.txt.sig'), sign(null, Buffer.from(manifestContents), privateKey))
    }
    const server = createServer(async (request, response) => {
      const requestPath = request.url ?? ''
      if (requestPath === '/releases/latest') {
        response.writeHead(302, { location: `/releases/tag/${version}` })
        response.end()
        return
      }
      if (requestPath === `/releases/tag/${version}`) {
        response.writeHead(200)
        response.end()
        return
      }
      const expectedPrefix = `/releases/download/${version}/`
      if (!requestPath.startsWith(expectedPrefix)) {
        response.writeHead(404)
        response.end()
        return
      }
      const file = requestPath.slice(expectedPrefix.length)
      try {
        const body = await readFile(join(content, file))
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        response.end(body)
      } catch {
        response.writeHead(404)
        response.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not bind TCP')
    const close = async (): Promise<void> =>
      new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    onTestFinished(close)
    return { baseUrl: `http://127.0.0.1:${address.port}`, publicKey, version, asset, close }
  }

  return { path, installer: installerScript, exec, release }
}
