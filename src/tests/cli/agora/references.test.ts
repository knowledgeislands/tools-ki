import { mkdir, realpath, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const homeIdentity = 'https://github.com/example/home'
const referenceIdentity = 'https://github.com/example/plain-reference'

const repository = (identity: string, agora = ''): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = ${JSON.stringify(identity)}\n${agora}`

const home = (
  options: { readonly references?: readonly string[]; readonly members?: Record<string, string> } = {}
): string =>
  `[skills.ki-agora.homes.team]\nowner = ${JSON.stringify(homeIdentity)}\npurpose = "Shared delivery"\norder = [${[
    homeIdentity,
    ...(options.references ?? []),
    ...Object.keys(options.members ?? {})
  ]
    .map((identity) => JSON.stringify(identity))
    .join(', ')}]\nreferences = ${JSON.stringify(options.references ?? [])}\nmembers = { ${Object.entries(
    options.members ?? {}
  )
    .map(([identity, role]) => `${JSON.stringify(identity)} = ${JSON.stringify(role)}`)
    .join(', ')} }\n`

const membership = (role: string): string =>
  `[skills.ki-agora.memberships.team]\nhome = ${JSON.stringify(homeIdentity)}\nrole = ${JSON.stringify(role)}\n`

const setReference = (root: string, dryRun = false): readonly string[] => [
  'ki',
  'agora',
  'reference',
  'set',
  referenceIdentity,
  root,
  ...(dryRun ? ['--dry-run'] : [])
]

const registry = (
  entries: readonly { readonly key: string; readonly repository: string; readonly path: string }[]
): string =>
  [
    'schema = 1',
    ...entries.flatMap((entry) => [
      '',
      `[repositories.${JSON.stringify(entry.key)}]`,
      `repository = ${JSON.stringify(entry.repository)}`,
      `path = ${JSON.stringify(entry.path)}`
    ]),
    ''
  ].join('\n')

const setup = async (box: Sandbox): Promise<{ readonly homeRoot: string; readonly referenceRoot: string }> => {
  await box.project.write('home/.ki.toml', repository(homeIdentity, home({ references: [referenceIdentity] })))
  const homeRoot = await box.project.mkdir('home')
  const referenceRoot = await box.project.mkdir('plain reference')
  await box.state.write('ki/registry.toml', registry([{ key: 'home', repository: homeIdentity, path: homeRoot }]))
  return { homeRoot, referenceRoot }
}

const gitRunner =
  (
    root: string,
    identity = referenceIdentity,
    calls: string[] = []
  ): ((
    command: string,
    arguments_: readonly string[]
  ) => Promise<{ readonly exitCode: number; readonly output: string }>) =>
  async (command, arguments_) => {
    calls.push(`${command} ${arguments_.join(' ')}`)
    if (command === 'git' && arguments_[2] === 'rev-parse') return { exitCode: 0, output: `${root}\n` }
    if (command === 'git' && arguments_[2] === 'remote') return { exitCode: 0, output: `${identity}.git\n` }
    return { exitCode: 0, output: '' }
  }

describe('[ki agora reference]', () => {
  test('associates a plain Git checkout and projects typed owner and reference roots', async () => {
    const box = await sandbox()
    const { homeRoot, referenceRoot } = await setup(box)
    const calls: string[] = []
    box.setRunner(gitRunner(referenceRoot, referenceIdentity, calls))

    const unresolved = await box.run('ki agora show team')
    expect(unresolved.exitCode).toBe(0)
    expect(unresolved.output).toContain(`${referenceIdentity} [unassociated]`)
    expect(await box.run('ki agora roots team')).toEqual({ exitCode: 0, output: `${homeRoot}\n` })
    expect((await box.run('ki agora audit team')).output).toContain(`[unassociated]: no local checkout is associated`)

    expect(await box.run(setReference(referenceRoot, true))).toEqual({
      exitCode: 0,
      output: `ki agora reference set ${referenceIdentity}: would associate ${referenceRoot}\n`
    })
    await expect(box.state.read('ki/agora-references.toml')).rejects.toThrow()
    expect(await box.run(setReference(referenceRoot))).toEqual({
      exitCode: 0,
      output: `ki agora reference set ${referenceIdentity}: associated ${referenceRoot}\n`
    })
    expect((await box.run(setReference(referenceRoot))).output).toContain('unchanged')

    const listed = await box.run('ki agora reference list')
    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain(referenceIdentity)
    expect(listed.output).toContain(`path: ${referenceRoot}`)
    const shown = await box.run('ki agora show team --verbose')
    expect(shown.exitCode).toBe(0)
    expect(shown.output).toContain('home [owner]')
    expect(shown.output).toContain(`${referenceIdentity} [reference]`)
    expect(shown.output).toContain('summary: MEMBERS=1 REFERENCES=1 UNRESOLVED_REFERENCES=0 ROOTS=2')
    expect((await box.run('ki agora show team')).output).toContain('references (1)')
    expect(await box.run('ki agora roots team')).toEqual({
      exitCode: 0,
      output: `${homeRoot}\n${referenceRoot}\n`
    })
    await box.project.write(
      'team.code-workspace',
      JSON.stringify({ folders: [{ path: homeRoot }, { path: referenceRoot }] })
    )
    const inspected = await box.run([
      'ki',
      'agora',
      'inspect',
      'team',
      '--target',
      'vscode',
      '--workspace',
      `${box.project.path}/team.code-workspace`
    ])
    expect(inspected.exitCode).toBe(0)
    expect(inspected.output).toContain(`example/plain-reference [reference]: ${referenceRoot}`)
    expect((await box.run('ki agora list')).output).toContain('team [declared] team (1 members, 1 references)')
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 0,
      output: 'ki agora open team --target zed: opened 2 repositories\n'
    })
    expect(calls).toContain(`zed -e ${referenceRoot}`)
  })

  test('reports missing, ambiguous, and remote-mismatched associations without invalidating members', async () => {
    const box = await sandbox()
    const { homeRoot, referenceRoot } = await setup(box)
    const missing = `${box.project.path}/missing`
    await box.state.write(
      'ki/agora-references.toml',
      `schema = 1\nreferences = [{ repository = ${JSON.stringify(referenceIdentity)}, path = ${JSON.stringify(missing)} }]\n`
    )
    let audit = await box.run('ki agora audit team')
    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain(`${referenceIdentity} [missing]`)
    expect(await box.run('ki agora roots team')).toEqual({ exitCode: 0, output: `${homeRoot}\n` })

    await box.state.write(
      'ki/agora-references.toml',
      `schema = 1\nreferences = [\n  { repository = ${JSON.stringify(referenceIdentity)}, path = ${JSON.stringify(referenceRoot)} },\n  { repository = ${JSON.stringify(referenceIdentity)}, path = ${JSON.stringify(missing)} },\n]\n`
    )
    audit = await box.run('ki agora audit team')
    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain(`${referenceIdentity} [ambiguous]`)

    await box.state.write(
      'ki/agora-references.toml',
      `schema = 1\nreferences = [{ repository = ${JSON.stringify(referenceIdentity)}, path = ${JSON.stringify(referenceRoot)} }]\n`
    )
    box.setRunner(gitRunner(referenceRoot, 'https://github.com/example/other'))
    audit = await box.run('ki agora audit team')
    expect(audit.exitCode).toBe(1)
    expect(audit.output).toContain(`${referenceIdentity} [remote-mismatch]`)
    expect(audit.output).toContain('has origin https://github.com/example/other')

    box.setRunner(async () => ({ exitCode: 1, output: '' }))
    expect((await box.run('ki agora show team')).output).toContain('is not a Git checkout root')
  })

  test('keeps association mutation local and ignores stale state after promotion to membership', async () => {
    const box = await sandbox()
    const { homeRoot, referenceRoot } = await setup(box)
    box.setRunner(gitRunner(referenceRoot))
    await box.run(setReference(referenceRoot))

    const promotedHome = home({ members: { [referenceIdentity]: 'reader' } }).replace(
      `order = [${JSON.stringify(homeIdentity)}, ${JSON.stringify(referenceIdentity)}]`,
      `order = [${JSON.stringify(referenceIdentity)}]`
    )
    await box.project.write('home/.ki.toml', repository(homeIdentity, promotedHome))
    await box.project.write('plain reference/.ki.toml', repository(referenceIdentity, membership('reader')))
    await box.state.write(
      'ki/registry.toml',
      registry([
        { key: 'home', repository: homeIdentity, path: homeRoot },
        { key: 'plain-reference', repository: referenceIdentity, path: referenceRoot }
      ])
    )
    const before = await box.project.read('plain reference/.ki.toml')
    const shown = await box.run('ki agora show team')
    expect(shown.exitCode).toBe(0)
    expect(shown.output).toContain('members (2)')
    expect(shown.output).not.toContain('references (')
    expect(await box.run('ki agora roots team')).toEqual({
      exitCode: 0,
      output: `${referenceRoot}\n${homeRoot}\n`
    })

    expect(await box.run(`ki agora reference remove ${referenceIdentity} --dry-run`)).toEqual({
      exitCode: 0,
      output: `ki agora reference remove ${referenceIdentity}: would remove association\n`
    })
    expect(await box.run(`ki agora reference remove ${referenceIdentity}`)).toEqual({
      exitCode: 0,
      output: `ki agora reference remove ${referenceIdentity}: removed association\n`
    })
    expect(await box.project.read('plain reference/.ki.toml')).toBe(before)
    const empty = await box.run('ki agora reference list')
    expect(empty.exitCode).toBe(0)
    expect(empty.output).toContain('associations (0)')
    expect(empty.output).toContain('summary: ASSOCIATIONS=0')
  })

  test('validates portable reference declarations and isolates member-only repository selection', async () => {
    const box = await sandbox()
    const homeRoot = await box.project.mkdir('home')
    await box.state.write('ki/registry.toml', registry([{ key: 'home', repository: homeIdentity, path: homeRoot }]))
    const declaration = async (body: string): Promise<string> => {
      await box.project.write(
        'home/.ki.toml',
        repository(
          homeIdentity,
          `[skills.ki-agora.homes.team]\nowner = ${JSON.stringify(homeIdentity)}\npurpose = "Team"\n${body}`
        )
      )
      return (await box.run('ki agora list')).output
    }

    expect(await declaration('references = "bad"\nmembers = {}\n')).toContain('references must be an array')
    expect(await declaration('references = ["invalid"]\nmembers = {}\n')).toContain(
      'reference entries must be canonical HTTPS GitHub repositories'
    )
    expect(await declaration(`references = [${JSON.stringify(homeIdentity)}]\nmembers = {}\n`)).toContain(
      'must not also be the owner or a member'
    )
    expect(
      await declaration(
        `references = [${JSON.stringify(referenceIdentity)}]\nmembers = { ${JSON.stringify(referenceIdentity)} = "reader" }\n`
      )
    ).toContain('must not also be the owner or a member')
    expect(
      await declaration(
        `references = [${JSON.stringify(referenceIdentity)}, ${JSON.stringify(referenceIdentity)}]\nmembers = {}\n`
      )
    ).toContain('references repeats repository')

    await declaration(
      `references = [${JSON.stringify(referenceIdentity)}, "https://github.com/example/second-reference"]\nmembers = {}\n`
    )
    box.setRunner(async () => ({ exitCode: 1, output: '' }))
    await box.run(setReference(await box.project.mkdir('comparison-reference')))

    await box.project.write('home/.ki.toml', repository(homeIdentity, home({ references: [referenceIdentity] })))
    expect((await box.run('ki repo --agora team roadmap list')).exitCode).toBe(0)
    expect((await box.run('ki repo --agora UPPER roadmap list')).exitCode).toBe(2)
    expect((await box.run('ki repo --agora unknown roadmap list')).exitCode).toBe(2)

    const malformedRoot = await box.project.mkdir('malformed')
    await box.project.write(
      'malformed/.ki.toml',
      repository('https://github.com/example/malformed', '[skills.ki-agora]\nhomes = []\n')
    )
    await box.state.write(
      'ki/registry.toml',
      registry([
        { key: 'home', repository: homeIdentity, path: homeRoot },
        { key: 'malformed', repository: 'https://github.com/example/malformed', path: malformedRoot }
      ])
    )
    expect((await box.run('ki repo --agora team roadmap list')).exitCode).toBe(0)

    const secondRoot = await box.project.mkdir('second')
    const secondIdentity = 'https://github.com/example/second'
    await box.project.write(
      'second/.ki.toml',
      repository(secondIdentity, home({}).replaceAll(homeIdentity, secondIdentity))
    )
    await box.state.write(
      'ki/registry.toml',
      registry([
        { key: 'home', repository: homeIdentity, path: homeRoot },
        { key: 'second', repository: secondIdentity, path: secondRoot }
      ])
    )
    expect((await box.run('ki repo --agora team roadmap list')).output).toContain('declared by multiple owners')

    const unavailableIdentity = 'https://github.com/example/unavailable'
    await box.project.write(
      'home/.ki.toml',
      repository(homeIdentity, home({ members: { [unavailableIdentity]: 'reader' } }))
    )
    await box.state.write(
      'ki/registry.toml',
      registry([
        { key: 'home', repository: homeIdentity, path: homeRoot },
        { key: 'unavailable', repository: unavailableIdentity, path: `${box.project.path}/missing` }
      ])
    )
    expect((await box.run('ki repo --agora team roadmap list')).output).toContain(
      'must be an existing physical directory'
    )
  })

  test('rejects unsafe selections and malformed association stores', async () => {
    const box = await sandbox()
    const { referenceRoot } = await setup(box)
    expect((await box.run('ki agora reference set invalid relative')).exitCode).toBe(2)
    expect(
      (await box.run(['ki', 'agora', 'reference', 'set', 'https://github.com/example/unknown', referenceRoot])).output
    ).toContain('is not declared as a reference')
    expect((await box.run(`ki agora reference set ${referenceIdentity} relative`)).output).toContain(
      'checkout must be an absolute path'
    )
    expect((await box.run(`ki agora reference set ${referenceIdentity} ${box.project.path}/missing`)).output).toContain(
      'is not an existing physical directory'
    )
    box.setRunner(gitRunner(await realpath(box.project.path)))
    expect((await box.run(setReference(referenceRoot))).output).toContain('is not a Git checkout root')
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'rev-parse' ? { exitCode: 0, output: `${referenceRoot}\n` } : { exitCode: 1, output: '' }
    )
    expect((await box.run(setReference(referenceRoot))).output).toContain('without a canonical GitHub identity')
    box.setRunner(async () => ({ exitCode: 0, output: `${box.project.path}/missing-worktree\n` }))
    expect((await box.run(setReference(referenceRoot))).output).toContain('is not a Git checkout root')
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'rev-parse'
        ? { exitCode: 0, output: `${referenceRoot}\n` }
        : { exitCode: 0, output: 'https://example.com/not-github\n' }
    )
    expect((await box.run(setReference(referenceRoot))).output).toContain('without a canonical GitHub identity')
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'rev-parse'
        ? { exitCode: 0, output: `${referenceRoot}\n` }
        : { exitCode: 0, output: 'git@github.com:example/plain-reference.git\n' }
    )
    expect((await box.run(setReference(referenceRoot))).exitCode).toBe(0)
    expect((await box.run(`ki agora reference remove ${referenceIdentity}`)).exitCode).toBe(0)
    expect((await box.run(`ki agora reference remove ${referenceIdentity}`)).output).toContain(
      'no local Agora reference'
    )

    await box.state.write('ki/agora-references.toml', 'schema = 2\nreferences = "bad"\n')
    const invalid = await box.run('ki agora reference list')
    expect(invalid.exitCode).toBe(1)
    expect(invalid.output).toContain('schema must equal 1; references must be an array')

    await box.state.write('ki/agora-references.toml', '[')
    expect((await box.run('ki agora reference list')).output).toContain('association store must be valid TOML')

    await box.state.write(
      'ki/agora-references.toml',
      'schema = 1\nunknown = true\nreferences = [1, { repository = "invalid", path = "relative", unknown = true }]\n'
    )
    const malformed = await box.run('ki agora reference list')
    expect(malformed.exitCode).toBe(1)
    expect(malformed.output).toContain('unrecognised key unknown')
    expect(malformed.output).toContain('references[0] must be a table')
    expect(malformed.output).toContain('references[1].repository must be a canonical HTTPS GitHub repository')
    expect(malformed.output).toContain('references[1].path must be an absolute path')

    box.setRunner(gitRunner(referenceRoot))
    expect((await box.run(setReference(referenceRoot))).output).toContain(
      'local Agora reference associations are invalid'
    )
    expect((await box.run(`ki agora reference remove ${referenceIdentity}`)).output).toContain(
      'local Agora reference associations are invalid'
    )

    const associationPath = join(box.state.path, 'ki/agora-references.toml')
    await rm(associationPath)
    await mkdir(associationPath)
    expect((await box.run('ki agora reference list')).output).toContain('association store must be a regular file')
    await rm(associationPath, { recursive: true })
    await symlink(join(box.state.path, 'ki/registry.toml'), associationPath)
    expect((await box.run('ki agora reference list')).output).toContain('association store must be a regular file')
    await rm(associationPath)

    expect((await box.run(`ki agora reference remove invalid`)).output).toContain(
      'repository must be a canonical HTTPS GitHub repository'
    )

    const spareIdentity = 'https://github.com/example/spare'
    await box.state.write(
      'ki/agora-references.toml',
      `schema = 1\nreferences = [{ repository = ${JSON.stringify(spareIdentity)}, path = ${JSON.stringify(referenceRoot)} }]\n`
    )
    box.setRunner(gitRunner(referenceRoot))
    expect((await box.run(setReference(referenceRoot))).exitCode).toBe(0)
    await box.state.write(
      'ki/agora-references.toml',
      `schema = 1\nreferences = [\n  { repository = ${JSON.stringify(referenceIdentity)}, path = ${JSON.stringify(referenceRoot)} },\n  { repository = ${JSON.stringify(referenceIdentity)}, path = ${JSON.stringify(`${referenceRoot}-two`)} },\n  { repository = ${JSON.stringify(spareIdentity)}, path = ${JSON.stringify(referenceRoot)} },\n]\n`
    )
    expect((await box.run(`ki agora reference remove ${spareIdentity}`)).exitCode).toBe(0)
    expect((await box.run(setReference(referenceRoot))).output).toContain(
      `association for ${referenceIdentity} is ambiguous`
    )
  })
})
