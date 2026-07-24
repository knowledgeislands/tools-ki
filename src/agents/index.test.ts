import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { bootstrapAgents, configuredAgents } from './index.ts'

const directories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-agents-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test('bootstraps a user-managed agent configuration from known agents', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const configuration = join(root, 'config', 'ki')
  await mkdir(join(home, '.claude'), { recursive: true })

  const detected = await bootstrapAgents({ homeDirectory: home, configurationDirectory: configuration })
  await mkdir(join(home, '.agents'), { recursive: true })
  const configured = await configuredAgents({ homeDirectory: home, configurationDirectory: configuration })

  expect(detected.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(configured.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(await readFile(join(configuration, 'agents.toml'), 'utf8')).toBe('schema = 1\nagents = ["claude-code"]\n')
})

test('requires bootstrap before reading configured agents', async () => {
  const root = await temporaryDirectory()
  await expect(configuredAgents({ homeDirectory: join(root, 'home'), configurationDirectory: join(root, 'config', 'ki') })).rejects.toThrow(
    'run `ki bootstrap` first'
  )
})
