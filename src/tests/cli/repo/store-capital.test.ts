import { lstat } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const SOURCES = 'Library/CloudStorage/OneDrive-Personal'

interface CapitalFixture {
  readonly directory: string
  /** Registry key; an absent key leaves the Capital unregistered. */
  readonly key?: string
  readonly kind?: 'kb' | 'project'
  /** Raw TOML lines inserted into the Capital's `ki-repo` table. */
  readonly territory?: readonly string[]
}

const identity = (directory: string): string => `https://github.com/example/${directory}`

/** A territory Capital declaration; a Knowledge Base declares a sources role so it can create a store. */
const capital = ({ directory, kind = 'kb', territory = [] }: CapitalFixture): string =>
  [
    '[repo]',
    'harnesses = ["example/harness"]',
    '',
    `[skills.${kind === 'kb' ? 'ki-repo-kb' : 'ki-repo-project'}]`,
    '',
    '[skills.ki-repo]',
    `repo_type = "${kind}"`,
    `primary_shape = "${kind === 'kb' ? 'ki-repo-kb' : 'ki-repo-project'}"`,
    `repository = ${JSON.stringify(identity(directory))}`,
    `capital = ${JSON.stringify(identity(directory))}`,
    ...(kind === 'kb' ? ['store_roles = ["notes", "sources"]'] : []),
    'territory_name = "Example territory"',
    `territory_members = ${JSON.stringify([identity(directory)])}`,
    ...territory,
    ''
  ].join('\n')

/** Writes each Capital checkout and registers those with a key; returns their physical roots. */
const estate = async (box: Sandbox, capitals: readonly CapitalFixture[]): Promise<readonly string[]> => {
  const roots: string[] = []
  const entries = ['schema = 1', '[repositories]']
  for (const fixture of capitals) {
    const root = await box.project.mkdir(fixture.directory)
    await box.project.write(`${fixture.directory}/.ki.toml`, capital(fixture))
    roots.push(root)
    if (fixture.key)
      entries.push(
        `[repositories.${JSON.stringify(fixture.key)}]`,
        `repository = ${JSON.stringify(identity(fixture.directory))}`,
        `path = ${JSON.stringify(root)}`
      )
  }
  await box.state.write('ki/registry.toml', entries.join('\n'))
  return roots
}

describe('Capital sources-store naming', () => {
  test('creates a Capital store under its canonical territory handle, whichever selector chose it', async () => {
    const box = await sandbox()
    const oneDrive = await box.home.mkdir(SOURCES)
    const [prefixed, keyed] = await estate(box, [
      {
        directory: 'ki-principal',
        key: 'ki-principal',
        territory: ['territory_prefix = "knowledge-islands"', 'territory_aliases = ["ki"]']
      },
      { directory: 'sample-principal', key: 'sample-team' }
    ])
    const canonical = `${oneDrive}/sources-knowledge-islands`

    const byPath = await box.run(['ki', 'repo', '--repo', prefixed as string, 'store', 'create', 'sources'])
    expect(byPath.exitCode).toBe(0)
    expect(byPath.output).toContain(`would create ${canonical}`)
    for (const selector of ['knowledge-islands', 'ki'])
      expect((await box.run(['ki', 'repo', '-t', selector, 'store', 'create', 'sources'])).output).toBe(byPath.output)

    expect((await box.run(['ki', 'repo', '-t', 'ki', 'store', 'create', 'sources', '--write'])).exitCode).toBe(0)
    expect((await lstat(canonical)).isDirectory()).toBe(true)
    expect(await lstat(`${oneDrive}/sources-ki`).catch(() => undefined)).toBeUndefined()
    expect(await lstat(`${oneDrive}/sources-ki-principal`).catch(() => undefined)).toBeUndefined()

    const fallback = await box.run(['ki', 'repo', '--repo', keyed as string, 'store', 'create', 'sources'])
    expect(fallback.exitCode).toBe(0)
    expect(fallback.output).toContain(`would create ${oneDrive}/sources-sample-team`)
  })

  test('refuses to name a store for a prefixless Capital that is not registered', async () => {
    const box = await sandbox()
    await box.home.mkdir(SOURCES)
    const [root] = await estate(box, [{ directory: 'loose-principal' }])

    const result = await box.run(['ki', 'repo', '--repo', root as string, 'store', 'create', 'sources', '--write'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('territory Capital has no territory handle to name its sources store')
    expect(await lstat(`${box.home.path}/${SOURCES}/sources-loose-principal`).catch(() => undefined)).toBeUndefined()
  })

  test('scans canonical and historical Capital store names, reporting an equal name once', async () => {
    const box = await sandbox()
    await estate(box, [
      { directory: 'both-principal', key: 'both-principal', kind: 'project', territory: ['territory_prefix = "both"'] },
      { directory: 'old-principal', key: 'old-principal', kind: 'project', territory: ['territory_prefix = "old"'] },
      { directory: 'new-principal', key: 'new', kind: 'project' },
      { directory: 'same', key: 'same', kind: 'project', territory: ['territory_prefix = "same"'] }
    ])
    for (const name of ['both', 'both-principal', 'old-principal', 'new', 'same'])
      await box.home.mkdir(`${SOURCES}/sources-${name}`)

    const result = await box.run('ki repo --estate store scan')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('undeclared (5)')
    for (const name of ['both', 'both-principal', 'old-principal', 'new', 'same'])
      expect(result.output.split(`sources-${name}\n`).length - 1).toBe(1)
    expect(result.output).not.toContain('sources-old\n')
    expect(result.output).not.toContain('sources-new-principal')
  })

  test('diagnoses malformed Capital naming metadata without hiding other repositories', async () => {
    const box = await sandbox()
    const [broken, other] = await estate(box, [
      { directory: 'broken-principal', kind: 'project', territory: ['territory_prefix = 1'] },
      { directory: 'other-principal', key: 'other', kind: 'project' }
    ])
    await box.home.mkdir(`${SOURCES}/sources-other`)

    // Estate selection itself rejects the malformed Capital, so name both checkouts explicitly.
    const result = await box.run(['ki', 'repo', '--repo', broken as string, '--repo', other as string, 'store', 'scan'])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('undeclared (1)')
    expect(result.output).toContain('diagnostics (1)')
    expect(result.output).toContain(`${broken}/.ki.toml`)
    expect(result.output).toContain('territory_prefix')
  })
})
