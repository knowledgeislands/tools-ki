import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, expect, test } from 'vitest'
import { readInstalledHarness } from './harness.ts'
import { canonicalHarnessRelease, installHarness, readHarnessRegistry, uninstallHarness } from './registry.ts'

const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-registry-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const digest = (contents: string | Uint8Array): string => createHash('sha256').update(contents).digest('hex')

const octal = (value: number, length: number): string => `${value.toString(8).padStart(length - 1, '0')}\0`

type ArchiveEntry = string | { readonly type: '2' }

const tar = (files: Readonly<Record<string, ArchiveEntry>>): Uint8Array => {
  const chunks: Uint8Array[] = []
  for (const [path, entry] of Object.entries(files)) {
    const contents = typeof entry === 'string' ? entry : ''
    const encoded = new TextEncoder().encode(contents)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(path), 0)
    header.set(new TextEncoder().encode(octal(0o644, 8)), 100)
    header.set(new TextEncoder().encode(octal(encoded.length, 12)), 124)
    header[156] = (typeof entry === 'string' ? '0' : entry.type).charCodeAt(0)
    chunks.push(header, encoded, new Uint8Array((512 - (encoded.length % 512)) % 512))
  }
  chunks.push(new Uint8Array(1024))
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return gzipSync(output)
}

const configuredArchive = async (
  root: string,
  archive: Uint8Array,
  digestValue = digest(archive)
): Promise<{ config: string; data: string }> => {
  const config = join(root, 'config', 'ki')
  const data = join(root, 'data', 'ki')
  await mkdir(config, { recursive: true })
  await writeFile(
    join(config, 'config.toml'),
    [
      '[[harnesses]]',
      'id = "example/harness"',
      'url = "https://releases.example.test/harness.tar.gz"',
      `sha256 = "${digestValue}"`,
      ''
    ].join('\n')
  )
  return { config, data }
}

test('installs only the harness payload and generates a lock from the verified archive', async () => {
  const root = await temporaryDirectory()
  const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
  const archive = tar({
    'source-revision/docs/ignored.md': '# source documentation\n',
    'source-revision/package.json': '{"private":true}\n',
    'source-revision/skills/ki-example/SKILL.md': skill,
    'source-revision/agents/example.md': '# agent\n',
    'source-revision/hooks/example.sh': '#!/bin/sh\n'
  })
  const { config, data } = await configuredArchive(root, archive)

  const result = await installHarness(config, data, 'example/harness', async () => new Response(archive))

  expect(result).toEqual({ installed: true, archiveSha256: digest(archive) })
  expect((await readInstalledHarness(data, 'example/harness')).lock.capabilities[0]?.name).toBe('ki-example')
  expect(await readFile(join(data, 'harnesses', 'example', 'harness', 'latest', 'skills', 'ki-example', 'SKILL.md'), 'utf8')).toBe(skill)
  await expect(lstat(join(data, 'harnesses', 'example', 'harness', 'latest', 'docs'))).rejects.toThrow()
  expect(await readFile(join(data, 'harnesses', 'example', 'harness', 'latest', 'harness-lock.toml'), 'utf8')).toContain('[files]')
})

test('includes the immutable canonical harness without requiring user registry configuration', async () => {
  const root = await temporaryDirectory()

  await expect(readHarnessRegistry(join(root, 'config', 'ki'))).resolves.toEqual([canonicalHarnessRelease])
})

test('drops only legacy vendored links from the selected payload', async () => {
  const root = await temporaryDirectory()
  const archive = tar({
    'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n',
    'skills/ki-example/scripts/vendored/legacy.ts': { type: '2' }
  })
  const { config, data } = await configuredArchive(root, archive)

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).resolves.toBeDefined()
  await expect(
    lstat(join(data, 'harnesses', 'example', 'harness', 'latest', 'skills', 'ki-example', 'scripts', 'vendored', 'legacy.ts'))
  ).rejects.toThrow()
})

test('refuses links outside the legacy vendored payload', async () => {
  const root = await temporaryDirectory()
  const archive = tar({ 'skills/ki-example/SKILL.md': { type: '2' } })
  const { config, data } = await configuredArchive(root, archive)

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).rejects.toThrow(
    'may contain only regular files and directories'
  )
})

test('refuses an archive that does not match configured immutable evidence without creating an installation', async () => {
  const root = await temporaryDirectory()
  const archive = tar({ 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' })
  const { config, data } = await configuredArchive(root, archive, '0'.repeat(64))

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).rejects.toThrow(
    'does not match its SHA-256'
  )
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('installed harnesses directory must be a directory')
})

test('removes only a verified non-base harness with no unrecognised state', async () => {
  const root = await temporaryDirectory()
  const archive = tar({ 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' })
  const { config, data } = await configuredArchive(root, archive)
  await installHarness(config, data, 'example/harness', async () => new Response(archive))

  expect(await uninstallHarness(data, 'example/harness', true)).toEqual({ uninstalled: false, archiveSha256: digest(archive) })
  await expect(readInstalledHarness(data, 'example/harness')).resolves.toBeDefined()
  expect(await uninstallHarness(data, 'example/harness')).toEqual({ uninstalled: true, archiveSha256: digest(archive) })
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('installed harness example/harness must be a directory')
  await expect(uninstallHarness(data, 'knowledgeislands/ki-agentic-harness')).rejects.toThrow('cannot be uninstalled')
})

test('refuses to remove an installed harness with unrecognised state', async () => {
  const root = await temporaryDirectory()
  const archive = tar({ 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' })
  const { config, data } = await configuredArchive(root, archive)
  await installHarness(config, data, 'example/harness', async () => new Response(archive))
  await writeFile(join(data, 'harnesses', 'example', 'harness', 'notes.txt'), 'preserve me\n')

  await expect(uninstallHarness(data, 'example/harness')).rejects.toThrow('has unrecognised state')
  await expect(readFile(join(data, 'harnesses', 'example', 'harness', 'notes.txt'), 'utf8')).resolves.toBe('preserve me\n')
})
