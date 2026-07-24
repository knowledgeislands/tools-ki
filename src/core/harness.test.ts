import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { discoverInstalledHarnesses, parseHarnessManifest, readInstalledHarness } from './harness.ts'

const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-harness-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const digest = (contents: string): string => createHash('sha256').update(contents).digest('hex')

const installHarness = async (data: string, identifier = 'example/harness'): Promise<string> => {
  const [owner, name] = identifier.split('/') as [string, string]
  const root = join(data, 'harnesses', owner, name, 'latest')
  const source = join(root, 'skills', 'ki-example')
  const skill = '# ki-example\n'
  const operation = 'export const audit = () => undefined\n'
  await mkdir(source, { recursive: true })
  await mkdir(join(root, 'operations'), { recursive: true })
  await writeFile(join(source, 'SKILL.md'), skill)
  await writeFile(join(root, 'operations', 'example.ts'), operation)
  await writeFile(
    join(root, 'harness.toml'),
    [
      'schema = 1',
      `id = "${identifier}"`,
      'latest = "2026.07.24"',
      'ki = ">=0.2.0"',
      '',
      '[files]',
      `"skills/ki-example/SKILL.md" = "${digest(skill)}"`,
      `"operations/example.ts" = "${digest(operation)}"`,
      '',
      '[capabilities.ki-example]',
      'kind = "skill"',
      'source = "skills/ki-example"',
      '',
      '[capabilities.ki-example.operations.audit]',
      'protocol = "ki/native-operation@1"',
      'module = "operations/example.ts"',
      'export = "audit"',
      ''
    ].join('\n')
  )
  return root
}

test('parses a compatible harness manifest with integrity-covered operations', () => {
  const manifest = parseHarnessManifest(
    [
      'schema = 1',
      'id = "example/harness"',
      'latest = "2026.07.24"',
      'ki = ">=0.2.0"',
      '',
      '[files]',
      `"skills/ki-example/SKILL.md" = "${digest('# ki-example\n')}"`,
      '',
      '[capabilities.ki-example]',
      'kind = "skill"',
      'source = "skills/ki-example"',
      ''
    ].join('\n')
  )

  expect(manifest.id).toBe('example/harness')
  expect(manifest.capabilities[0]?.name).toBe('ki-example')
})

test('rejects malformed manifest identities', () => {
  expect(() => parseHarnessManifest('schema = 1\nid = "../unsafe"\nlatest = "x"\nki = "x"\n[files]\n[capabilities]\n')).toThrow(
    'harness.toml id must be an owner/name identifier'
  )
})

test('reads and verifies an installed harness without accepting altered or symlinked contents', async () => {
  const data = await temporaryDirectory()
  const root = await installHarness(data)
  const harness = await readInstalledHarness(data, 'example/harness')

  expect(harness.root).toBe(await realpath(root))
  expect(harness.manifest.capabilities[0]?.operations[0]?.mode).toBe('audit')

  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), '# altered\n')
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('does not match its digest')

  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), '# ki-example\n')
  await rm(join(root, 'operations', 'example.ts'))
  await symlink('/dev/null', join(root, 'operations', 'example.ts'))
  await expect(readInstalledHarness(data, 'example/harness')).rejects.toThrow('must be a regular file')
})

test('discovers installed harnesses and rejects unsafe registry tree entries', async () => {
  const data = await temporaryDirectory()
  await installHarness(data, 'example/second')
  await installHarness(data, 'another/first')

  expect((await discoverInstalledHarnesses(data)).map((harness) => harness.manifest.id)).toEqual(['another/first', 'example/second'])

  await symlink(join(data, 'harnesses', 'example'), join(data, 'harnesses', 'unsafe'))
  await expect(discoverInstalledHarnesses(data)).rejects.toThrow('unsafe owner entry')
})
