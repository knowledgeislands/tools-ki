import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki unknown]', () => {
  test('rejects an unknown command', async () => {
    const box = await sandbox()
    const unknown = await box.run('ki unknown')

    expect(unknown.exitCode).toBe(2)
  })
})
