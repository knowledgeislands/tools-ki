import { realpath, symlink } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// A real invocation cannot make the already-preflighted local configuration
// replacement fail on demand. This narrow filesystem-boundary fault proves the
// initializer removes its newly created declaration when registration fails.
const registryWriteFailure = vi.hoisted(() => ({ path: undefined as string | undefined }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    rename: (...arguments_: Parameters<typeof original.rename>) => {
      if (registryWriteFailure.path && String(arguments_[1]) === registryWriteFailure.path)
        return Promise.reject(new Error('registry write failure'))
      return original.rename(...arguments_)
    }
  }
})

afterEach(() => {
  registryWriteFailure.path = undefined
})

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

const gitRepositoryRunner = (root: string) => async (command: string, arguments_: readonly string[]) =>
  command === 'git' && arguments_.join(' ') === `-C ${root} rev-parse --show-toplevel`
    ? { exitCode: 0, output: `${root}\n` }
    : { exitCode: 1, output: '' }

const initialise = (box: Awaited<ReturnType<typeof sandbox>>, directory?: string) =>
  box.run([
    'ki',
    'repo',
    'init',
    ...(directory ? [directory] : []),
    '--title',
    'Example repository',
    '--description',
    'Repository initialization contract.',
    '--repo-code',
    'EXAMPLE',
    '--runtime',
    'claude-code',
    '--runtime',
    'chatgpt-codex',
    '--visibility',
    'private'
  ])

test('initializes one explicit physical Git root and registers its complete KI identity', async () => {
  const box = await sandbox()
  await box.config.write('ki/config.toml', localConfiguration)
  const root = await realpath(box.project.path)
  box.setRunner(gitRepositoryRunner(root))

  const result = await initialise(box)

  expect(result).toEqual({
    exitCode: 0,
    output: `write .ki-config.toml\nwrite config.toml\nki repo init: initialized ${root}\n`
  })
  expect(await box.project.read('.ki-config.toml')).toEqual(
    '["knowledgeislands/ki-agentic-harness:ki-repo"]\n' +
      'title = "Example repository"\n' +
      'description = "Repository initialization contract."\n' +
      'repo_code = "EXAMPLE"\n' +
      'supported_runtimes = ["claude-code", "chatgpt-codex"]\n' +
      'visibility = "private"\n'
  )
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n  ${JSON.stringify(root)},\n]`)
})

test('initializes an explicit directory but refuses non-root, linked, and already-declared targets', async () => {
  const box = await sandbox()
  await box.config.write('ki/config.toml', localConfiguration)
  const repository = await box.root.mkdir('repository')
  const nested = await box.root.mkdir('repository/nested')
  const linked = `${box.root.path}/linked`
  await symlink(repository, linked)
  box.setRunner(async (command, arguments_) =>
    command === 'git' && arguments_[0] === '-C' && arguments_[2] === 'rev-parse'
      ? { exitCode: 0, output: `${repository}\n` }
      : { exitCode: 1, output: '' }
  )

  const initialized = await initialise(box, repository)
  const nestedTarget = await initialise(box, nested)
  const linkedTarget = await initialise(box, linked)
  const repeated = await initialise(box, repository)

  expect(initialized.exitCode).toBe(0)
  expect(nestedTarget).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init target must be the Git repository root\n'
  })
  expect(linkedTarget).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init target must be an existing physical directory\n'
  })
  expect(repeated).toEqual({ exitCode: 2, output: 'ki: error: ki repo init target already has .ki-config.toml\n' })
})

test('refuses non-Git targets and invalid or incomplete explicit identity metadata before writing', async () => {
  const box = await sandbox()
  await box.config.write('ki/config.toml', localConfiguration)
  box.setRunner(async () => ({ exitCode: 1, output: 'not a repository' }))

  const nonGit = await initialise(box)
  const missingTitle = await box.run(
    'ki repo init --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility private'
  )
  const missingDescription = await box.run(
    'ki repo init --title title --repo-code EXAMPLE --runtime chatgpt-codex --visibility private'
  )
  const missingCode = await box.run(
    'ki repo init --title title --description description --runtime chatgpt-codex --visibility private'
  )
  const missingRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --visibility private'
  )
  const missingVisibility = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex'
  )
  const invalidCode = await box.run(
    'ki repo init --title title --description description --repo-code example --runtime chatgpt-codex --visibility private'
  )
  const invalidRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime node --visibility private'
  )
  const retiredRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime codex --visibility private'
  )
  const repeatedRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --runtime chatgpt-codex --visibility private'
  )
  const invalidVisibility = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility internal'
  )
  const selectors = await box.run(
    'ki repo --repo ignored init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility private'
  )

  expect(nonGit).toEqual({ exitCode: 2, output: 'ki: error: ki repo init target must be an existing Git repository\n' })
  expect(missingTitle).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --title\n' })
  expect(missingDescription).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --description\n' })
  expect(missingCode).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --repo-code\n' })
  expect(missingRuntime).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires at least one --runtime\n' })
  expect(missingVisibility).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --visibility\n' })
  expect(invalidCode).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --repo-code must be a stable uppercase identifier\n'
  })
  expect(invalidRuntime).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --runtime may contain only claude-code or chatgpt-codex\n'
  })
  expect(retiredRuntime).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --runtime codex is retired; use chatgpt-codex\n'
  })
  expect(repeatedRuntime).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --runtime must not repeat a runtime\n'
  })
  expect(invalidVisibility).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --visibility must be public or private\n'
  })
  expect(selectors).toEqual({ exitCode: 2, output: 'ki: error: ki repo init does not accept --repo or --agora\n' })
  await expect(box.project.read('.ki-config.toml')).rejects.toThrow()
})

test('initializes a public repository without rewriting an existing local registry entry', async () => {
  const box = await sandbox()
  const repository = await box.root.mkdir('registered-repository')
  await box.config.write(
    'ki/config.toml',
    `${localConfiguration}\n[repositories]\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
  )
  box.setRunner(gitRepositoryRunner(repository))

  const result = await box.run([
    'ki',
    'repo',
    'init',
    repository,
    '--title',
    'Public repository',
    '--description',
    'Already registered.',
    '--repo-code',
    'PUBLIC',
    '--runtime',
    'chatgpt-codex',
    '--visibility',
    'public'
  ])

  expect(result).toEqual({ exitCode: 0, output: `write .ki-config.toml\nki repo init: initialized ${repository}\n` })
  expect(await box.root.read('registered-repository/.ki-config.toml')).toContain('visibility = "public"')
})

test('leaves no declaration when local registration cannot be prepared or published', async () => {
  const box = await sandbox()
  const root = await realpath(box.project.path)
  box.setRunner(gitRepositoryRunner(root))

  const unbootstrapped = await initialise(box)

  expect(unbootstrapped).toEqual({
    exitCode: 1,
    output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n'
  })
  await expect(box.project.read('.ki-config.toml')).rejects.toThrow()

  await box.config.write('ki/config.toml', localConfiguration)
  registryWriteFailure.path = await realpath(`${box.config.path}/ki/config.toml`)

  await expect(initialise(box)).rejects.toThrow('registry write failure')
  await expect(box.project.read('.ki-config.toml')).rejects.toThrow()
  expect(await box.config.read('ki/config.toml')).toEqual(localConfiguration)
})

test('audits, conforms, and lists the local ki-repo registry without discovering other paths', async () => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\n')
  await box.config.write('ki/config.toml', localConfiguration)

  const audit = await box.run('ki repo audit')
  const dryRun = await box.run('ki repo conform --dry-run')
  const conform = await box.run('ki repo conform')
  const repeatedConform = await box.run('ki repo conform')
  const listed = await box.run('ki registry list')
  const repository = await realpath(box.project.path)

  expect(audit.exitCode).toBe(1)
  expect(audit.output).toContain('[Local repository registration (REPO-REG-1)]')
  expect(dryRun.output).toContain('would write config.toml')
  expect(conform.exitCode).toBe(0)
  expect(conform.output).toContain('write config.toml')
  expect(repeatedConform.exitCode).toBe(0)
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n  ${JSON.stringify(repository)},\n]`)
  expect(listed).toEqual({ exitCode: 0, output: `${repository}\n` })
  expect((await box.run('ki repo audit')).output).toContain(
    '╰─ summary: PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0'
  )
})

test('registers a selected KI repository even when its declaration cannot resolve', async () => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[ki-repo]\n')
  await box.config.write('ki/config.toml', localConfiguration)

  const repository = await realpath(box.project.path)
  const dryRun = await box.run(['ki', 'registry', '--repo', repository, 'add', '--dry-run'])
  const result = await box.run(['ki', 'registry', '--repo', repository, 'add'])

  expect(dryRun).toEqual({
    exitCode: 0,
    output: `would write config.toml\nki registry add: would register ${repository}\n`
  })
  expect(result).toEqual({ exitCode: 0, output: `write config.toml\nki registry add: registered ${repository}\n` })
  expect(await box.config.read('ki/config.toml')).toContain(`paths = [\n  ${JSON.stringify(repository)},\n]`)
})

test('preserves and extends an existing local repository registry in deterministic order', async () => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[ki-repo]\n')
  const later = await box.root.mkdir('z-later')
  const earlier = await box.root.mkdir('a-earlier')
  const repository = await realpath(box.project.path)
  await box.config.write(
    'ki/config.toml',
    `${localConfiguration}\n[repositories]\npaths = [\n  ${JSON.stringify(later)},\n  ${JSON.stringify(earlier)},\n]\n`
  )

  const registered = await box.run('ki registry add')
  const repeated = await box.run('ki registry add')
  const expected = [later, earlier, repository].sort((left, right) => left.localeCompare(right))

  expect(registered).toEqual({ exitCode: 0, output: `write config.toml\nki registry add: registered ${repository}\n` })
  expect(repeated).toEqual({ exitCode: 0, output: `ki registry add: already registered ${repository}\n` })
  expect(await box.config.read('ki/config.toml')).toContain(
    `paths = [\n${expected.map((path) => `  ${JSON.stringify(path)},`).join('\n')}\n]`
  )
})

test('reports missing, invalid, and unsafe local registry configuration without repairing it', async () => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.project.write('.ki-config.toml', '["example/harness:ki-repo"]\n')

  const missingList = await box.run('ki registry list')
  const missingAudit = await box.run('ki repo audit')
  const missingConform = await box.run('ki repo conform')
  const missingRegister = await box.run('ki registry add')
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = ["relative-repository"]\n`)
  const invalidAudit = await box.run('ki repo audit')
  const invalidConform = await box.run('ki repo conform')
  const invalidRegister = await box.run('ki registry add')
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = []\nextra = true\n`)
  const warnedRegister = await box.run('ki registry add')

  expect(missingList).toEqual({
    exitCode: 1,
    output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n'
  })
  expect(missingAudit.output).toContain('local KI configuration is missing; run `ki bootstrap` first')
  expect(missingConform.exitCode).toBe(0)
  expect(missingRegister).toEqual({
    exitCode: 1,
    output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n'
  })
  expect(invalidAudit.output).toContain(
    'local KI configuration is invalid: repositories.paths must contain absolute paths'
  )
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

  expect(await box.run('ki registry list')).toEqual({ exitCode: 0, output: '' })
})

test('retires repository-scoped registry commands without a compatibility path', async () => {
  const box = await sandbox()

  expect((await box.run('ki repo list')).exitCode).toBe(2)
  expect((await box.run('ki repo register')).exitCode).toBe(2)
})

test('lists registered repositories as a newline-delimited absolute-path stream', async () => {
  const box = await sandbox()
  const first = await box.root.mkdir('first')
  const second = await box.root.mkdir('second')
  await box.config.write(
    'ki/config.toml',
    `${localConfiguration}\n[repositories]\npaths = [${JSON.stringify(second)}, ${JSON.stringify(first)}]\n`
  )

  expect(await box.run('ki registry list')).toEqual({ exitCode: 0, output: `${second}\n${first}\n` })
})

test('rejects relative repository registry paths in user configuration', async () => {
  const box = await sandbox()
  await box.config.write('ki/config.toml', `${localConfiguration}\n[repositories]\npaths = ["relative-repository"]\n`)

  const listed = await box.run('ki registry list')

  expect(listed).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration is invalid: repositories.paths must contain absolute paths\n'
  })
})
