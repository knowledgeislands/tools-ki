import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki doctor]', () => {
  test('reports missing configuration in human form', async () => {
    const box = await sandbox()
    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('ki doctor\n  ✗ Configuration: missing; run ki bootstrap')
    expect(doctor.exitCode).toBe(0)
  })
})
