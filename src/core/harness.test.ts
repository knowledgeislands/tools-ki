import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createHarnessLock, discoverInstalledHarnesses, parseHarnessLock, readInstalledHarness, renderHarnessLock } from './harness.ts'

const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-harness-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const installHarness = async (data: string, identifier = 'example/harness'): Promise<string> => {
  const [owner, name] = identifier.split('/') as [string, string]
  const root = join(data, 'harnesses', owner, name, 'latest')
  const source = join(root, 'skills', 'ki-example')
  await mkdir(join(source, 'scripts', 'native'), { recursive: true })
  await writeFile(join(source, 'SKILL.md'), '---\nname: ki-example\nki-depends-on: []\n---\n')
  await writeFile(join(source, 'scripts', 'native', 'audit.mjs'), 'export const audit = () => []\n')
  const lock = await createHarnessLock(root, identifier, { url: 'https://releases.example.test/harness.tar.gz', sha256: '0'.repeat(64) })
  await writeFile(join(root, 'harness-lock.toml'), renderHarnessLock(lock))
  return root
}

test('parses a generated harness lock with discovered skills and native modules', () => {
  const lock = parseHarnessLock(
    [
      'schema = 1',
      'id = "example/harness"',
      '',
      '[archive]',
      'url = "https://releases.example.test/harness.tar.gz"',
      `sha256 = "${'0'.repeat(64)}"`,
      '',
      '[files]',
      `"skills/ki-example/SKILL.md" = "${'1'.repeat(64)}"`,
      '',
      '[capabilities.ki-example]',
      'kind = "skill"',
      'source = "skills/ki-example"',
      'depends_on = []',
      ''
    ].join('\n')
  )

  expect(lock.id).toBe('example/harness')
  expect(lock.capabilities[0]?.name).toBe('ki-example')
})

test('rejects malformed lock identities', () => {
  expect(() => parseHarnessLock('schema = 1\nid = "../unsafe"\n[archive]\nurl = "x"\nsha256 = "x"\n[files]\n[capabilities]\n')).toThrow(
    'harness-lock.toml id must be an owner/name identifier'
  )
})

test('reads and verifies an installed harness without accepting altered or symlinked contents', async () => {
  const data = await temporaryDirectory()
  const root = await installHarness(data)
  const harness = await readInstalledHarness(data, 'example/harness')

  expect(harness.root).toBe(await realpath(root))
  expect(harness.lock.capabilities[0]?.operations[0]?.mode).toBe('audit')

  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), '# altered\n')
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('does not match its digest')

  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), '---\nname: ki-example\nki-depends-on: []\n---\n')
  await rm(join(root, 'skills', 'ki-example', 'scripts', 'native', 'audit.mjs'))
  await symlink('/dev/null', join(root, 'skills', 'ki-example', 'scripts', 'native', 'audit.mjs'))
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('must be a regular file')
})

test('discovers installed harnesses and rejects unsafe registry tree entries', async () => {
  const data = await temporaryDirectory()
  await installHarness(data, 'example/second')
  await installHarness(data, 'another/first')

  expect((await discoverInstalledHarnesses(data)).map((harness) => harness.lock.id)).toEqual(['another/first', 'example/second'])

  await symlink(join(data, 'harnesses', 'example'), join(data, 'harnesses', 'unsafe'))
  await expect(discoverInstalledHarnesses(data)).rejects.toThrow('unsafe owner entry')
})
