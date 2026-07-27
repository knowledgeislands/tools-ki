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
const identityReplacement = vi.hoisted(() => ({ path: undefined as string | undefined, count: 0 }))
const preparationReplacement = vi.hoisted(() => ({ path: undefined as string | undefined, count: 0 }))
const rollbackReplacement = vi.hoisted(() => ({ enabled: false, path: undefined as string | undefined }))
const linkFailure = vi.hoisted(() => ({ enabled: false, calls: 0 }))

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
    lstat: async (...arguments_: Parameters<typeof original.lstat>) => {
      const [path] = arguments_
      if (preparationReplacement.path && String(path).endsWith(preparationReplacement.path)) {
        preparationReplacement.count += 1
        if (preparationReplacement.count === 2) {
          const replacement = `${String(path)}.concurrent-replacement`
          await original.writeFile(replacement, 'replacement\n', 'utf8')
          await original.rename(replacement, String(path))
        }
      }
      if (identityReplacement.path && String(path).endsWith(identityReplacement.path)) {
        identityReplacement.count += 1
        // prepareWrites inspects each target twice. Replace it just before the
        // pre-publication third inspection, preserving bytes but changing inode.
        if (identityReplacement.count === 3) {
          const replacement = `${String(path)}.concurrent-replacement`
          await original.writeFile(replacement, 'before\n', 'utf8')
          await original.rename(replacement, String(path))
        }
      }
      return original.lstat(...arguments_)
    },
    link: async (...arguments_: Parameters<typeof original.link>) => {
      if (linkFailure.enabled) {
        linkFailure.calls += 1
        if (linkFailure.calls === 2) throw new Error('link failure')
      }
      await original.link(...arguments_)
    },
    // Lets the first temp-file rename (one write's publication) succeed normally, then
    // fails the second — simulating a mid-publication crash after one write already
    // landed, so the transaction's catch-block rollback is what has to recover it.
    rename: async (...arguments_: Parameters<typeof original.rename>) => {
      if (renameFailure.enabled) {
        renameFailure.calls += 1
        if (renameFailure.calls === 2) {
          if (rollbackReplacement.enabled && rollbackReplacement.path) {
            const replacement = `${rollbackReplacement.path}.concurrent-replacement`
            await original.writeFile(replacement, 'third-party replacement\n', 'utf8')
            await original.rename(replacement, rollbackReplacement.path)
          }
          throw new Error('rename failure')
        }
      }
      await original.rename(...arguments_)
      if (rollbackReplacement.enabled && renameFailure.calls === 1) rollbackReplacement.path = String(arguments_[1])
    }
  }
})

afterEach(() => {
  readInterception.path = undefined
  readInterception.count = 0
  renameFailure.enabled = false
  renameFailure.calls = 0
  identityReplacement.path = undefined
  identityReplacement.count = 0
  preparationReplacement.path = undefined
  preparationReplacement.count = 0
  rollbackReplacement.enabled = false
  rollbackReplacement.path = undefined
  linkFailure.enabled = false
  linkFailure.calls = 0
})

const rubric = (families: string): string => `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'transaction safety',
  createSession: async ({ repository }) => {
    const proposals = []
    const context = { repository, propose: (proposal) => proposals.push(proposal) }
    return {
      subjects: [{ families: ${families}.map(({ code }) => code), context: () => context }],
      proposal: () => ({
        writes: proposals.flatMap(({ writes = [] }) => writes),
        commands: proposals.flatMap(({ commands = [] }) => commands)
      })
    }
  },
  families: ${families}
}
`

const governedItem = (path: string, code: string, content: string) => `{
  code: '${code}', title: '${code}', description: 'Transaction test item.', sources: ['standard.md'],
  mechanical: {
    level: 'FAIL',
    audit: { phase: 'PRIMARY', run: async () => [{ status: 'VIOLATION', message: 'not conformed' }] },
    conform: {
      phase: 'PRIMARY',
      run: async (context) => { context.propose({ writes: [{ path: '${path}', content: '${content}' }] }) }
    }
  }
}`

describe('[ki repo conform] transaction interleaving safety', () => {
  test('refuses publication when a write target changed after the pre-conform snapshot', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    readInterception.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Transactions.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt changed before publication')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('rolls back an already-published write when a later write fails mid-publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed-1.txt', 'before-1\n')
    await box.project.write('governed-2.txt', 'before-2\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
        code: 'F', title: 'Family', description: 'Transactions.', standard: 'standard.md', selectContext: (context) => context,
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

  test('refuses a same-byte target replacement before publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    identityReplacement.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Transactions.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt changed before publication')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('refuses a target replaced while its pre-conform snapshot is being prepared', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    preparationReplacement.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Transactions.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt changed during preparation')
    expect(await box.project.read('governed.txt')).toBe('replacement\n')
  })

  test('does not overwrite a target replaced during rollback', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed-1.txt', 'before-1\n')
    await box.project.write('governed-2.txt', 'before-2\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
        code: 'F', title: 'Family', description: 'Transactions.', standard: 'standard.md', selectContext: (context) => context,
        items: [
          ${governedItem('governed-1.txt', 'EXAMPLE-1', 'after-1\\n')},
          ${governedItem('governed-2.txt', 'EXAMPLE-2', 'after-2\\n')}
        ]
      }]`)
    })
    renameFailure.enabled = true
    rollbackReplacement.enabled = true

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform rollback target governed-1.txt changed after publication')
    expect(await box.project.read('governed-1.txt')).toBe('third-party replacement\n')
    expect(await box.project.read('governed-2.txt')).toBe('before-2\n')
  })

  test('removes an already-created file when a later create fails during publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(`[{
        code: 'F', title: 'Family', description: 'Transactions.', standard: 'standard.md', selectContext: (context) => context,
        items: [
          ${governedItem('created-1.txt', 'EXAMPLE-1', 'after-1\\n').replace("path: 'created-1.txt', content: 'after-1\\n'", "path: 'created-1.txt', content: 'after-1\\n', create: true")},
          ${governedItem('created-2.txt', 'EXAMPLE-2', 'after-2\\n').replace("path: 'created-2.txt', content: 'after-2\\n'", "path: 'created-2.txt', content: 'after-2\\n', create: true")}
        ]
      }]`)
    })
    linkFailure.enabled = true

    await expect(box.run('ki repo conform')).rejects.toThrow('link failure')

    await expect(box.project.read('created-1.txt')).rejects.toThrow()
    await expect(box.project.read('created-2.txt')).rejects.toThrow()
  })
})
