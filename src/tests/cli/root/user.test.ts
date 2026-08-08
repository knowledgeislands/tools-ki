import { readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const rubric = (body: string): string => `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'user files',
  scope: { kind: 'user-home', paths: ['.managed'] },
  createSession: async ({ userHome }) => {
    let proposal = { writes: [] }
    const context = { userHome, propose: (value) => { proposal = value } }
    return {
      subjects: [{ families: ['USER'], context: () => context }],
      proposal: () => proposal
    }
  },
  families: ${body}
}
`

const governedItem = (conform: string): string => `[{
  code: 'USER', title: 'User', description: 'User files.', standard: 'standard.md',
  selectContext: (context) => context,
  items: [{
    code: 'USER-1', title: 'Governed file', description: 'The file is governed.', sources: ['standard.md'],
    mechanical: {
      level: 'FAIL',
      remediation: { class: 'automatic' },
      audit: { phase: 'PRIMARY', run: async ({ userHome }) => {
        const { readFile } = await import('node:fs/promises')
        const content = await readFile(userHome + '/.managed/governed.txt', 'utf8')
        return content === 'after\\n' ? [{ status: 'PASS', message: 'user file is conformed' }] : [{ status: 'VIOLATION', message: 'user file needs conform' }]
      }},
      conform: { phase: 'PRIMARY', run: async (context) => { context.propose(${conform}) } }
    },
  }]
}]`

const setup = async (rubricSource: string) => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
  await box.home.write('.managed/governed.txt', 'before\n')
  await box.setupExampleHarness({ rubric: rubricSource })
  return box
}

describe('[ki repo] user-home rubric scope', () => {
  test('audits and incrementally conforms a repository-declared user-home rubric', async () => {
    const box = await setup(
      rubric(governedItem(`{ writes: [{ path: '.managed/governed.txt', content: 'after\\n' }] }`))
    )

    const audit = await box.run('ki repo audit')
    const dryRun = await box.run('ki repo conform --dry-run')
    const conform = await box.run('ki repo conform')

    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain('× fail  [Governed file (USER-1)] — user file needs conform')
    expect(dryRun.output).toContain('would apply write .managed/governed.txt\n')
    expect(conform.output).toContain('applied write .managed/governed.txt\n')
    expect(conform.output).toContain('↺ fixed [Governed file (USER-1)] — user file is conformed')
    expect(await box.home.read('.managed/governed.txt')).toBe('after\n')
  })

  test('refuses a user conform outside the rubric-declared filesystem scope', async () => {
    const box = await setup(
      rubric(governedItem(`{ writes: [{ path: '.other.txt', content: 'after\\n', create: true }] }`))
    )

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('.other.txt is outside its declared filesystem scope')
    await expect(box.home.read('.other.txt')).rejects.toThrow()
    expect(await box.home.read('.managed/governed.txt')).toBe('before\n')
  })

  test('refuses a symlinked user-home conform target before publishing anything', async () => {
    const box = await setup(
      rubric(governedItem(`{ writes: [{ path: '.managed/governed.txt', content: 'after\\n' }] }`))
    )
    await box.root.write('outside.txt', 'outside\n')
    await rm(join(box.home.path, '.managed', 'governed.txt'))
    await symlink(join(box.root.path, 'outside.txt'), join(box.home.path, '.managed', 'governed.txt'))

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('.managed/governed.txt must be an existing regular file')
    expect(await readFile(join(box.root.path, 'outside.txt'), 'utf8')).toBe('outside\n')
  })

  test('rejects an unsafe user-home scope before executing its rubric', async () => {
    const box = await setup(`
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'user files',
  scope: { kind: 'user-home', paths: ['../outside'] },
  createSession: async () => ({}),
  families: []
}
`)

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('user-home scope paths must be safe relative paths')
  })

  test('refuses user-home subprocess conforms before a command can run', async () => {
    const box = await setup(rubric(governedItem(`{ writes: [], commands: [{ program: 'false', arguments: [] }] }`)))

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('user-home rubric conform actions must be guarded direct writes')
  })
})
