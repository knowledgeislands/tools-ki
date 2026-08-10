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

const localRegistry = (
  entries: readonly { readonly key: string; readonly repository: string; readonly path: string }[]
): string =>
  [
    'schema = 1',
    ...(entries.length ? [] : ['repositories = {}']),
    ...entries.flatMap((entry) => [
      '',
      `[repositories.${JSON.stringify(entry.key)}]`,
      `repository = ${JSON.stringify(entry.repository)}`,
      `path = ${JSON.stringify(entry.path)}`
    ]),
    ''
  ].join('\n')

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
    '--repository',
    'https://github.com/example/project',
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
    output: `write .ki-config.toml\nwrite registry.toml\nki repo init: initialized ${root}\n`
  })
  expect(await box.project.read('.ki-config.toml')).toEqual(
    '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n\n[skills.ki-repo]\n' +
      'repository = "https://github.com/example/project"\n' +
      'title = "Example repository"\n' +
      'description = "Repository initialization contract."\n' +
      'repo_code = "EXAMPLE"\n' +
      'supported_runtimes = ["claude-code", "chatgpt-codex"]\n' +
      'visibility = "private"\n'
  )
  expect(await box.state.read('ki/registry.toml')).toContain(`path = ${JSON.stringify(root)}`)
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
  const noRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --repository https://github.com/example/project --visibility private'
  )
  const invalidCode = await box.run(
    'ki repo init --title title --description description --repo-code example --runtime chatgpt-codex --visibility private --repository https://github.com/example/project'
  )
  const invalidRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime node --visibility private --repository https://github.com/example/project'
  )
  const retiredRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime codex --visibility private --repository https://github.com/example/project'
  )
  const repeatedRuntime = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --runtime chatgpt-codex --visibility private --repository https://github.com/example/project'
  )
  const invalidVisibility = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility internal --repository https://github.com/example/project'
  )
  const invalidRepository = await box.run(
    'ki repo init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility private --repository https://example.test/project'
  )
  const selectors = await box.run(
    'ki repo --repo ignored init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility private'
  )

  expect(nonGit).toEqual({ exitCode: 2, output: 'ki: error: ki repo init target must be an existing Git repository\n' })
  expect(missingTitle).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --title\n' })
  expect(missingDescription).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --description\n' })
  expect(missingCode).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --repo-code\n' })
  expect(missingRuntime).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --repository\n' })
  expect(missingVisibility).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires --visibility\n' })
  expect(noRuntime).toEqual({ exitCode: 2, output: 'ki: error: ki repo init requires at least one --runtime\n' })
  expect(invalidCode).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --repo-code must be a stable uppercase identifier\n'
  })
  expect(invalidRuntime).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --runtime may contain only claude-code, claude-desktop, or chatgpt-codex\n'
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
  expect(invalidRepository).toEqual({
    exitCode: 2,
    output: 'ki: error: ki repo init --repository must be a canonical HTTPS GitHub repository\n'
  })
  expect(selectors).toEqual({ exitCode: 2, output: 'ki: error: ki repo init does not accept --repo or --agora\n' })
  await expect(box.project.read('.ki-config.toml')).rejects.toThrow()
})

test('initializes a public repository without rewriting an existing local registry entry', async () => {
  const box = await sandbox()
  const repository = await box.root.mkdir('registered-repository')
  await box.config.write('ki/config.toml', localConfiguration)
  await box.state.write(
    'ki/registry.toml',
    `schema = 1\n\n[repositories."registered-repository"]\nrepository = "https://github.com/example/public"\npath = ${JSON.stringify(repository)}\n`
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
    '--repository',
    'https://github.com/example/public',
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
  await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\n')
  registryWriteFailure.path = await realpath(`${box.state.path}/ki/registry.toml`)

  await expect(initialise(box)).rejects.toThrow('registry write failure')
  await expect(box.project.read('.ki-config.toml')).rejects.toThrow()
  expect(await box.config.read('ki/config.toml')).toEqual(localConfiguration)
})

test('refuses repository initialization when the bootstrapped local configuration is invalid', async () => {
  const box = await sandbox()
  const root = await realpath(box.project.path)
  box.setRunner(gitRepositoryRunner(root))
  await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')

  expect(await initialise(box)).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n'
  })
  await expect(box.project.read('.ki-config.toml')).rejects.toThrow()
})

test('audits, conforms, and lists the local ki-repo registry without discovering other paths', async () => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
  )
  await box.config.write('ki/config.toml', localConfiguration)

  const audit = await box.run('ki repo audit')
  const dryRun = await box.run('ki repo conform --dry-run')
  const conform = await box.run('ki repo conform')
  const repeatedConform = await box.run('ki repo conform')
  const listed = await box.run('ki registry list')
  const repository = await realpath(box.project.path)

  expect(audit.exitCode).toBe(1)
  expect(audit.output).toContain('[Local repository registration (REPO-REG-1)]')
  expect(dryRun.output).toContain('would write registry.toml')
  expect(conform.exitCode).toBe(0)
  expect(conform.output).toContain('write registry.toml')
  expect(repeatedConform.exitCode).toBe(0)
  expect(await box.state.read('ki/registry.toml')).toContain(`path = ${JSON.stringify(repository)}`)
  expect(listed).toEqual({ exitCode: 0, output: `${repository}\n` })
  expect((await box.run('ki repo audit')).output).toContain(
    '╰─ summary: KI REPO AUDIT on project PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0'
  )
})

test('registers a selected KI repository carrying a canonical identity', async () => {
  const box = await sandbox()
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
  )
  await box.config.write('ki/config.toml', localConfiguration)

  const repository = await realpath(box.project.path)
  const dryRun = await box.run(['ki', 'registry', '--repo', repository, 'add', '--dry-run'])
  const result = await box.run(['ki', 'registry', '--repo', repository, 'add'])

  expect(dryRun).toEqual({
    exitCode: 0,
    output: `would write registry.toml\nki registry add: would register ${repository}\n`
  })
  expect(result).toEqual({ exitCode: 0, output: `write registry.toml\nki registry add: registered ${repository}\n` })
  expect(await box.state.read('ki/registry.toml')).toContain(`path = ${JSON.stringify(repository)}`)
})

test('refuses a repository registration without a declared canonical identity', async () => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\n')

  expect(await box.run('ki registry add')).toEqual({
    exitCode: 1,
    output: 'ki: error: [skills.ki-repo].repository must be a canonical HTTPS GitHub repository\n'
  })
})

test('refuses a repository whose local directory name cannot become a registry key', async () => {
  const box = await sandbox()
  const repository = await box.root.mkdir('UPPER')
  await box.root.write(
    'UPPER/.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
  )

  expect(await box.run(['ki', 'registry', '--repo', repository, 'add'])).toEqual({
    exitCode: 1,
    output: `ki: error: repository root ${repository} has no valid local repository name\n`
  })
})

test('preserves and extends an existing local repository registry in deterministic order', async () => {
  const box = await sandbox()
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
  )
  const later = await box.root.mkdir('z-later')
  const earlier = await box.root.mkdir('a-earlier')
  const repository = await realpath(box.project.path)
  await box.config.write('ki/config.toml', localConfiguration)
  await box.state.write(
    'ki/registry.toml',
    localRegistry([
      { key: 'z-later', repository: 'https://github.com/example/later', path: later },
      { key: 'a-earlier', repository: 'https://github.com/example/earlier', path: earlier }
    ])
  )

  const registered = await box.run('ki registry add')
  const repeated = await box.run('ki registry add')
  const expected = [later, earlier, repository].sort((left, right) => left.localeCompare(right))

  expect(registered).toEqual({
    exitCode: 0,
    output: `write registry.toml\nki registry add: registered ${repository}\n`
  })
  expect(repeated).toEqual({ exitCode: 0, output: `ki registry add: already registered ${repository}\n` })
  const registry = await box.state.read('ki/registry.toml')
  for (const path of expected) expect(registry).toContain(`path = ${JSON.stringify(path)}`)
})

test('reports missing, invalid, and unsafe local registry configuration without repairing it', async () => {
  const box = await sandbox()
  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
  )

  const missingList = await box.run('ki registry list')
  const missingAudit = await box.run('ki repo audit')
  const missingConform = await box.run('ki repo conform')
  const missingRegister = await box.run('ki registry add')
  await box.config.write('ki/config.toml', localConfiguration)
  await box.state.write(
    'ki/registry.toml',
    'schema = 1\n[repositories."relative"]\nrepository = "https://github.com/example/relative"\npath = "relative-repository"\n'
  )
  const invalidAudit = await box.run('ki repo audit')
  const invalidConform = await box.run('ki repo conform')
  const invalidRegister = await box.run('ki registry add')
  await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')
  const invalidLocalConform = await box.run('ki repo conform')
  const invalidLocalAudit = await box.run('ki repo audit')
  await box.config.write('ki/config.toml', localConfiguration)
  await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')
  const warnedRegister = await box.run('ki registry add')

  expect(missingList).toEqual({ exitCode: 0, output: '' })
  expect(missingAudit.output).toContain('local KI configuration is missing; run `ki bootstrap` first')
  expect(missingConform.exitCode).toBe(0)
  expect(missingRegister.exitCode).toBe(0)
  expect(invalidAudit.output).toContain(
    'local KI repository registry is invalid: repositories.relative path must be an absolute path'
  )
  expect(invalidConform).toEqual({
    exitCode: 1,
    output: 'ki: error: local KI repository registry is invalid: repositories.relative path must be an absolute path\n'
  })
  expect(invalidRegister).toEqual({
    exitCode: 1,
    output: 'ki: error: local KI repository registry is invalid: repositories.relative path must be an absolute path\n'
  })
  expect(invalidLocalConform).toEqual({
    exitCode: 1,
    output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n'
  })
  expect(invalidLocalAudit.output).toContain('local KI configuration is invalid: configuration must be valid TOML')
  expect(warnedRegister).toEqual({
    exitCode: 1,
    output: 'ki: error: local KI repository registry is invalid: unrecognised key extra\n'
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
  await box.state.write(
    'ki/registry.toml',
    localRegistry([
      { key: 'second', repository: 'https://github.com/example/second', path: second },
      { key: 'first', repository: 'https://github.com/example/first', path: first }
    ])
  )

  expect(await box.run('ki registry list')).toEqual({ exitCode: 0, output: `${first}\n${second}\n` })
})

test('rejects relative repository registry paths in local state', async () => {
  const box = await sandbox()
  await box.state.write(
    'ki/registry.toml',
    'schema = 1\n[repositories."relative"]\nrepository = "https://github.com/example/relative"\npath = "relative-repository"\n'
  )

  const listed = await box.run('ki registry list')

  expect(listed).toEqual({
    exitCode: 1,
    output: 'ki: error: local KI repository registry is invalid: repositories.relative path must be an absolute path\n'
  })
})

test('rejects malformed state records and conflicting local bindings', async () => {
  const box = await sandbox()
  const root = await realpath(box.project.path)
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
  )
  const list = (): Promise<{ readonly exitCode: number; readonly output: string }> => box.run('ki registry list')
  const invalid = async (contents: string, expected: string): Promise<void> => {
    await box.state.write('ki/registry.toml', contents)
    expect((await list()).output).toContain(expected)
  }

  await invalid('[broken\n', 'registry must be valid TOML')
  await invalid('schema = 2\nrepositories = {}\n', 'schema must equal 1')
  await invalid(
    'schema = 1\nrepositories = "not-a-table"\n',
    'repositories must be a table of keyed repository records'
  )
  await invalid(
    'schema = 1\nrepositories = ["not-a-table"]\n',
    'repositories must be a table of keyed repository records'
  )
  await invalid('schema = 1\nrepositories = { one = "not-a-table" }\n', 'repositories.one must be a table')
  await invalid(
    `schema = 1\nrepositories = { one = { repository = "https://github.com/example/one", path = ${JSON.stringify(root)}, extra = true } }\n`,
    'repositories.one has unrecognised key extra'
  )
  await invalid(
    `schema = 1\nrepositories = { one = { repository = "https://github.com/example/one", path = ${JSON.stringify(root)}, stores = "invalid" } }\n`,
    'repositories.one.stores must be a table'
  )
  await invalid(
    `schema = 1\n[repositories.one]\nrepository = "https://github.com/example/one"\npath = ${JSON.stringify(root)}\n\n[repositories.one.stores]\nsources = "relative"\nextra = true\n`,
    'repositories.one.stores has unrecognised key extra'
  )
  await invalid(
    'schema = 1\n[repositories."Bad Key"]\nrepository = "not-a-url"\npath = "relative"\n',
    'repositories.Bad Key key must be a stable local repository name'
  )
  await invalid(
    `schema = 1\n[repositories."one"]\nrepository = "https://github.com/example/one"\npath = ${JSON.stringify(root)}\n\n[repositories."two"]\nrepository = "https://github.com/example/one"\npath = ${JSON.stringify(`${box.root.path}/two`)}\n`,
    'repositories repeats a repository'
  )

  const add = (): Promise<{ readonly exitCode: number; readonly output: string }> =>
    box.run(['ki', 'registry', '--repo', root, 'add'])
  await box.state.write(
    'ki/registry.toml',
    localRegistry([{ key: 'other', repository: 'https://github.com/example/project', path: `${box.root.path}/other` }])
  )
  expect((await add()).output).toContain('key other already identifies')
  await box.state.write(
    'ki/registry.toml',
    localRegistry([{ key: 'project', repository: 'https://github.com/example/other', path: `${box.root.path}/other` }])
  )
  expect((await add()).output).toContain('key project already identifies')
  await box.state.write(
    'ki/registry.toml',
    localRegistry([{ key: 'other', repository: 'https://github.com/example/other', path: root }])
  )
  expect((await add()).output).toContain(`path ${root} already identifies`)
})

test('rejects a symbolic-link registry file without following it', async () => {
  const box = await sandbox()
  await box.state.write('ki/actual-registry.toml', 'schema = 1\nrepositories = {}\n')
  await symlink(`${box.state.path}/ki/actual-registry.toml`, `${box.state.path}/ki/registry.toml`)

  expect(await box.run('ki registry list')).toEqual({
    exitCode: 1,
    output: 'ki: error: local KI repository registry is invalid: registry must be a regular file\n'
  })
})

test('registers and atomically replaces a declared Knowledge Base sources binding', async () => {
  const box = await sandbox()
  const first = await box.root.mkdir('first-notes')
  const second = await box.root.mkdir('second-notes')
  const ordinary = await box.root.mkdir('ordinary-notes')
  const firstSources = await box.root.mkdir('first-sources')
  const secondSources = await box.root.mkdir('second-sources')
  const identity = 'https://github.com/example/knowledge'
  const configuration =
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/knowledge"\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]\n'
  await box.root.write('first-notes/.ki-config.toml', configuration)
  await box.root.write('second-notes/.ki-config.toml', configuration)
  await box.root.write(
    'ordinary-notes/.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/knowledge"\n'
  )

  const firstRegistration = await box.run(['ki', 'registry', '--repo', first, 'add', '--sources', firstSources])
  const replacement = await box.run(['ki', 'registry', '--repo', second, 'add', '--sources', secondSources])

  expect(firstRegistration.exitCode).toBe(0)
  expect(replacement.exitCode).toBe(0)
  const registry = await box.state.read('ki/registry.toml')
  expect(registry).toContain(`repository = ${JSON.stringify(identity)}`)
  expect(registry).toContain(`path = ${JSON.stringify(second)}`)
  expect(registry).toContain(`sources = ${JSON.stringify(secondSources)}`)
  expect(registry).not.toContain(first)
  expect(await box.run(['ki', 'registry', '--repo', ordinary, 'add'])).toEqual({
    exitCode: 1,
    output:
      'ki: error: local KI repository registry key second-notes already identifies https://github.com/example/knowledge\n'
  })
  expect(await box.state.read('ki/registry.toml')).toEqual(registry)
})

test('refuses incomplete and unsafe declared Knowledge Base source bindings without changing the registry', async () => {
  const box = await sandbox()
  const root = await realpath(box.project.path)
  const identity = 'https://github.com/example/knowledge'
  const configuration =
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/knowledge"\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]\n'
  await box.project.write('.ki-config.toml', configuration)
  const before = `schema = 1\n\n[repositories."project"]\nrepository = ${JSON.stringify(identity)}\npath = ${JSON.stringify(root)}\n`
  await box.state.write('ki/registry.toml', before)
  await box.project.write('source-file', 'not a directory\n')
  const safe = await box.root.mkdir('safe-sources')
  await symlink(safe, `${box.root.path}/linked-sources`)

  const missing = await box.run('ki registry add')
  const relative = await box.run('ki registry add --sources relative')
  const absent = await box.run(['ki', 'registry', 'add', '--sources', `${box.root.path}/missing-sources`])
  const file = await box.run(['ki', 'registry', 'add', '--sources', `${box.project.path}/source-file`])
  const linked = await box.run(['ki', 'registry', 'add', '--sources', `${box.root.path}/linked-sources`])

  expect(missing.output).toContain('requires --sources')
  expect(relative.output).toContain('sources store must be an absolute path')
  expect(absent.output).toContain('sources store must be an existing direct directory')
  expect(file.output).toContain('sources store must be an existing direct directory')
  expect(linked.output).toContain('sources store must be an existing direct directory')
  expect(await box.state.read('ki/registry.toml')).toEqual(before)
})

test('requires source binding options to match exactly one selected Knowledge Base', async () => {
  const box = await sandbox()
  const knowledge = await realpath(box.project.path)
  const ordinary = await box.root.mkdir('ordinary')
  const sources = await box.root.mkdir('sources')
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/knowledge"\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]\n'
  )
  await box.root.write(
    'ordinary/.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/ordinary"\n'
  )

  expect(
    (await box.run(['ki', 'registry', '--repo', knowledge, '--repo', ordinary, 'add', '--sources', sources])).output
  ).toContain('select exactly one repository with --sources')
  expect((await box.run(['ki', 'registry', '--repo', ordinary, 'add', '--sources', sources])).output).toContain(
    '--sources requires one selected KB that declares sources'
  )
})

test('rejects every malformed Knowledge Base store-role declaration through the registry boundary', async () => {
  const box = await sandbox()
  const base =
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/knowledge"\n'
  const cases = [
    ['store_roles = ["notes"]', 'store_roles requires repo_type = "kb"'],
    ['repo_type = "project"\nstore_roles = ["notes"]', 'repo_type must be "kb" when declared'],
    ['repo_type = "kb"', 'store_roles must be a non-empty array of named KB stores'],
    ['repo_type = "kb"\nstore_roles = ["notes", "other"]', 'store_roles may contain only notes, sources, or legacy'],
    ['repo_type = "kb"\nstore_roles = ["notes", "notes"]', 'store_roles must not repeat a store role'],
    ['repo_type = "kb"\nstore_roles = ["sources"]', 'store_roles must include notes']
  ] as const

  for (const [declaration, detail] of cases) {
    await box.project.write('.ki-config.toml', `${base}${declaration}\n`)
    const result = await box.run('ki registry add')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(detail)
  }
})

test('does not automatically register a Knowledge Base whose declared sources lack a complete binding', async () => {
  const box = await sandbox()
  const root = await realpath(box.project.path)
  const other = await box.root.mkdir('other')
  const sources = await box.root.mkdir('sources')
  await box.config.write('ki/config.toml', localConfiguration)
  await box.project.write(
    '.ki-config.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/knowledge"\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]\n'
  )

  expect(await box.run('ki repo conform')).toEqual({
    exitCode: 1,
    output: `ki: error: Knowledge Base ${root} declares sources; run ki registry add --repo ${root} --sources <absolute-path>\n`
  })
  await expect(box.state.read('ki/registry.toml')).rejects.toThrow()

  await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')
  expect(await box.run('ki repo conform')).toEqual({
    exitCode: 1,
    output: 'ki: error: local KI repository registry is invalid: unrecognised key extra\n'
  })

  await box.setupExampleHarness({ name: 'ki-repo', rubric })
  const registered = `schema = 1

[repositories.other]
repository = "https://github.com/example/other"
path = ${JSON.stringify(other)}

[repositories.project]
repository = "https://github.com/example/knowledge"
path = ${JSON.stringify(root)}

[repositories.project.stores]
sources = ${JSON.stringify(sources)}
`
  await box.state.write('ki/registry.toml', registered)

  expect((await box.run('ki repo conform')).exitCode).toBe(0)
  expect(await box.state.read('ki/registry.toml')).toEqual(registered)
})
