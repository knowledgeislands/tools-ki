import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const check = async (message: string) => {
  const box = await sandbox()
  await box.project.write('COMMIT_EDITMSG', message)
  return box.run(['ki', 'git', 'check-message', 'COMMIT_EDITMSG'])
}

describe('ki git check-message', () => {
  test.each([
    'chore: tidy',
    'docs(roadmap): plan KI-TOOL-KI-CLI-161 to Ready',
    'feat(repo)!: drop the old hook path',
    'fix(acquire/granola): keep the checkpoint',
    'refactor(git, repo): share one reader',
    'test: cover the scissors line\n\nBody text.\n'
  ])('passes %j silently', async (message) => {
    const result = await check(message)
    expect(result).toMatchObject({ exitCode: 0, stdout: '', stderr: '' })
  })

  test.each([
    ['', 'header-empty: the message is empty', 'write a Conventional Commit header'],
    ['# only a comment\n', 'header-empty: the message is empty', 'write a Conventional Commit header'],
    [
      'Add the check',
      "header-format: 'Add the check' is not a Conventional Commit header",
      'write the header as type(scope): subject, or type: subject'
    ],
    [
      'build: bump',
      "type-enum: type 'build' is not one of chore, docs, feat, fix, refactor, test",
      'use one of the permitted types'
    ],
    [
      'feat(Repo): add',
      "scope-case: scope 'Repo' is not lowercase kebab-case",
      'write the scope in lowercase kebab-case'
    ],
    ['feat(a,): add', "scope-case: scope 'a,' is not lowercase kebab-case", 'write the scope in lowercase kebab-case'],
    ['fix:  ', 'subject-empty: the subject is empty', 'write the header as type(scope): subject, or type: subject'],
    ['fix: add the check.', 'subject-full-stop: the subject ends with a full stop', 'drop the full stop']
  ])('rejects %j naming the rule and remedy', async (message, reason, remedy) => {
    const result = await check(message)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe(`ki: error: ${reason}\nnext: ${remedy}\n`)
  })

  test('ignores comment lines, leading blank lines and everything from the scissors line', async () => {
    const message = [
      '# Please enter the commit message',
      '',
      'fix: keep the checkpoint',
      '# Changes to be committed:',
      '# ------------------------ >8 ------------------------',
      'diff --git a/x b/x',
      ''
    ].join('\n')
    expect((await check(message)).exitCode).toBe(0)
    expect((await check('# ------------------------ >8 ------------------------\nfix: x\n')).exitCode).toBe(1)
  })

  test.each([
    "Merge branch 'main' into topic",
    "Merge remote-tracking branch 'origin/main'",
    'Merge tag v0.12.0',
    'Merge pull request #12 from krisb/topic',
    "Merge commit 'abc123' into main",
    'Revert "feat: add the check"',
    'Reapply "feat: add the check"',
    'fixup! feat: add the check',
    'squash! feat: add the check',
    'amend! feat: add the check'
  ])('passes the Git-generated header %j', async (message) => {
    expect((await check(message)).exitCode).toBe(0)
  })

  test('refuses a missing message file, naming its path', async () => {
    const box = await sandbox()
    const result = await box.run(['ki', 'git', 'check-message', 'missing'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe(
      `ki: error: cannot read the commit message file ${await realpath(box.project.path)}/missing\n`
    )
  })
})
