import { realpath } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const localConfiguration = `schema = 1

[agents]
ids = []

[harnesses]
ids = []

[skills]
`

const rubric = `
export default {
  contract: 1,
  name: 'ki-repo',
  concern: 'repository registration',
  createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }),
  families: []
}
`

test('audits, conforms, and lists the local ki-repo registry without discovering other paths', async () => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\n')
  await box.config.write('ki/config.toml', localConfiguration)

  const audit = await box.run('ki repo audit')
  const dryRun = await box.run('ki repo conform --dry-run')
  const conform = await box.run('ki repo conform')
  const listed = await box.run('ki repo list')
  const repository = await realpath(box.project.path)

  expect(audit.exitCode).toBe(1)
  expect(audit.output).toContain('[Local repository registration (REPO-REG-1)]')
  expect(dryRun.output).toContain('would write config.toml')
  expect(conform.exitCode).toBe(0)
  expect(conform.output).toContain('write config.toml')
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n  ${JSON.stringify(repository)},\n]`)
  expect(listed).toEqual({ exitCode: 0, output: `ki repo list\n  ${repository}\n` })
  expect((await box.run('ki repo audit')).output).toContain('ki repo audit: clean (1 skills)')
})

test('rejects relative repository registry paths in user configuration', async () => {
  const box = await sandbox()
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = ["relative-repository"]\n`)

  const listed = await box.run('ki repo list')

  expect(listed).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration is invalid: repositories.paths must contain absolute paths\n'
  })
})
