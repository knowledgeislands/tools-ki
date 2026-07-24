import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { discoverInstalledHarnesses, readInstalledHarness } from './harness.ts'

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
  const root = join(data, 'harnesses', owner, name)
  const source = join(root, 'skills', 'ki-example')
  await mkdir(join(source, 'scripts', 'native'), { recursive: true })
  await writeFile(join(source, 'SKILL.md'), '---\nname: ki-example\nki-depends-on: []\n---\n')
  await writeFile(join(source, 'scripts', 'native', 'audit.mjs'), 'export const audit = () => []\n')
  return root
}

test('discovers installed capabilities directly from the payload', async () => {
  const data = await temporaryDirectory()
  const root = await installHarness(data)
  const harness = await readInstalledHarness(data, 'example/harness')

  expect(harness.root).toBe(await realpath(root))
  expect(harness.id).toBe('example/harness')
  expect(harness.capabilities[0]?.operations[0]?.mode).toBe('audit')
})

test('rejects malformed or symlinked installed skill contents', async () => {
  const data = await temporaryDirectory()
  const root = await installHarness(data)

  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), '# malformed\n')
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('must declare frontmatter')

  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), '---\nname: ki-example\nki-depends-on: []\n---\n')
  await rm(join(root, 'skills', 'ki-example', 'scripts', 'native', 'audit.mjs'))
  await symlink('/dev/null', join(root, 'skills', 'ki-example', 'scripts', 'native', 'audit.mjs'))
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('must not be a symlink')
})

test('discovers direct installed harness paths and rejects unsafe registry tree entries', async () => {
  const data = await temporaryDirectory()
  await installHarness(data, 'example/second')
  await installHarness(data, 'another/first')

  expect((await discoverInstalledHarnesses(data)).map((harness) => harness.id)).toEqual(['another/first', 'example/second'])

  await symlink(join(data, 'harnesses', 'example'), join(data, 'harnesses', 'unsafe'))
  await expect(discoverInstalledHarnesses(data)).rejects.toThrow('unsafe owner entry')
})
