import { readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const rubric = (body: string): string => `
export default {
  contract: 1,
  skill: 'ki-example',
  scope: { kind: 'user-home', paths: ['.managed'] },
  createContext: async ({ userHome }) => ({ userHome }),
  families: ${body}
}
`

const governedItem = (repair: string): string => `[{
  code: 'USER', title: 'User',
  items: [{
    kind: 'mechanical', code: 'USER-1', title: 'Governed file', level: 'FAIL', phase: 'PRIMARY',
    audit: async ({ userHome }) => {
      const { readFile } = await import('node:fs/promises')
      const content = await readFile(userHome + '/.managed/governed.txt', 'utf8')
      return content === 'after\\n' ? [{ status: 'PASS', message: 'user file is conformed' }] : [{ status: 'VIOLATION', message: 'user file needs repair' }]
    },
    repair: async () => (${repair})
  }]
}]`

const setup = async (rubricSource: string) => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[ki-example]\n')
  await box.home.write('.managed/governed.txt', 'before\n')
  await box.setupExampleHarness({ rubric: rubricSource })
  return box
}

describe('[ki repo] user-home rubric scope', () => {
  test('audits and transactionally conforms a repository-declared user-home rubric', async () => {
    const box = await setup(rubric(governedItem(`{ writes: [{ path: '.managed/governed.txt', content: 'after\\n' }] }`)))

    const audit = await box.run('ki repo audit')
    const dryRun = await box.run('ki repo conform --dry-run')
    const conform = await box.run('ki repo conform')

    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain('fail USER-1: user file needs repair')
    expect(dryRun).toEqual({ exitCode: 0, output: 'would write .managed/governed.txt\n' })
    expect(conform).toEqual({ exitCode: 0, output: 'write .managed/governed.txt\nFIXED USER-1: user file is conformed\n' })
    expect(await box.home.read('.managed/governed.txt')).toBe('after\n')
  })

  test('refuses a user repair outside the rubric-declared filesystem scope', async () => {
    const box = await setup(rubric(governedItem(`{ writes: [{ path: '.other.txt', content: 'after\\n', create: true }] }`)))

    const result = await box.run('ki repo conform')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('.other.txt is outside its declared filesystem scope')
    await expect(box.home.read('.other.txt')).rejects.toThrow()
    expect(await box.home.read('.managed/governed.txt')).toBe('before\n')
  })

  test('refuses a symlinked user-home repair target before publishing anything', async () => {
    const box = await setup(rubric(governedItem(`{ writes: [{ path: '.managed/governed.txt', content: 'after\\n' }] }`)))
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
  skill: 'ki-example',
  scope: { kind: 'user-home', paths: ['../outside'] },
  createContext: async () => ({}),
  families: []
}
`)

    const result = await box.run('ki repo audit')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('user-home scope paths must be safe relative paths')
  })
})
