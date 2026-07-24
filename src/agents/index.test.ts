import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createHarnessLock, renderHarnessLock } from '../core/harness.ts'
import { bootstrapAgents, configuredAgents, localBootstrapSkillSource } from './index.ts'

const directories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-agents-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const installBootstrapHarness = async (data: string): Promise<string> => {
  const root = join(data, 'harnesses', 'knowledgeislands', 'ki-agentic-harness', 'latest')
  const source = join(root, 'skills', 'keystone', 'ki-bootstrap')
  await mkdir(source, { recursive: true })
  await writeFile(join(source, 'SKILL.md'), '---\nname: ki-bootstrap\nki-depends-on: []\n---\n')
  const lock = await createHarnessLock(root, 'knowledgeislands/ki-agentic-harness', {
    url: 'https://releases.example.test/harness.tar.gz',
    sha256: '0'.repeat(64)
  })
  await writeFile(join(root, 'harness-lock.toml'), renderHarnessLock(lock))
  return source
}

test('bootstraps a user-managed agent configuration from known agents', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const configuration = join(root, 'config', 'ki')
  const data = join(root, 'data', 'ki')
  await mkdir(join(home, '.claude'), { recursive: true })
  const source = await installBootstrapHarness(data)

  const detected = await bootstrapAgents({ homeDirectory: home, configurationDirectory: configuration, dataDirectory: data })
  await mkdir(join(home, '.agents'), { recursive: true })
  const repeated = await bootstrapAgents({ homeDirectory: home, configurationDirectory: configuration, dataDirectory: data })
  const configured = await configuredAgents({ homeDirectory: home, configurationDirectory: configuration })

  expect(detected.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(repeated.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(configured.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(await readFile(join(configuration, 'config.toml'), 'utf8')).toBe(
    `schema = 1

[agents]
ids = [
  "claude-code",
]

[harnesses]
releases = [
]

[skills]
ids = [
]
`
  )
  expect(await realpath(join(home, '.claude', 'skills', 'ki-bootstrap'))).toBe(await realpath(source))
})

test('refresh redetects every configured runtime and installed harness capability', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const configuration = join(root, 'config', 'ki')
  const data = join(root, 'data', 'ki')
  await mkdir(join(home, '.claude'), { recursive: true })
  await installBootstrapHarness(data)

  await bootstrapAgents({ homeDirectory: home, configurationDirectory: configuration, dataDirectory: data })
  await mkdir(join(home, '.agents'), { recursive: true })
  const refreshed = await bootstrapAgents({
    homeDirectory: home,
    configurationDirectory: configuration,
    dataDirectory: data,
    refresh: true
  })

  expect(refreshed.map((agent) => agent.descriptor.id)).toEqual(['claude-code', 'chatgpt-codex'])
  expect(await readFile(join(configuration, 'config.toml'), 'utf8')).toBe(
    `schema = 1

[agents]
ids = [
  "claude-code",
  "chatgpt-codex",
]

[harnesses]
releases = [
  { id = "knowledgeislands/ki-agentic-harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${'0'.repeat(64)}" },
]

[skills]
ids = [
  "knowledgeislands/ki-agentic-harness:ki-bootstrap",
]
`
  )
  expect(await realpath(join(home, '.agents', 'skills', 'ki-bootstrap'))).toBe(
    await realpath(join(data, 'harnesses', 'knowledgeislands', 'ki-agentic-harness', 'latest', 'skills', 'keystone', 'ki-bootstrap'))
  )
})

test('refresh replaces a legacy configuration with the current sectioned schema', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const configuration = join(root, 'config', 'ki')
  const data = join(root, 'data', 'ki')
  await mkdir(join(home, '.claude'), { recursive: true })
  await mkdir(configuration, { recursive: true })
  await writeFile(join(configuration, 'config.toml'), 'schema = 1\nagents = ["claude-code"]\nharnesses = []\nskills = []\n')
  await installBootstrapHarness(data)

  const refreshed = await bootstrapAgents({
    homeDirectory: home,
    configurationDirectory: configuration,
    dataDirectory: data,
    refresh: true
  })

  expect(refreshed.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(await readFile(join(configuration, 'config.toml'), 'utf8')).toContain('[agents]\nids = [\n  "claude-code",\n]')
})

test('requires bootstrap before reading configured agents', async () => {
  const root = await temporaryDirectory()
  await expect(configuredAgents({ homeDirectory: join(root, 'home'), configurationDirectory: join(root, 'config', 'ki') })).rejects.toThrow(
    'run `ki bootstrap` first'
  )
})

test('requires the canonical bootstrap skill path in a local harness', async () => {
  const root = await temporaryDirectory()
  const harness = join(root, 'harness')
  await mkdir(join(harness, 'skills', 'other'), { recursive: true })
  await writeFile(join(harness, 'skills', 'other', 'SKILL.md'), '---\nname: other\n---\n')

  await expect(localBootstrapSkillSource(harness)).rejects.toThrow('must contain skills/keystone/ki-bootstrap/SKILL.md')

  const source = join(harness, 'skills', 'keystone', 'ki-bootstrap')
  await mkdir(source, { recursive: true })
  await writeFile(join(source, 'SKILL.md'), '---\nname: ki-bootstrap\n---\n')
  await expect(localBootstrapSkillSource(harness)).resolves.toBe(await realpath(source))
})
