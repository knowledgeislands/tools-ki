import { describe, expect, test } from 'vitest'
import { run as runCli } from '../../cli.ts'
import type { KiContext } from '../../context.ts'

// The one branch of run() the sandbox cannot reach: its in-memory streams never fail,
// so an unexpected (non-KiError, non-Commander) error can only be provoked by handing
// run() a context whose stdout rejects. `version` dereferences nothing else.
describe('runCli()', () => {
  test('rethrows unexpected command errors instead of mapping them to an exit code', async () => {
    const context: KiContext = {
      stdout: { write: () => Promise.reject(new Error('unexpected output')) },
      stderr: { write: () => undefined },
      executable: 'ki',
      installation: 'regular',
      workingDirectory: '/unused',
      homeDirectory: '/unused',
      paths: { data: '/unused', config: '/unused', cache: '/unused', state: '/unused' },
      repository: null,
      fetcher: () => Promise.reject(new Error('sandbox fetcher unused'))
    }
    await expect(runCli(['version'], context)).rejects.toThrow('unexpected output')
  })
})
