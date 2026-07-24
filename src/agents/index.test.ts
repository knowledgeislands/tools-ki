import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { installedAgents } from './index.ts'

const directories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-agents-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test('detects known agents once and then uses the persisted inventory', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const state = join(root, 'state', 'ki')
  await mkdir(join(home, '.claude'), { recursive: true })

  const detected = await installedAgents({ homeDirectory: home, stateDirectory: state })
  await mkdir(join(home, '.agents'), { recursive: true })
  const cached = await installedAgents({ homeDirectory: home, stateDirectory: state })
  const refreshed = await installedAgents({ homeDirectory: home, stateDirectory: state, refresh: true })

  expect(detected.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(cached.map((agent) => agent.descriptor.id)).toEqual(['claude-code'])
  expect(refreshed.map((agent) => agent.descriptor.id)).toEqual(['claude-code', 'codex'])
  expect(await readFile(join(state, 'agents.toml'), 'utf8')).toContain('[agents.codex]')
})
