import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { makeHarnessArchive } from '../tests/cli/_archive_helper.ts'
import { readInstalledHarness } from './harness.ts'
import {
  canonicalHarnessRelease,
  disableCanonicalHarnessDevelopment,
  enableCanonicalHarnessDevelopment,
  installHarness,
  readHarnessRegistry,
  recordInstalledHarness,
  uninstallHarness
} from './registry.ts'

const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-registry-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const configuredArchive = async (root: string, digestValue: string): Promise<{ config: string; data: string }> => {
  const config = join(root, 'config', 'ki')
  const data = join(root, 'data', 'ki')
  await mkdir(config, { recursive: true })
  await writeFile(
    join(config, 'config.toml'),
    [
      '[harnesses]',
      'releases = [',
      '  {',
      '    id = "example/harness",',
      '    url = "https://releases.example.test/harness.tar.gz",',
      `    sha256 = "${digestValue}"`,
      '  },',
      ']',
      ''
    ].join('\n')
  )
  return { config, data }
}

test('installs only the harness payload directly under its owner and repository path', async () => {
  const root = await temporaryDirectory()
  const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
  const { payload: archive, sha256 } = makeHarnessArchive({
    'source-revision/docs/ignored.md': '# source documentation\n',
    'source-revision/package.json': '{"private":true}\n',
    'source-revision/skills/ki-example/SKILL.md': skill,
    'source-revision/subagents/example.md': '# agent\n',
    'source-revision/hooks/example.sh': '#!/bin/sh\n'
  })
  const { config, data } = await configuredArchive(root, sha256)

  const result = await installHarness(config, data, 'example/harness', async () => new Response(archive))

  expect(result).toEqual({ installed: true, archiveSha256: sha256 })
  expect((await readInstalledHarness(data, 'example/harness')).capabilities[0]?.name).toBe('ki-example')
  expect(await readFile(join(data, 'harnesses', 'example', 'harness', 'skills', 'ki-example', 'SKILL.md'), 'utf8')).toBe(skill)
  await expect(lstat(join(data, 'harnesses', 'example', 'harness', 'docs'))).rejects.toThrow()
  await expect(lstat(join(data, 'harnesses', 'example', 'harness', 'harness-lock.toml'))).rejects.toThrow()
})

test('includes the immutable canonical harness without requiring user registry configuration', async () => {
  const root = await temporaryDirectory()

  await expect(readHarnessRegistry(join(root, 'config', 'ki'))).resolves.toEqual([canonicalHarnessRelease])
})

test('switches only the canonical payload directories to and from a local development harness', async () => {
  const root = await temporaryDirectory()
  const data = join(root, 'data', 'ki')
  const installed = join(data, 'harnesses', 'knowledgeislands', 'ki-agentic-harness')
  const local = join(root, 'local-harness')
  await Promise.all(
    ['skills', 'subagents', 'hooks'].flatMap((payload) => [
      mkdir(join(installed, payload), { recursive: true }),
      mkdir(join(local, payload), { recursive: true })
    ])
  )

  expect(await enableCanonicalHarnessDevelopment(data, local)).toBe(await realpath(local))
  for (const payload of ['skills', 'subagents', 'hooks']) {
    expect((await lstat(join(installed, payload))).isSymbolicLink()).toBe(true)
    expect(await realpath(join(installed, payload))).toBe(await realpath(join(local, payload)))
  }

  expect(await disableCanonicalHarnessDevelopment(data)).toBe(true)
  await expect(lstat(installed)).rejects.toThrow()
  await expect(lstat(join(local, 'skills'))).resolves.toBeDefined()
  expect(await disableCanonicalHarnessDevelopment(data)).toBe(false)
})

test('records successful harness installation and removal without discarding release evidence', async () => {
  const root = await temporaryDirectory()
  const configuration = join(root, 'config', 'ki')
  await mkdir(configuration, { recursive: true })
  await writeFile(
    join(configuration, 'config.toml'),
    ['schema = 1', '', '[harnesses]', 'releases = []', '', '[skills]', 'ids = []', ''].join('\n')
  )

  await recordInstalledHarness(configuration, 'example/harness', true)
  expect(await readFile(join(configuration, 'config.toml'), 'utf8')).toContain(
    '[harnesses]\nids = [\n  "example/harness",\n]\nreleases = []'
  )

  await recordInstalledHarness(configuration, 'example/harness', false)
  expect(await readFile(join(configuration, 'config.toml'), 'utf8')).toContain('[harnesses]\nids = [\n]\nreleases = []')
})

test('migrates a managed latest layout and removes its generated lock without downloading again', async () => {
  const root = await temporaryDirectory()
  const { payload: archive, sha256 } = makeHarnessArchive({
    'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
  })
  const { config, data } = await configuredArchive(root, sha256)
  const latest = join(data, 'harnesses', 'example', 'harness', 'latest')
  await mkdir(join(latest, 'skills', 'ki-example'), { recursive: true })
  await writeFile(join(latest, 'skills', 'ki-example', 'SKILL.md'), '---\nname: ki-example\nki-depends-on: []\n---\n')
  await writeFile(join(latest, 'harness-lock.toml'), 'legacy generated state\n')
  let fetched = false

  const result = await installHarness(config, data, 'example/harness', async () => {
    fetched = true
    return new Response(archive)
  })

  expect(result).toEqual({ installed: false, archiveSha256: sha256 })
  expect(fetched).toBe(false)
  await expect(readFile(join(data, 'harnesses', 'example', 'harness', 'skills', 'ki-example', 'SKILL.md'), 'utf8')).resolves.toContain(
    'name: ki-example'
  )
  await expect(lstat(join(data, 'harnesses', 'example', 'harness', 'latest'))).rejects.toThrow()
  await expect(lstat(join(data, 'harnesses', 'example', 'harness', 'harness-lock.toml'))).rejects.toThrow()
})

test('drops only legacy vendored links from the selected payload', async () => {
  const root = await temporaryDirectory()
  const { payload: archive, sha256 } = makeHarnessArchive({
    'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n',
    'skills/ki-example/scripts/vendored/legacy.ts': { type: '2' }
  })
  const { config, data } = await configuredArchive(root, sha256)

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).resolves.toBeDefined()
  await expect(
    lstat(join(data, 'harnesses', 'example', 'harness', 'skills', 'ki-example', 'scripts', 'vendored', 'legacy.ts'))
  ).rejects.toThrow()
})

test('refuses links outside the legacy vendored payload', async () => {
  const root = await temporaryDirectory()
  const { payload: archive, sha256 } = makeHarnessArchive({ 'skills/ki-example/SKILL.md': { type: '2' } })
  const { config, data } = await configuredArchive(root, sha256)

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).rejects.toThrow(
    'may contain only regular files and directories'
  )
})

test('refuses an archive that does not match configured immutable evidence without creating an installation', async () => {
  const root = await temporaryDirectory()
  const { payload: archive } = makeHarnessArchive({ 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' })
  const { config, data } = await configuredArchive(root, '0'.repeat(64))

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).rejects.toThrow(
    'does not match its SHA-256'
  )
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('installed harness example/harness must be a directory')
})

test('removes only a non-base harness with no unrecognised state', async () => {
  const root = await temporaryDirectory()
  const { payload: archive, sha256 } = makeHarnessArchive({
    'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
  })
  const { config, data } = await configuredArchive(root, sha256)
  await installHarness(config, data, 'example/harness', async () => new Response(archive))

  expect(await uninstallHarness(data, 'example/harness', true)).toEqual({ uninstalled: false })
  await expect(readInstalledHarness(data, 'example/harness')).resolves.toBeDefined()
  expect(await uninstallHarness(data, 'example/harness')).toEqual({ uninstalled: true })
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('installed harness example/harness must be a directory')
  await expect(uninstallHarness(data, 'knowledgeislands/ki-agentic-harness')).rejects.toThrow('cannot be uninstalled')
})

test('refuses to remove an installed harness with unrecognised state', async () => {
  const root = await temporaryDirectory()
  const { payload: archive, sha256 } = makeHarnessArchive({
    'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
  })
  const { config, data } = await configuredArchive(root, sha256)
  await installHarness(config, data, 'example/harness', async () => new Response(archive))
  await writeFile(join(data, 'harnesses', 'example', 'harness', 'notes.txt'), 'preserve me\n')

  await expect(uninstallHarness(data, 'example/harness')).rejects.toThrow('has unrecognised state')
  await expect(readFile(join(data, 'harnesses', 'example', 'harness', 'notes.txt'), 'utf8')).resolves.toBe('preserve me\n')
})
