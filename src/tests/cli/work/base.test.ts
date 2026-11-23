import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const BACKPACK = 'example/ki-agent-backpack'

const declaration = (repository: string): string =>
  [
    '[repo]',
    'backpacks = ["example/backpack"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    `repository = ${JSON.stringify(repository)}`,
    ''
  ].join('\n')

interface Backpack {
  /** The commit every input is written against, abbreviated as an input writes it. */
  readonly base: string
  /** A commit on the checkout's main that origin/main does not hold. */
  readonly unpushed: string
}

/**
 * A backpack checkout whose origin/main has moved on from the base: one standard modified, one renamed, one deleted,
 * one added, one file renamed into a folder, and one standard left alone; then an unpushed commit.
 */
const backpack = async (box: Sandbox): Promise<Backpack> => {
  const git = (arguments_: readonly string[]) => box.root.git(arguments_, 'backpack')
  await git(['init', '-q', '-b', 'main'])
  for (const path of ['skills/a/standard.md', 'skills/b/old.md', 'skills/c/gone.md', 'skills/d/steady.md'])
    await box.root.write(`backpack/${path}`, `# ${path}\n`)
  await box.root.write('backpack/docs/elsewhere.md', '# elsewhere\n')
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'base'])
  const base = (await git(['rev-parse', 'HEAD'])).slice(0, 9)
  await box.root.write('backpack/skills/a/standard.md', '# a, revised\n')
  await git(['mv', 'skills/b/old.md', 'skills/b/new.md'])
  await git(['rm', '-q', 'skills/c/gone.md'])
  await box.root.mkdir('backpack/skills/e')
  await git(['mv', 'docs/elsewhere.md', 'skills/e/arrived.md'])
  await box.root.write('backpack/skills/f/added.md', '# added\n')
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'main moves on'])
  await git(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  await box.root.write('backpack/skills/a/standard.md', '# a, unpushed\n')
  await git(['commit', '-q', '-am', 'unpushed'])
  return { base, unpushed: (await git(['rev-parse', 'HEAD'])).slice(0, 9) }
}

/** The registry: the backpack, a checkout with no origin/main, and the store under its own identity. */
const register = async (box: Sandbox): Promise<string> => {
  const root = await realpath(box.root.path)
  await box.root.git(['init', '-q', '-b', 'main'], 'unfetched')
  const entries = [
    ['ki-agent-backpack', BACKPACK, 'backpack'],
    ['unfetched', 'example/unfetched', 'unfetched']
  ]
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      ...entries.flatMap(([key, repository, path]) => [
        '',
        `[repositories."${key}"]`,
        `repository = "https://github.com/${repository}"`,
        `path = ${JSON.stringify(`${root}/${path}`)}`
      ]),
      ''
    ].join('\n')
  )
  await box.root.write('app/.ki.toml', declaration('https://github.com/example/app'))
  return root
}

/** A store that is a Git checkout: its roster committed as the base, then one roster file changed on origin/main. */
const store = async (box: Sandbox): Promise<string> => {
  const git = (arguments_: readonly string[]) => box.root.git(arguments_, 'store')
  await git(['init', '-q', '-b', 'main'])
  await box.root.write('store/roster/actors/ward/_index.md', '# Ward\n')
  await box.root.write('store/roster/actors/quire/_index.md', '# Quire\n')
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'base'])
  const base = (await git(['rev-parse', 'HEAD'])).slice(0, 9)
  await box.root.write('store/roster/actors/quire/_index.md', '# Quire, renamed\n')
  await git(['commit', '-q', '-am', 'quire moves on'])
  await git(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  box.setEnv({ MCP_CAIRN_STORE: `${box.root.path}/store` })
  return base
}

const entry = (id: string, repositories: string, parent?: string): string =>
  [
    '---',
    `ki-id: ${id}`,
    'ki-level: regular',
    ...(parent ? [`ki-parent: ${parent}`] : []),
    'ki-worker: agent',
    'ki-supervisor: owner',
    `ki-repositories: ${repositories}`,
    'ki-state: with-supervisor',
    'ki-since: 2026-11-20T00:00:00Z',
    '---',
    '',
    `# ${id}`,
    ''
  ].join('\n')

const change = (status: string, inputs: readonly string[], revised = '2026-11-20T10:00:00Z'): string =>
  [
    '---',
    'ki-document-type: change@abc1234',
    `ki-revised: ${revised}`,
    `ki-status: ${status}`,
    ...(inputs.length ? ['ki-inputs:', ...inputs.map((input) => `  - ${input}`)] : []),
    '---',
    '',
    '# A change',
    ''
  ].join('\n')

const SUMMIT = 'store/work/ex/ex.summit'

const packages = async (box: Sandbox): Promise<void> => {
  await box.root.write(`${SUMMIT}/_index.md`, entry('ex.summit', '[ex/app]'))
  await box.root.write(`${SUMMIT}/sub/_index.md`, entry('ex.summit+sub', '[]', 'ex.summit'))
  await box.root.write('store/work/ex/ex.other/_index.md', entry('ex.other', '[ex/elsewhere]', 'ex.summit'))
  await box.root.write('store/work/ex/ex.other/11-other.change.md', change('done', []))
  await box.root.write('store/work/ex/ex.other/12-newer.change.md', change('replaced', [], '2026-11-21T08:00:00Z'))
  await box.root.write('store/work/ex/ex.other/plain.md', '# No revision\n')
}

const report = async (box: Sandbox, command = 'ki work base --format json') => {
  const result = await box.run(command, { runner: 'default' })
  return { result, json: JSON.parse(result.stdout) }
}

interface Input {
  input: string
  verdict: string
  files: unknown[]
  reason: string | null
}

const inputsOf = (json: { documents: { path: string; inputs: Input[] }[] }, name: string) =>
  Object.fromEntries(
    (json.documents.find((document) => document.path.endsWith(name)) as { inputs: Input[] }).inputs.map((input) => [
      input.input,
      { verdict: input.verdict, files: input.files, reason: input.reason }
    ])
  )

describe('ki work base', () => {
  test('checks each ki-inputs entry of the store’s change documents against its version ref, skipping the closed', async () => {
    const box = await sandbox()
    const { base, unpushed } = await backpack(box)
    await register(box)
    const storeBase = await store(box)
    await packages(box)
    await box.root.write(
      `${SUMMIT}/10-moved.change.md`,
      change('draft', [
        `${BACKPACK}:skills/a/standard.md@${base}`,
        `${BACKPACK}:skills/d/steady.md@${base}`,
        `${BACKPACK}:skills/b/old.md@${base}`,
        `${BACKPACK}:./skills/e/@${base}`,
        `${BACKPACK}:skills/f/**@${base}`,
        `${BACKPACK}:skills/?/gone.md@${base}`,
        `${BACKPACK}:skills/*/steady.md@${base}`,
        `'${BACKPACK}:skills/(x)/*.md@${base} (an annotation)'`
      ])
    )
    await box.root.write(
      `${SUMMIT}/20-current.change.md`,
      change('agreed', [
        `${BACKPACK}:skills/d/steady.md@${base}`,
        'https://example.com/a/page',
        '../ex.other/11-other.change.md@2026-11-20',
        `roster/actors/ward/_index.md@${storeBase}`,
        'sub/10-strand.change.md@2026-11-20',
        'Companies House register, company 1@2026-11-18',
        'Board minutes@https://example.com/minutes'
      ])
    )
    await box.root.write(
      `${SUMMIT}/30-unknown.change.md`,
      change('review', [
        '7',
        BACKPACK,
        'example/unregistered@abc1234',
        `${BACKPACK}@2026-11-01`,
        'example/unfetched@abc1234',
        `${BACKPACK}@deadbeef`,
        `${BACKPACK}@${unpushed}`,
        'missing.change.md@2026-11-01',
        '../../../../outside.md@2026-11-01',
        'work/ex/ex.other/11-other.change.md@v1',
        '../ex.other/plain.md@2026-11-01',
        'Board minutes@v2'
      ])
    )
    await box.root.write(
      `${SUMMIT}/40-whole.change.md`,
      change('rolling out', [
        `${BACKPACK}@${base}`,
        'work/ex/ex.other/12-newer.change.md@2026-11-19T00:00:00Z',
        `roster/actors/quire/_index.md@${storeBase}`
      ])
    )
    await box.root.write(`${SUMMIT}/50-none.change.md`, '# No front matter\n')
    await box.root.write(`${SUMMIT}/60-url.change.md`, change('draft', ['https://example.com/only']))
    await box.root.write(`${SUMMIT}/70-done.change.md`, change('done', [`${BACKPACK}@${base}`]))
    await box.root.write(`${SUMMIT}/sub/10-strand.change.md`, change('draft', [`${BACKPACK}:skills/d@${base}`]))

    const { result, json } = await report(box)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('')
    expect(json.schema).toBe('ki/work-base/v2')
    expect(json.store).toBe(`${box.root.path}/store`)
    expect(
      json.documents.map((document: { package: string; path: string; verdict: string; reason: string | null }) => [
        document.package,
        document.path,
        document.verdict,
        document.reason
      ])
    ).toEqual([
      ['ex.summit', 'work/ex/ex.summit/10-moved.change.md', 'moved', null],
      ['ex.summit', 'work/ex/ex.summit/20-current.change.md', 'current', null],
      ['ex.summit', 'work/ex/ex.summit/30-unknown.change.md', 'unknown', null],
      ['ex.summit', 'work/ex/ex.summit/40-whole.change.md', 'moved', null],
      ['ex.summit', 'work/ex/ex.summit/50-none.change.md', 'unknown', 'no ki-inputs'],
      ['ex.summit', 'work/ex/ex.summit/60-url.change.md', 'unknown', 'no input can be checked in Git or the store'],
      ['ex.summit+sub', 'work/ex/ex.summit/sub/10-strand.change.md', 'current', null]
    ])
    expect(json.closed).toEqual([
      { package: 'ex.other', path: 'work/ex/ex.other/11-other.change.md', status: 'done' },
      { package: 'ex.other', path: 'work/ex/ex.other/12-newer.change.md', status: 'replaced' },
      { package: 'ex.summit', path: 'work/ex/ex.summit/70-done.change.md', status: 'done' }
    ])
    expect(inputsOf(json, '10-moved.change.md')).toEqual({
      [`${BACKPACK}:skills/a/standard.md@${base}`]: {
        verdict: 'moved',
        files: [{ path: 'skills/a/standard.md', change: 'modified' }],
        reason: null
      },
      [`${BACKPACK}:skills/d/steady.md@${base}`]: { verdict: 'current', files: [], reason: null },
      [`${BACKPACK}:skills/b/old.md@${base}`]: {
        verdict: 'moved',
        files: [{ path: 'skills/b/old.md', change: 'renamed', to: 'skills/b/new.md' }],
        reason: null
      },
      [`${BACKPACK}:./skills/e/@${base}`]: {
        verdict: 'moved',
        files: [{ path: 'docs/elsewhere.md', change: 'renamed', to: 'skills/e/arrived.md' }],
        reason: null
      },
      [`${BACKPACK}:skills/f/**@${base}`]: {
        verdict: 'moved',
        files: [{ path: 'skills/f/added.md', change: 'added' }],
        reason: null
      },
      [`${BACKPACK}:skills/?/gone.md@${base}`]: {
        verdict: 'moved',
        files: [{ path: 'skills/c/gone.md', change: 'deleted' }],
        reason: null
      },
      [`${BACKPACK}:skills/*/steady.md@${base}`]: { verdict: 'current', files: [], reason: null },
      [`${BACKPACK}:skills/(x)/*.md@${base} (an annotation)`]: { verdict: 'current', files: [], reason: null }
    })
    expect(inputsOf(json, '20-current.change.md')).toEqual({
      [`${BACKPACK}:skills/d/steady.md@${base}`]: { verdict: 'current', files: [], reason: null },
      'https://example.com/a/page': { verdict: 'unchecked', files: [], reason: 'a URL, outside Git and the store' },
      '../ex.other/11-other.change.md@2026-11-20': { verdict: 'current', files: [], reason: null },
      [`roster/actors/ward/_index.md@${storeBase}`]: { verdict: 'current', files: [], reason: null },
      'sub/10-strand.change.md@2026-11-20': { verdict: 'current', files: [], reason: null },
      'Companies House register, company 1@2026-11-18': {
        verdict: 'unchecked',
        files: [],
        reason: 'dated, outside Git and the store'
      },
      'Board minutes@https://example.com/minutes': {
        verdict: 'unchecked',
        files: [],
        reason: 'versioned by its URL, outside Git and the store'
      }
    })
    const checkout = await realpath(box.root.path)
    expect(inputsOf(json, '30-unknown.change.md')).toEqual({
      '7': { verdict: 'unknown', files: [], reason: 'an input must be a non-empty string' },
      [BACKPACK]: { verdict: 'unknown', files: [], reason: 'no version ref' },
      'example/unregistered@abc1234': {
        verdict: 'unknown',
        files: [],
        reason: 'example/unregistered is not in the local registry'
      },
      [`${BACKPACK}@2026-11-01`]: {
        verdict: 'unknown',
        files: [],
        reason: 'version ref 2026-11-01 is a date; a repository input needs a commit or tag'
      },
      'example/unfetched@abc1234': {
        verdict: 'unknown',
        files: [],
        reason: `unfetched at ${checkout}/unfetched has no origin/main; fetch it, then check again`
      },
      [`${BACKPACK}@deadbeef`]: {
        verdict: 'unknown',
        files: [],
        reason: `deadbeef is not in ki-agent-backpack at ${checkout}/backpack; fetch it, or correct the input`
      },
      [`${BACKPACK}@${unpushed}`]: {
        verdict: 'unknown',
        files: [],
        reason: `${unpushed} is not on ki-agent-backpack's origin/main: unpushed, or on another branch`
      },
      'missing.change.md@2026-11-01': {
        verdict: 'unknown',
        files: [],
        reason: 'missing.change.md is not in the store'
      },
      '../../../../outside.md@2026-11-01': {
        verdict: 'unknown',
        files: [],
        reason: '../../../../outside.md is not in the store'
      },
      'work/ex/ex.other/11-other.change.md@v1': {
        verdict: 'unknown',
        files: [],
        reason: 'version ref v1 is neither a commit nor a date'
      },
      '../ex.other/plain.md@2026-11-01': {
        verdict: 'unknown',
        files: [],
        reason: 'work/ex/ex.other/plain.md has no ki-revised to compare with 2026-11-01'
      },
      'Board minutes@v2': { verdict: 'unknown', files: [], reason: 'Board minutes is not in the store' }
    })
    const whole = inputsOf(json, '40-whole.change.md')
    expect(whole[`${BACKPACK}@${base}`]).toMatchObject({ verdict: 'moved', reason: null })
    expect(whole[`${BACKPACK}@${base}`]?.files).toHaveLength(5)
    expect(whole['work/ex/ex.other/12-newer.change.md@2026-11-19T00:00:00Z']).toEqual({
      verdict: 'moved',
      files: [],
      reason: 'work/ex/ex.other/12-newer.change.md revised 2026-11-21T08:00:00Z'
    })
    expect(whole[`roster/actors/quire/_index.md@${storeBase}`]).toEqual({
      verdict: 'moved',
      files: [{ path: 'roster/actors/quire/_index.md', change: 'modified' }],
      reason: null
    })
  })

  test('renders the text report, exiting 1 when any document is moved or unknown and 0 when all are current', async () => {
    const box = await sandbox()
    const { base } = await backpack(box)
    await register(box)
    await store(box)
    await packages(box)
    await box.root.write(
      `${SUMMIT}/10-moved.change.md`,
      change('draft', [
        `${BACKPACK}:skills/b/old.md@${base}`,
        `${BACKPACK}:skills/d/steady.md@${base}`,
        'https://example.com/a/page',
        'example/unregistered@abc1234'
      ])
    )
    await box.root.write(
      `${SUMMIT}/20-whole.change.md`,
      change('agreed', [`${BACKPACK}@${base}`, 'work/ex/ex.other/12-newer.change.md@2026-11-20'])
    )
    await box.root.write(`${SUMMIT}/30-none.change.md`, '# No front matter, so no status\n')
    await box.root.write(`${SUMMIT}/sub/10-strand.change.md`, change('draft', [`${BACKPACK}:skills/d@${base}`]))

    const moved = await box.run('ki work base', { runner: 'default' })

    expect(moved.exitCode).toBe(1)
    expect(moved.stdout).toBe(
      [
        '╭─ KI WORK BASE',
        '├─ moved (2)',
        '│  ├─ ex.summit · work/ex/ex.summit/10-moved.change.md · draft',
        `│  │  ├─ ${BACKPACK}:skills/b/old.md@${base} · moved · 1 file`,
        '│  │  │  ╰─ skills/b/old.md renamed to skills/b/new.md',
        '│  │  ├─ https://example.com/a/page · unchecked',
        '│  │  │  a URL, outside Git and the store',
        '│  │  ╰─ example/unregistered@abc1234 · unknown',
        '│  │     example/unregistered is not in the local registry',
        '│  ╰─ ex.summit · work/ex/ex.summit/20-whole.change.md · agreed',
        `│     ├─ ${BACKPACK}@${base} · moved · 5 files`,
        '│     │  ├─ skills/a/standard.md modified',
        '│     │  ├─ skills/b/old.md renamed to skills/b/new.md',
        '│     │  ├─ skills/c/gone.md deleted',
        '│     │  ├─ docs/elsewhere.md renamed to skills/e/arrived.md',
        '│     │  ╰─ skills/f/added.md added',
        '│     ╰─ work/ex/ex.other/12-newer.change.md@2026-11-20 · moved',
        '│        work/ex/ex.other/12-newer.change.md revised 2026-11-21T08:00:00Z',
        '├─ unknown (1)',
        '│  ╰─ ex.summit · work/ex/ex.summit/30-none.change.md',
        '│     no ki-inputs',
        '├─ current (1)',
        '│  ╰─ ex.summit+sub · work/ex/ex.summit/sub/10-strand.change.md',
        '├─ closed, not checked (2)',
        '╰─ summary: DOCUMENTS=4 MOVED=2 UNKNOWN=1 CURRENT=1 CLOSED=2',
        ''
      ].join('\n')
    )

    await box.root.write(`${SUMMIT}/10-moved.change.md`, change('done', []))
    await box.root.write(`${SUMMIT}/20-whole.change.md`, change('done', []))
    await box.root.write(`${SUMMIT}/30-none.change.md`, change('replaced', []))
    box.cd('..')
    const current = await box.run(`ki work base --repo ${box.root.path}/app`, { runner: 'default' })

    expect(current.exitCode).toBe(0)
    expect(current.stdout).toBe(
      [
        '╭─ KI WORK BASE',
        '├─ moved (0)',
        '├─ unknown (0)',
        '├─ current (0)',
        '├─ closed, not checked (3)',
        '╰─ summary: DOCUMENTS=0 MOVED=0 UNKNOWN=0 CURRENT=0 CLOSED=3',
        ''
      ].join('\n')
    )
  })

  test('reads only the packages naming the repository --repo names, and checks an unreadable package’s documents', async () => {
    const box = await sandbox()
    const { base } = await backpack(box)
    await register(box)
    await store(box)
    await packages(box)
    await box.root.write(`${SUMMIT}/10-steady.change.md`, change('draft', [`${BACKPACK}:skills/d@${base}`]))
    await box.root.write('store/work/ex/ex.broken/_index.md', '---\nki-id: ex.broken\n---\n')
    await box.root.write('store/work/ex/ex.broken/10-elsewhere.change.md', change('draft', []))
    await box.root.write(
      'store/work/ex/ex.held/_index.md',
      '---\nki-id: ex.held\nki-repositories: [ex/app]\nki-state: on-hold\n---\n'
    )
    await box.root.write('store/work/ex/ex.held/10-held.change.md', change('draft', [`${BACKPACK}:skills/d@${base}`]))
    box.cd('..')

    const { result, json } = await report(box, `ki work base --repo ${box.root.path}/app --format json`)

    expect(result.exitCode).toBe(0)
    expect(
      json.documents.map((document: { package: string; path: string }) => [document.package, document.path])
    ).toEqual([
      ['ex.held', 'work/ex/ex.held/10-held.change.md'],
      ['ex.summit', 'work/ex/ex.summit/10-steady.change.md']
    ])
    expect(result.stderr).toBe(
      [
        'ki: warning: work/ex/ex.broken/_index.md: ki-level must be one of root, territory, regular, project',
        'ki: warning: work/ex/ex.held/_index.md: ki-level must be one of root, territory, regular, project',
        ''
      ].join('\n')
    )

    const every = await report(box, `ki work base --store ${box.root.path}/store --format json`)
    expect(every.json.documents.map((document: { path: string }) => document.path)).toContain(
      'work/ex/ex.broken/10-elsewhere.change.md'
    )
  })
})
