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
  const repeatedConform = await box.run('ki repo conform')
  const listed = await box.run('ki repo list')
  const repository = await realpath(box.project.path)

  expect(audit.exitCode).toBe(1)
  expect(audit.output).toContain('[Local repository registration (REPO-REG-1)]')
  expect(dryRun.output).toContain('would write config.toml')
  expect(conform.exitCode).toBe(0)
  expect(conform.output).toContain('write config.toml')
  expect(repeatedConform.exitCode).toBe(0)
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n  ${JSON.stringify(repository)},\n]`)
  expect(listed).toEqual({ exitCode: 0, output: `ki repo list\n  ${repository}\n` })
  expect((await box.run('ki repo audit')).output).toContain('ki repo audit: clean (1 skills)')
})

test('registers a selected KI repository even when its declaration cannot resolve', async () => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[ki-repo]\n')
  await box.config.write('ki/config.toml', localConfiguration)

  const dryRun = await box.run('ki repo register --dry-run')
  const result = await box.run('ki repo register')
  const repository = await realpath(box.project.path)

  expect(dryRun).toEqual({ exitCode: 0, output: `would write config.toml\nki repo register: would register ${repository}\n` })
  expect(result).toEqual({ exitCode: 0, output: `write config.toml\nki repo register: registered ${repository}\n` })
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n  ${JSON.stringify(repository)},\n]`)
})

test('preserves and extends an existing local repository registry in deterministic order', async () => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[ki-repo]\n')
  const earlier = await box.root.mkdir('earlier')
  const repository = await realpath(box.project.path)
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = [\n  ${JSON.stringify(earlier)},\n]\n`)

  const registered = await box.run('ki repo register')
  const repeated = await box.run('ki repo register')
  const expected = [earlier, repository].sort((left, right) => left.localeCompare(right))

  expect(registered).toEqual({ exitCode: 0, output: `write config.toml\nki repo register: registered ${repository}\n` })
  expect(repeated).toEqual({ exitCode: 0, output: `ki repo register: already registered ${repository}\n` })
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n${expected.map((path) => `  ${JSON.stringify(path)},`).join('\n')}\n]`)
})

test('reports missing, invalid, and unsafe local registry configuration without repairing it', async () => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\n')

  const missingList = await box.run('ki repo list')
  const missingAudit = await box.run('ki repo audit')
  const missingConform = await box.run('ki repo conform')
  const missingRegister = await box.run('ki repo register')
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = ["relative-repository"]\n`)
  const invalidAudit = await box.run('ki repo audit')
  const invalidConform = await box.run('ki repo conform')
  const invalidRegister = await box.run('ki repo register')
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = []\nextra = true\n`)
  const warnedRegister = await box.run('ki repo register')

  expect(missingList).toEqual({ exitCode: 1, output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n' })
  expect(missingAudit.output).toContain('local KI configuration is missing; run `ki bootstrap` first')
  expect(missingConform.exitCode).toBe(0)
  expect(missingRegister).toEqual({ exitCode: 1, output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n' })
  expect(invalidAudit.output).toContain('local KI configuration is invalid: repositories.paths must contain absolute paths')
  expect(invalidConform).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration is invalid: repositories.paths must contain absolute paths\n'
  })
  expect(invalidRegister).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration is invalid: repositories.paths must contain absolute paths\n'
  })
  expect(warnedRegister).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration repositories section has unrecognised keys; resolve them before conforming\n'
  })
})

test('lists an explicitly empty local repository registry', async () => {
  const box = await sandbox()
  await box.config.write('ki/config.toml', localConfiguration)

  expect(await box.run('ki repo list')).toEqual({ exitCode: 0, output: 'ki repo list\n  none\n' })
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
