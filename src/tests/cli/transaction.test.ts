// CLI-004 acceptance evidence (e)/(f): src/core/transaction.ts's concurrent-target-
// replacement guard and mid-publication rollback both need a write target to change
// state *between* two of the transaction's own filesystem calls — a real interleaving
// no CLI input alone can force deterministically inside one synchronous command
// invocation. This file uses the same sanctioned fault-injection idiom as
// acquire.test.ts (vi.mock('node:fs/promises', ...) with a narrow, path-scoped
// override) to simulate that interleaving, rather than weakening the transaction to
// make it testable. Every other CLI-004 transaction scenario (validation refusals that
// need no interleaving) lives in repo.test.ts instead.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const readInterception = vi.hoisted(() => ({ path: undefined as string | undefined, count: 0 }))
const renameFailure = vi.hoisted(() => ({ enabled: false, calls: 0 }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    // Returns the real on-disk content for a write target's first read (the pre-conform
    // snapshot prepareWrites takes) but a fabricated "tampered" value for every read
    // after that — simulating a concurrent writer that changed the file the instant
    // after the transaction snapshotted it, so publishWrites' own pre-publication
    // recheck is what has to catch it.
    readFile: (...arguments_: Parameters<typeof original.readFile>) => {
      const [path] = arguments_
      if (readInterception.path && String(path).endsWith(readInterception.path)) {
        readInterception.count += 1
        if (readInterception.count === 2) return Promise.resolve('tampered\n')
      }
      return original.readFile(...arguments_)
    },
    // Lets the first temp-file rename (one write's publication) succeed normally, then
    // fails the second — simulating a mid-publication crash after one write already
    // landed, so the transaction's catch-block rollback is what has to recover it.
    rename: (...arguments_: Parameters<typeof original.rename>) => {
      if (renameFailure.enabled) {
        renameFailure.calls += 1
        if (renameFailure.calls === 2) return Promise.reject(new Error('rename failure'))
      }
      return original.rename(...arguments_)
    }
  }
})

afterEach(() => {
  readInterception.path = undefined
  readInterception.count = 0
  renameFailure.enabled = false
  renameFailure.calls = 0
})

const rubric = (families: string): string => `
export default {
  contract: 1,
  skill: 'ki-example',
  createContext: async ({ repository }) => ({ repository }),
  families: ${families}
}
`

const governedItem = (path: string, code: string, content: string) => `{
  kind: 'mechanical', code: '${code}', title: '${code}', level: 'FAIL', phase: 'PRIMARY',
  audit: async () => [{ status: 'VIOLATION', message: 'not conformed' }],
  repair: async () => ({ writes: [{ path: '${path}', content: '${content}' }] })
}`

describe('[ki repo conform] transaction interleaving safety', () => {
  test('refuses publication when a write target changed after the pre-conform snapshot', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    readInterception.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(`[{ code: 'F', title: 'Family', items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`)
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('native conform write target governed.txt changed before publication')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('rolls back an already-published write when a later write fails mid-publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed-1.txt', 'before-1\n')
    await box.project.write('governed-2.txt', 'before-2\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
        code: 'F', title: 'Family',
        items: [
          ${governedItem('governed-1.txt', 'EXAMPLE-1', 'after-1\\n')},
          ${governedItem('governed-2.txt', 'EXAMPLE-2', 'after-2\\n')}
        ]
      }]`)
    })
    renameFailure.enabled = true

    await expect(box.run('ki repo conform')).rejects.toThrow('rename failure')

    expect(await box.project.read('governed-1.txt')).toBe('before-1\n')
    expect(await box.project.read('governed-2.txt')).toBe('before-2\n')
  })
})
