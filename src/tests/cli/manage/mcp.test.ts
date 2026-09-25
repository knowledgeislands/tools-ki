import { mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

interface ReleaseFixture {
  readonly commit?: string
  readonly origin?: string
  readonly tagType?: string
  readonly head?: string
  readonly declaration?: string
  readonly symlinkDeclaration?: boolean
  readonly packageJson?: string
  readonly symlinkPackage?: boolean
  readonly packageVersion?: string
  readonly packageMain?: string
  readonly build?: string
  readonly lockfile?: false | 'bun.lock' | 'bun.lockb' | 'symlink'
  readonly failInstall?: boolean
  readonly failBuild?: boolean
  readonly omitEntry?: boolean
  readonly symlinkEntry?: boolean
}

const defaultCommit = 'a'.repeat(40)

const sourceRunner = (
  releases: Readonly<Record<string, ReleaseFixture>>,
  calls: string[],
  latestPrivate = 'v1.0.0'
) => {
  const stagedTags = new Map<string, string>()
  return async (command: string, arguments_: readonly string[]) => {
    calls.push([command, ...arguments_].join(' '))
    if (command === 'gh' && arguments_[0] === 'api') return { exitCode: 0, output: `${latestPrivate}\n` }
    const gitClone = command === 'git' && arguments_[1] === 'clone'
    const githubCliClone = command === 'gh' && arguments_[0] === 'repo' && arguments_[1] === 'clone'
    if (gitClone || githubCliClone) {
      const tag = arguments_[arguments_.indexOf('--branch') + 1] as string
      const target = (githubCliClone ? arguments_[3] : arguments_.at(-1)) as string
      const fixture = releases[tag] ?? {}
      stagedTags.set(target, tag)
      await mkdir(target, { recursive: true })
      const declaration =
        fixture.declaration ?? '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n\n[skills.ki-repo-mcp]\n'
      if (fixture.symlinkDeclaration) {
        await writeFile(join(target, 'declaration-target'), declaration)
        await symlink('declaration-target', join(target, '.ki.toml'))
      } else await writeFile(join(target, '.ki.toml'), declaration)
      const packageJson =
        fixture.packageJson ??
        JSON.stringify({
          version: fixture.packageVersion ?? tag.slice(1),
          main: fixture.packageMain ?? 'dist/mcp-server/index.js',
          scripts: fixture.build === '' ? {} : { build: fixture.build ?? 'build' }
        })
      if (fixture.symlinkPackage) {
        await writeFile(join(target, 'package-target.json'), packageJson)
        await symlink('package-target.json', join(target, 'package.json'))
      } else await writeFile(join(target, 'package.json'), packageJson)
      if (fixture.lockfile === 'symlink') await symlink('package.json', join(target, 'bun.lock'))
      else if (fixture.lockfile !== false) await writeFile(join(target, fixture.lockfile ?? 'bun.lock'), 'lock')
      return { exitCode: 0, output: '' }
    }
    if (command === 'git' && arguments_[1] === '-C') {
      const root = arguments_[2] as string
      const tag = stagedTags.get(root) ?? 'v1.0.0'
      const fixture = releases[tag] ?? {}
      const operation = arguments_[3]
      if (operation === 'remote')
        return { exitCode: 0, output: `${fixture.origin ?? 'https://github.com/example/server.git'}\n` }
      if (operation === 'cat-file') return { exitCode: 0, output: `${fixture.tagType ?? 'tag'}\n` }
      if (operation === 'rev-parse') {
        const selected = arguments_[4]
        return {
          exitCode: 0,
          output: `${selected === 'HEAD' ? (fixture.head ?? fixture.commit ?? defaultCommit) : (fixture.commit ?? defaultCommit)}\n`
        }
      }
    }
    if (command === 'bun') {
      const root = arguments_[1] as string
      const fixture = releases[stagedTags.get(root) ?? ''] ?? {}
      if (arguments_[2] === 'install') return { exitCode: fixture.failInstall ? 1 : 0, output: 'secret-build-output' }
      if (fixture.failBuild) return { exitCode: 1, output: 'secret-build-output' }
      if (!fixture.omitEntry) {
        await mkdir(join(root, 'dist/mcp-server'), { recursive: true })
        if (fixture.symlinkEntry) await symlink('../../package.json', join(root, 'dist/mcp-server/index.js'))
        else await writeFile(join(root, 'dist/mcp-server/index.js'), 'server')
      }
      return { exitCode: 0, output: '' }
    }
    return { exitCode: 1, output: 'unexpected command' }
  }
}

describe('[ki manage mcp]', () => {
  test('installs an exact source release and exposes path-free provenance', async () => {
    const box = await sandbox()
    const calls: string[] = []
    box.setRunner(sourceRunner({ 'v1.2.3': { commit: defaultCommit } }, calls))

    expect(
      await box.run('ki manage mcp install example/server 1.2.3', { now: () => Date.parse('2026-09-25T00:00:00Z') })
    ).toEqual({
      exitCode: 0,
      output: `MCP source installed: example/server 1.2.3 (${defaultCommit})\n`
    })
    expect(
      await box.run('ki manage mcp install example/server 1.2.3', { now: () => Date.parse('2026-09-25T00:00:00Z') })
    ).toEqual({
      exitCode: 0,
      output: `MCP source installed: example/server 1.2.3 (${defaultCommit})\n`
    })
    const listed = await box.run('ki manage mcp list example/server --format json')
    const report = JSON.parse(listed.output)

    expect(listed.exitCode).toBe(0)
    expect(report).toEqual({
      schema: 'ki/mcp-sources/v1',
      installations: [
        {
          schema: 'ki/mcp-source/v1',
          repository: 'example/server',
          tag: 'v1.2.3',
          commit: defaultCommit,
          packageVersion: '1.2.3',
          entryPoint: 'dist/mcp-server/index.js',
          installedAt: '2026-09-25T00:00:00Z',
          auth: 'public',
          active: true
        }
      ]
    })
    expect(listed.output).not.toContain(box.data.path)
    expect(calls.some((call) => call.startsWith('gh '))).toBe(false)
    expect(
      calls.some((call) => call.startsWith(`bun --cwd ${box.data.path}/ki/mcp/example/server/versions/.install-`))
    ).toBe(true)
  })

  test('updates from latest stable release, rolls back without execution, and uninstalls', async () => {
    const box = await sandbox()
    const calls: string[] = []
    box.setRunner(sourceRunner({ 'v1.0.0': { commit: '1'.repeat(40) }, 'v2.0.0': { commit: '2'.repeat(40) } }, calls))
    box.setFetcher(async () => new Response(JSON.stringify({ tag_name: 'v2.0.0' }), { status: 200 }))

    expect((await box.run('ki manage mcp update example/server')).exitCode).toBe(1)
    expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    expect((await box.run('ki manage mcp update example/server')).exitCode).toBe(0)
    expect((await box.run('ki manage mcp list')).output.split('\n')).toEqual([
      `- example/server 1.0.0 ${'1'.repeat(40)}`,
      `* example/server 2.0.0 ${'2'.repeat(40)}`,
      ''
    ])

    const callsBeforeRollback = calls.length
    expect(await box.run('ki manage mcp rollback example/server 1.0.0')).toEqual({
      exitCode: 0,
      output: `MCP source rolled back: example/server 1.0.0 (${'1'.repeat(40)})\n`
    })
    expect(calls).toHaveLength(callsBeforeRollback)
    expect((await box.run('ki manage mcp rollback example/server 9.0.0')).exitCode).toBe(1)
    expect(await box.run('ki manage mcp uninstall example/server')).toEqual({
      exitCode: 0,
      output: 'MCP source uninstalled: example/server\n'
    })
    expect(await box.run('ki manage mcp list --format json')).toEqual({
      exitCode: 0,
      output: '{\n  "schema": "ki/mcp-sources/v1",\n  "installations": []\n}\n'
    })
    expect(await box.run('ki manage mcp list')).toEqual({ exitCode: 0, output: '' })
  })

  test('uses explicit GitHub CLI authentication without leaking command output', async () => {
    const box = await sandbox()
    const calls: string[] = []
    box.setRunner(sourceRunner({ 'v1.0.0': {} }, calls))

    expect((await box.run('ki manage mcp install example/server --auth github-cli')).exitCode).toBe(0)
    expect(calls[0]).toBe('gh api repos/example/server/releases/latest --jq .tag_name')
    expect(calls.some((call) => call.startsWith('gh repo clone example/server '))).toBe(true)
    expect(calls.some((call) => call.startsWith('git --no-optional-locks clone'))).toBe(false)
    expect((await box.run('ki manage mcp update example/server 1.0.0 --auth github-cli')).exitCode).toBe(0)

    const failed = await sandbox()
    failed.setRunner(async () => ({ exitCode: 1, output: 'ghp_do-not-leak' }))
    const result = await failed.run('ki manage mcp install example/server --auth github-cli')
    expect(result.output).toBe(
      'ki: error: could not resolve private GitHub release; install gh and run gh auth login\n'
    )
    expect(result.output).not.toContain('ghp_do-not-leak')
  })

  test('preserves the active version when a replacement build fails', async () => {
    const box = await sandbox()
    const calls: string[] = []
    const releases = {
      'v1.0.0': { commit: '1'.repeat(40) },
      'v2.0.0': { commit: '2'.repeat(40), failBuild: true }
    }
    box.setRunner(sourceRunner(releases, calls))

    expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    const failure = await box.run('ki manage mcp update example/server 2.0.0')
    expect(failure).toEqual({
      exitCode: 1,
      output: 'ki: error: could not build MCP source example/server\n'
    })
    expect(failure.output).not.toContain('secret-build-output')
    expect((await box.run('ki manage mcp list')).output).toBe(`* example/server 1.0.0 ${'1'.repeat(40)}\n`)
    expect(
      (await readdir(`${box.data.path}/ki/mcp/example/server/versions`)).some((name) => name.startsWith('.install-'))
    ).toBe(false)
  })

  test('removes a failed initial installation so a corrected release can be retried', async () => {
    const box = await sandbox()
    const releases: Record<string, ReleaseFixture> = { 'v1.0.0': { failBuild: true } }
    box.setRunner(sourceRunner(releases, []))

    expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(1)
    releases['v1.0.0'] = {}
    expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
  })

  test.each([
    ['Example/server', 'MCP repository must be a lower-case owner/repository identifier', undefined],
    ['example/server', 'MCP version must be valid Semantic Versioning without a v prefix', 'v1.0.0'],
    ['example/server', 'MCP version must be valid Semantic Versioning without a v prefix', '1.0.0-01']
  ])('rejects invalid identity or version %s', async (repository, message, version) => {
    const box = await sandbox()
    const result = await box.run(`ki manage mcp install ${repository}${version ? ` ${version}` : ' 1.0.0'}`)
    expect(result).toEqual({ exitCode: 2, output: `ki: error: ${message}\n` })
  })

  test('rejects invalid latest-release responses and source evidence', async () => {
    const malformed = await sandbox()
    malformed.setFetcher(async () => new Response('{', { status: 200 }))
    expect((await malformed.run('ki manage mcp install example/server')).output).toContain('not valid JSON')

    const prerelease = await sandbox()
    prerelease.setFetcher(async () => new Response(JSON.stringify({ tag_name: 'v1.0.0-rc.1' }), { status: 200 }))
    expect((await prerelease.run('ki manage mcp install example/server')).output).toContain('must not be a prerelease')

    const latestFailures: readonly [unknown, string][] = [
      [{ tag_name: '1.0.0' }, 'must use a v<SemVer> tag'],
      [{ tag_name: 'v1.0.0-01' }, 'must use a v<SemVer> tag'],
      [{}, 'has no tag'],
      [null, 'has no tag'],
      ['not-an-object', 'has no tag']
    ]
    for (const [payload, message] of latestFailures) {
      const box = await sandbox()
      box.setFetcher(async () => new Response(JSON.stringify(payload), { status: 200 }))
      expect((await box.run('ki manage mcp install example/server')).output).toContain(message)
    }

    const unavailable = await sandbox()
    unavailable.setFetcher(async () => new Response('', { status: 404 }))
    expect((await unavailable.run('ki manage mcp install example/server')).output).toContain('HTTP 404')

    const networkFailure = await sandbox()
    networkFailure.setFetcher(async () => {
      throw new Error('secret-network-detail')
    })
    const networkResult = await networkFailure.run('ki manage mcp install example/server')
    expect(networkResult.output).toContain('could not resolve latest GitHub release')
    expect(networkResult.output).not.toContain('secret-network-detail')

    const cases: readonly [ReleaseFixture, string][] = [
      [{ origin: 'https://github.com/example/other.git' }, 'origin does not match'],
      [{ origin: 'https://gitlab.com/example/server.git' }, 'origin does not match'],
      [{ tagType: 'commit' }, 'must be an annotated tag'],
      [{ commit: 'short' }, 'must resolve to a full commit'],
      [{ commit: '1'.repeat(40), head: '2'.repeat(40) }, 'checkout does not match'],
      [{ declaration: '[repo]\n' }, 'must declare [skills.ki-repo-mcp]'],
      [{ symlinkDeclaration: true }, '.ki.toml must be a regular file'],
      [{ declaration: '[skills]\nki-repo-mcp = []\n' }, 'must declare [skills.ki-repo-mcp]'],
      [{ declaration: 'not = [' }, '.ki.toml must be valid TOML'],
      [{ packageJson: '{' }, 'package.json must be valid JSON'],
      [{ packageJson: '[]' }, 'package.json must be an object'],
      [{ symlinkPackage: true }, 'package.json must be a regular file'],
      [
        { packageJson: JSON.stringify({ version: '1.0.0', main: 'dist/mcp-server/index.js', scripts: [] }) },
        'must declare a build script'
      ],
      [{ packageVersion: '2.0.0' }, 'package version must match'],
      [{ build: '' }, 'must declare a build script'],
      [{ build: '   ' }, 'must declare a build script'],
      [{ packageMain: 'wrong.js' }, 'main must be'],
      [{ lockfile: false }, 'must contain a committed Bun lockfile'],
      [{ lockfile: 'symlink' }, 'must contain a committed Bun lockfile'],
      [{ omitEntry: true }, 'built MCP source entry point must be a regular file'],
      [{ symlinkEntry: true }, 'built MCP source entry point must be a regular file']
    ]
    for (const [fixture, message] of cases) {
      const box = await sandbox()
      box.setRunner(sourceRunner({ 'v1.0.0': fixture }, []))
      expect((await box.run('ki manage mcp install example/server 1.0.0')).output).toContain(message)
    }

    for (const origin of ['git@github.com:example/server.git', 'ssh://git@github.com/example/server.git']) {
      const box = await sandbox()
      box.setRunner(sourceRunner({ 'v1.0.0': { origin } }, []))
      expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    }
  })

  test('sanitises thrown source and authentication runner failures', async () => {
    const clone = await sandbox()
    clone.setRunner(async () => {
      throw new Error('secret-clone-detail')
    })
    const cloneResult = await clone.run('ki manage mcp install example/server 1.0.0')
    expect(cloneResult.output).toBe('ki: error: could not clone MCP source example/server\n')
    expect(cloneResult.output).not.toContain('secret-clone-detail')

    const authenticated = await sandbox()
    authenticated.setRunner(async () => {
      throw new Error('secret-gh-detail')
    })
    const authenticatedResult = await authenticated.run('ki manage mcp install example/server --auth github-cli')
    expect(authenticatedResult.output).toContain('install gh and run gh auth login')
    expect(authenticatedResult.output).not.toContain('secret-gh-detail')

    const empty = await sandbox()
    empty.setRunner(async () => ({ exitCode: 0, output: '' }))
    expect((await empty.run('ki manage mcp install example/server --auth github-cli')).output).toContain(
      'install gh and run gh auth login'
    )
  })

  test('rejects malformed retained receipts and mismatched provenance', async () => {
    const validReceipt = {
      schema: 'ki/mcp-source/v1',
      repository: 'example/server',
      tag: 'v1.0.0',
      commit: defaultCommit,
      packageVersion: '1.0.0',
      entryPoint: 'dist/mcp-server/index.js',
      installedAt: '2026-09-25T00:00:00Z',
      auth: 'public'
    }
    const cases: readonly [unknown, string][] = [
      [null, 'receipt is invalid'],
      [[], 'receipt is invalid'],
      [{ ...validReceipt, schema: 'wrong' }, 'receipt is invalid'],
      [{ ...validReceipt, repository: 1 }, 'receipt is invalid'],
      [{ ...validReceipt, tag: 1 }, 'receipt is invalid'],
      [{ ...validReceipt, commit: 1 }, 'receipt is invalid'],
      [{ ...validReceipt, packageVersion: 1 }, 'receipt is invalid'],
      [{ ...validReceipt, entryPoint: 'wrong.js' }, 'receipt is invalid'],
      [{ ...validReceipt, installedAt: 1 }, 'receipt is invalid'],
      [{ ...validReceipt, auth: 'token' }, 'receipt is invalid'],
      [{ ...validReceipt, repository: 'Example/server' }, 'lower-case owner/repository'],
      [{ ...validReceipt, packageVersion: 'v1.0.0' }, 'valid Semantic Versioning'],
      [{ ...validReceipt, tag: 'v2.0.0' }, 'receipt provenance is invalid'],
      [{ ...validReceipt, commit: 'short' }, 'receipt provenance is invalid'],
      [{ ...validReceipt, repository: 'other/server' }, 'receipt does not match its path']
    ]
    for (const [receipt, message] of cases) {
      const box = await sandbox()
      box.setRunner(sourceRunner({ 'v1.0.0': { commit: defaultCommit } }, []))
      expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
      await writeFile(
        `${box.data.path}/ki/mcp/example/server/versions/v1.0.0-${defaultCommit}/receipt.json`,
        `${JSON.stringify(receipt)}\n`
      )
      expect((await box.run('ki manage mcp list example/server')).output).toContain(message)
    }

    const invalidJson = await sandbox()
    invalidJson.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await invalidJson.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    await writeFile(`${invalidJson.data.path}/ki/mcp/example/server/versions/v1.0.0-${defaultCommit}/receipt.json`, '{')
    expect((await invalidJson.run('ki manage mcp list example/server')).output).toContain('receipt must be valid JSON')
  })

  test('rejects unsafe active selections and retained-version state', async () => {
    const source = (box: Awaited<ReturnType<typeof sandbox>>): string => `${box.data.path}/ki/mcp/example/server`
    for (const target of [undefined, '/tmp/outside', '../outside', 'other/version']) {
      const box = await sandbox()
      box.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
      expect((await box.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
      await rm(`${source(box)}/active`)
      if (target !== undefined) await symlink(target, `${source(box)}/active`)
      expect((await box.run('ki manage mcp list example/server')).output).toContain(
        target === undefined ? 'must be a symbolic link' : 'active selection is invalid'
      )
    }

    const missingActive = await sandbox()
    missingActive.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await missingActive.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    await rm(`${source(missingActive)}/active`)
    await symlink('versions/missing', `${source(missingActive)}/active`)
    expect((await missingActive.run('ki manage mcp list example/server')).output).toContain('active version is missing')

    const unsafeVersion = await sandbox()
    unsafeVersion.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await unsafeVersion.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    await writeFile(`${source(unsafeVersion)}/versions/unsafe`, 'not a directory')
    expect((await unsafeVersion.run('ki manage mcp list example/server')).output).toContain('version is unsafe')

    const hiddenStaging = await sandbox()
    hiddenStaging.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await hiddenStaging.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    await writeFile(`${source(hiddenStaging)}/versions/.install-interrupted`, 'ignored')
    expect((await hiddenStaging.run('ki manage mcp list example/server')).exitCode).toBe(0)
  })

  test('rejects unsafe installation roots and conflicting immutable releases', async () => {
    const badData = await sandbox()
    await mkdir(badData.data.path, { recursive: true })
    await rm(`${badData.data.path}/ki`, { recursive: true, force: true })
    await writeFile(`${badData.data.path}/ki`, 'unsafe')
    badData.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await badData.run('ki manage mcp install example/server 1.0.0')).output).toContain(
      'KI data directory must be a physical directory'
    )

    const linkedRoot = await sandbox()
    await mkdir(`${linkedRoot.data.path}/ki`, { recursive: true })
    await symlink(linkedRoot.root.path, `${linkedRoot.data.path}/ki/mcp`)
    linkedRoot.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await linkedRoot.run('ki manage mcp install example/server 1.0.0')).output).toContain(
      'MCP source directory must be a physical directory'
    )

    const linkedSource = await sandbox()
    await mkdir(`${linkedSource.data.path}/ki/mcp/example`, { recursive: true })
    await symlink(linkedSource.root.path, `${linkedSource.data.path}/ki/mcp/example/server`)
    expect((await linkedSource.run('ki manage mcp list example/server')).output).toContain(
      'installed MCP source example/server must be a physical directory'
    )

    const repositoryFile = await sandbox()
    await mkdir(`${repositoryFile.data.path}/ki/mcp/example`, { recursive: true })
    await writeFile(`${repositoryFile.data.path}/ki/mcp/example/server`, 'unsafe')
    expect((await repositoryFile.run('ki manage mcp list')).output).toContain('repository directory is unsafe')

    const invalidOwner = await sandbox()
    await mkdir(`${invalidOwner.data.path}/ki/mcp/Invalid/server`, { recursive: true })
    expect((await invalidOwner.run('ki manage mcp list')).output).toContain('lower-case owner/repository')

    const releases: Record<string, ReleaseFixture> = { 'v1.0.0': { commit: '1'.repeat(40) } }
    const conflict = await sandbox()
    conflict.setRunner(sourceRunner(releases, []))
    expect((await conflict.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    releases['v1.0.0'] = { commit: '2'.repeat(40) }
    expect((await conflict.run('ki manage mcp install example/server 1.0.0')).output).toContain(
      'conflicts with installed provenance'
    )

    const authConflict = await sandbox()
    authConflict.setRunner(sourceRunner({ 'v1.0.0': {} }, []))
    expect((await authConflict.run('ki manage mcp install example/server 1.0.0')).exitCode).toBe(0)
    expect((await authConflict.run('ki manage mcp install example/server 1.0.0 --auth github-cli')).output).toContain(
      'has conflicting provenance'
    )
  })

  test('fails closed on unsafe installed state and retired grammar', async () => {
    const box = await sandbox()
    expect(await box.run('ki manage mcp list')).toEqual({ exitCode: 0, output: '' })
    expect((await box.run('ki manage mcp list example/server')).output).toContain('is not installed')
    await mkdir(`${box.data.path}/ki/mcp`, { recursive: true })
    await writeFile(`${box.data.path}/ki/mcp/not-an-owner`, 'unsafe')
    expect((await box.run('ki manage mcp list')).output).toContain('owner directory is unsafe')

    expect((await box.run('ki manage mcp install example/server 1.0.0 --auth token')).exitCode).toBe(2)
    expect((await box.run('ki manage mcp rollback example/server')).exitCode).toBe(2)
    expect((await box.run('ki manage mcp uninstall')).exitCode).toBe(2)
    expect((await box.run('ki manage mcp list --format yaml')).exitCode).toBe(2)

    await rm(`${box.data.path}/ki/mcp`, { recursive: true })
    await mkdir(`${box.data.path}/ki`, { recursive: true })
    await symlink(box.root.path, `${box.data.path}/ki/mcp`)
    expect((await box.run('ki manage mcp list')).output).toContain('MCP source directory must be physical')
  })
})
