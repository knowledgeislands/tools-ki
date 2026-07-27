import { symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import packageMetadata from '../../../package.json' with { type: 'json' }
import { sandbox } from './_cli_helper.ts'

describe('[ki version]', () => {
  test('reports the package version, as a command and as an option', async () => {
    const box = await sandbox()
    const version = await box.run('ki version')
    const optionVersion = await box.run('ki --version')

    expect(version.output).toBe(`ki ${packageMetadata.version}\n`)
    expect(optionVersion).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
  })

  test('runs non-network commands with the production default fetcher', async () => {
    const box = await sandbox()

    const version = await box.run('ki version', { fetcher: 'default' })

    expect(version).toEqual({ exitCode: 0, output: `ki ${packageMetadata.version}\n` })
  })

  test('treats an absent invocation path as a regular installation', async () => {
    const box = await sandbox()

    const version = await box.run('ki version', { executable: 'missing-ki' })

    expect(version).toEqual({ exitCode: 0, output: `ki ${packageMetadata.version}\n` })
  })

  test('detects a symlinked invocation path as a local installation', async () => {
    const box = await sandbox()
    const executable = `${box.root.path}/linked-ki`
    await symlink(box.executable, executable)

    const version = await box.run('ki version', { executable })

    expect(version).toEqual({ exitCode: 0, output: `ki ${packageMetadata.version}\n` })
  })
})
