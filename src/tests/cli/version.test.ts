import { describe, expect, test } from 'vitest'
import packageMetadata from '../../../package.json' with { type: 'json' }
import { sandbox } from './_cli_helper.ts'

describe('ki version', () => {
  test('reports the package version, as a command and as an option', async () => {
    const box = await sandbox()
    const version = await box.run('ki version')
    const optionVersion = await box.run('ki --version')

    expect(version.output).toBe(`ki ${packageMetadata.version}\n`)
    expect(optionVersion).toEqual({ exitCode: 0, output: `${packageMetadata.version}\n` })
  })
})
