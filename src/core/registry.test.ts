import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, expect, test } from 'vitest'
import { readInstalledHarness } from './harness.ts'
import { installHarness } from './registry.ts'

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

const tar = (files: Readonly<Record<string, string>>): Uint8Array => {
  const chunks: Uint8Array[] = []
  for (const [path, contents] of Object.entries(files)) {
    const encoded = new TextEncoder().encode(contents)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(path), 0)
    header.set(new TextEncoder().encode(octal(0o644, 8)), 100)
    header.set(new TextEncoder().encode(octal(encoded.length, 12)), 124)
    header[156] = '0'.charCodeAt(0)
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
    join(config, 'harnesses.toml'),
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

test('installs a configured gzip tar harness only after archive and manifest verification', async () => {
  const root = await temporaryDirectory()
  const skill = '# ki-example\n'
  const archive = tar({
    'skills/ki-example/SKILL.md': skill,
    'harness.toml': [
      'schema = 1',
      'id = "example/harness"',
      'latest = "2026.07.24"',
      'ki = ">=0.2.0"',
      '',
      '[[capabilities]]',
      'kind = "skill"',
      'name = "ki-example"',
      'source = "skills/ki-example"',
      '',
      '[[capabilities.files]]',
      'path = "skills/ki-example/SKILL.md"',
      `sha256 = "${digest(skill)}"`,
      ''
    ].join('\n')
  })
  const { config, data } = await configuredArchive(root, archive)

  const result = await installHarness(config, data, 'example/harness', async () => new Response(archive))

  expect(result).toEqual({ installed: true, latest: '2026.07.24' })
  expect((await readInstalledHarness(data, 'example/harness')).manifest.capabilities[0]?.name).toBe('ki-example')
  expect(await readFile(join(data, 'harnesses', 'example', 'harness', 'latest', 'skills', 'ki-example', 'SKILL.md'), 'utf8')).toBe(skill)
})

test('refuses an archive that does not match configured immutable evidence without creating an installation', async () => {
  const root = await temporaryDirectory()
  const archive = tar({ 'harness.toml': 'schema = 1\nid = "example/harness"\nlatest = "x"\nki = ">=0.2.0"\n' })
  const { config, data } = await configuredArchive(root, archive, '0'.repeat(64))

  await expect(installHarness(config, data, 'example/harness', async () => new Response(archive))).rejects.toThrow(
    'does not match its SHA-256'
  )
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('installed harnesses directory must be a directory')
})
