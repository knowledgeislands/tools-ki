import { lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createContext } from './context.ts'
import { processContextOptions } from './output.ts'
import { installationMode, resolveKiPaths, userHome } from './paths.ts'
import { resolveRepository } from './repository.ts'

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
  expect((await resolveRepository({ workingDirectory: nestedWorkingDirectory, homeDirectory: home })).root).toBe(await realpath(repository))
  await expect(
    resolveRepository({ repository: nestedWorkingDirectory, workingDirectory: nestedWorkingDirectory, homeDirectory: home })
  ).rejects.toThrow('--repo must name a repository containing .ki-config.toml')
  await expect(
    resolveRepository({ repository: join(root, 'missing'), workingDirectory: nestedWorkingDirectory, homeDirectory: home })
  ).rejects.toThrow('--repo must be an existing directory')
  await symlink(repository, join(root, 'repository-link'))
  await expect(
    resolveRepository({ repository: join(root, 'repository-link'), workingDirectory: nestedWorkingDirectory, homeDirectory: home })
  ).rejects.toThrow('--repo must be an existing directory')
})

test('path resolution supports user-profile fallback and linked executables', async () => {
  const root = await temporaryDirectory()
  const executable = join(root, 'ki')
  const linkedExecutable = join(root, 'linked-ki')
  await writeFile(executable, '#!/bin/sh\n')
  await symlink(executable, linkedExecutable)

  expect(userHome({ USERPROFILE: join(root, 'profile') })).toBe(join(root, 'profile'))
  expect(userHome({})).toBe('')
  expect(resolveKiPaths({ HOME: join(root, 'home'), XDG_DATA_HOME: '' })).toEqual({
    data: join(root, 'home/.local/share/ki'),
    config: join(root, 'home/.config/ki'),
    cache: join(root, 'home/.cache/ki'),
    state: join(root, 'home/.local/state/ki')
  })
  expect(await installationMode(executable, root)).toBe('regular executable')
  expect(await installationMode(linkedExecutable, root)).toBe('linked development checkout')
  expect((await lstat(linkedExecutable)).isSymbolicLink()).toBe(true)
})

test('process context options select the executable from environment, argv, then a safe fallback', () => {
  const environment = process.env as NodeJS.ProcessEnv & { _?: string }
  const originalUnderscore = environment._
  const originalArguments = [...process.argv]
  try {
    environment._ = 'from-environment'
    expect(processContextOptions().executable).toBe('from-environment')
    delete environment._
    process.argv[1] = 'from-argv'
    expect(processContextOptions().executable).toBe('from-argv')
    process.argv.splice(1, 1)
    expect(processContextOptions().executable).toBe('ki')
  } finally {
    if (originalUnderscore === undefined) delete environment._
    else environment._ = originalUnderscore
    process.argv.splice(0, process.argv.length, ...originalArguments)
  }
})

test('context handles a home directory that has not been created yet', async () => {
  const root = await temporaryDirectory()
  const workingDirectory = join(root, 'working')
  const missingHome = join(root, 'missing-home')
  await mkdir(workingDirectory)

  const context = await createContext({
    stdout: output,
    stderr: output,
    executable: join(root, 'ki'),
    workingDirectory,
    environment: { HOME: missingHome }
  })

  expect(context.homeDirectory).toBe(missingHome)
  expect(context.repository).toBeNull()
})
