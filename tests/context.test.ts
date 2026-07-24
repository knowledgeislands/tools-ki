import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext } from '../src/core/context.ts'
import { resolveRepository } from '../src/core/repository.ts'

const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-context-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const output = { write: (_chunk: string): void => undefined }

test('context resolves physical CWD, XDG paths, and an ancestor KI repository', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const repository = join(root, 'workspace', 'example')
  const nestedWorkingDirectory = join(repository, 'docs', 'plans')
  await mkdir(nestedWorkingDirectory, { recursive: true })
  await mkdir(home)
  await writeFile(join(repository, '.ki-config.toml'), '[ki-repo]\n')

  const context = await createContext({
    stdout: output,
    stderr: output,
    executable: join(root, 'ki'),
    workingDirectory: nestedWorkingDirectory,
    environment: {
      HOME: home,
      XDG_DATA_HOME: join(root, 'data'),
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_CACHE_HOME: join(root, 'cache'),
      XDG_STATE_HOME: join(root, 'state')
    }
  })

  const physicalRepository = await realpath(repository)
  expect(context.workingDirectory).toBe(await realpath(nestedWorkingDirectory))
  expect(context.repository?.root).toBe(physicalRepository)
  expect(context.repository?.configuration).toBe(join(physicalRepository, '.ki-config.toml'))
  expect(context.paths).toEqual({
    data: join(root, 'data', 'ki'),
    config: join(root, 'config', 'ki'),
    cache: join(root, 'cache', 'ki'),
    state: join(root, 'state', 'ki')
  })
})

test('context never treats the home directory or filesystem root as a repository', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const nestedWorkingDirectory = join(home, 'workspace')
  await mkdir(nestedWorkingDirectory, { recursive: true })
  await writeFile(join(home, '.ki-config.toml'), '[ki-repo]\n')

  const context = await createContext({
    stdout: output,
    stderr: output,
    executable: join(root, 'ki'),
    workingDirectory: nestedWorkingDirectory,
    environment: { HOME: home }
  })

  expect(context.repository).toBeNull()
  await expect(resolveRepository({ workingDirectory: nestedWorkingDirectory, homeDirectory: home })).rejects.toThrow(
    'no KI repository found from the current working directory'
  )
})

test('explicit repository resolution requires the base directory and its KI configuration', async () => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const repository = join(root, 'workspace', 'example')
  const nestedWorkingDirectory = join(repository, 'docs')
  await mkdir(nestedWorkingDirectory, { recursive: true })
  await mkdir(home)
  await writeFile(join(repository, '.ki-config.toml'), '[ki-repo]\n')

  expect((await resolveRepository({ repository, workingDirectory: nestedWorkingDirectory, homeDirectory: home })).root).toBe(
    await realpath(repository)
  )
  await expect(
    resolveRepository({ repository: nestedWorkingDirectory, workingDirectory: nestedWorkingDirectory, homeDirectory: home })
  ).rejects.toThrow('--repo must name a repository containing .ki-config.toml')
})
