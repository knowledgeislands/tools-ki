// The guarded publisher rechecks each target immediately before its own atomic
// replacement. These narrow filesystem interleavings cannot be induced through
// one normal CLI invocation, so this CLI-contract test injects them at the
// filesystem boundary. Ordinary incremental cases live in repo.test.ts.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const readInterception = vi.hoisted(() => ({ path: undefined as string | undefined, count: 0 }))
const renameFailure = vi.hoisted(() => ({ enabled: false, calls: 0 }))
const identityReplacement = vi.hoisted(() => ({ path: undefined as string | undefined, count: 0 }))
const preparationReplacement = vi.hoisted(() => ({ path: undefined as string | undefined, count: 0 }))
const linkFailure = vi.hoisted(() => ({ enabled: false, calls: 0 }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
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
        if (identityReplacement.count === 3) {
          const replacement = `${String(path)}.concurrent-replacement`
          await original.writeFile(replacement, 'before\n', 'utf8')
          await original.rename(replacement, String(path))
        }
      }
      return original.lstat(...arguments_)
    },
    link: async (...arguments_: Parameters<typeof original.link>) => {
      if (linkFailure.enabled && ++linkFailure.calls === 2) throw new Error('link failure')
      await original.link(...arguments_)
    },
    rename: async (...arguments_: Parameters<typeof original.rename>) => {
      if (renameFailure.enabled && ++renameFailure.calls === 2) throw new Error('rename failure')
      await original.rename(...arguments_)
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
  linkFailure.enabled = false
  linkFailure.calls = 0
})

const rubric = (families: string): string => `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'guarded incremental publication',
  createSession: async ({ repository }) => {
    const proposals = []
    const context = { repository, propose: (proposal) => proposals.push(proposal) }
    return {
      subjects: [{ families: ${families}.map(({ code }) => code), context: () => context }],
      proposal: () => ({ writes: proposals.flatMap(({ writes = [] }) => writes) })
    }
  },
  families: ${families}
}
`

const governedItem = (path: string, code: string, content: string) => `{
  code: '${code}', title: '${code}', description: 'Publication test item.', sources: ['standard.md'],
  mechanical: {
    level: 'FAIL',
    audit: { phase: 'PRIMARY', run: async () => [{ status: 'VIOLATION', message: 'not conformed' }] },
    conform: { phase: 'PRIMARY', run: async (context) => { context.propose({ writes: [{ path: '${path}', content: '${content}' }] }) } }
  }
}`

describe('[ki repo conform] guarded incremental publication', () => {
  test('refuses publication when a target changes before its atomic replacement', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    readInterception.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Publication.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt changed before publication')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('retains an earlier successful write when a later replacement fails', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed-1.txt', 'before-1\n')
    await box.project.write('governed-2.txt', 'before-2\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Publication.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed-1.txt', 'EXAMPLE-1', 'after-1\\n')}, ${governedItem('governed-2.txt', 'EXAMPLE-2', 'after-2\\n')}] }]`
      )
    })
    renameFailure.enabled = true

    await expect(box.run('ki repo conform')).rejects.toThrow('rename failure')

    expect(await box.project.read('governed-1.txt')).toBe('after-1\n')
    expect(await box.project.read('governed-2.txt')).toBe('before-2\n')
  })

  test('refuses a same-byte target replacement before publication', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    identityReplacement.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Publication.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt changed before publication')
    expect(await box.project.read('governed.txt')).toBe('before\n')
  })

  test('refuses a target replaced while its publication snapshot is taken', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.project.write('governed.txt', 'before\n')
    preparationReplacement.path = '/governed.txt'
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Publication.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('governed.txt', 'EXAMPLE-1', 'after\\n')}] }]`
      )
    })

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('direct conform write target governed.txt changed during publication')
    expect(await box.project.read('governed.txt')).toBe('replacement\n')
  })

  test('retains an already-created file when a later create fails', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example]\n')
    await box.setupExampleHarness({
      rubric: rubric(
        `[{ code: 'F', title: 'Family', description: 'Publication.', standard: 'standard.md', selectContext: (context) => context, items: [${governedItem('created-1.txt', 'EXAMPLE-1', 'after-1\\n').replace("path: 'created-1.txt', content: 'after-1\\n'", "path: 'created-1.txt', content: 'after-1\\n', create: true")}, ${governedItem('created-2.txt', 'EXAMPLE-2', 'after-2\\n').replace("path: 'created-2.txt', content: 'after-2\\n'", "path: 'created-2.txt', content: 'after-2\\n', create: true")}] }]`
      )
    })
    linkFailure.enabled = true

    await expect(box.run('ki repo conform')).rejects.toThrow('link failure')

    expect(await box.project.read('created-1.txt')).toBe('after-1\n')
    await expect(box.project.read('created-2.txt')).rejects.toThrow()
  })
})
