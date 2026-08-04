import { describe, expect, test } from 'vitest'
import packageMetadata from '../../../package.json' with { type: 'json' }
import { sandbox } from './_cli_helper.ts'

describe('[ki --version]', () => {
  test('reports the package version as a global option', async () => {
    const box = await sandbox()
    const optionVersion = await box.run('ki --version')
    const versionWithHelp = await box.run('ki --version -h')

    expect(optionVersion).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
    expect(versionWithHelp.exitCode).toBe(0)
    expect(versionWithHelp.output).not.toContain('ki: error:')
  })

  test('runs non-network commands with the production default fetcher', async () => {
    const box = await sandbox()

    const version = await box.run('ki --version', { fetcher: 'default' })

    expect(version).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
  })
})
