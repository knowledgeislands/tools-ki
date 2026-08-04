import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki run]', () => {
  test('rethrows unexpected command errors instead of mapping them to an exit code', async () => {
    const box = await sandbox()

    await expect(box.run('ki --version', { stdoutFailure: new Error('unexpected output') })).rejects.toThrow('unexpected output')
  })
})
