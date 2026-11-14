import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const WORK = '+/_WORK/ex.reg.alpha'

const declaration = (repository: string): string =>
  [
    '[repo]',
    'harnesses = ["example/harness"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    `repository = ${JSON.stringify(repository)}`,
    ''
  ].join('\n')

interface Harness {
  /** The base commit every document is written against, abbreviated as a document writes it. */
  readonly base: string
  /** A commit on the checkout's main that origin/main does not hold. */
  readonly unpushed: string
}

/**
 * A harness checkout whose origin/main has moved on from the base: one touched standard modified, one renamed, one
 * deleted, one added, one file renamed into a touched folder, and one standard left alone; then an unpushed commit.
 */
const harness = async (box: Sandbox): Promise<Harness> => {
  const git = (arguments_: readonly string[]) => box.root.git(arguments_, 'harness')
  await git(['init', '-q', '-b', 'main'])
  for (const path of ['skills/a/standard.md', 'skills/b/old.md', 'skills/c/gone.md', 'skills/d/steady.md'])
    await box.root.write(`harness/${path}`, `# ${path}\n`)
  await box.root.write('harness/docs/elsewhere.md', '# elsewhere\n')
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'base'])
  const base = (await git(['rev-parse', 'HEAD'])).slice(0, 9)
  await box.root.write('harness/skills/a/standard.md', '# a, revised\n')
  await git(['mv', 'skills/b/old.md', 'skills/b/new.md'])
  await git(['rm', '-q', 'skills/c/gone.md'])
  await box.root.mkdir('harness/skills/e')
  await git(['mv', 'docs/elsewhere.md', 'skills/e/arrived.md'])
  await box.root.write('harness/skills/f/added.md', '# added\n')
  await box.root.write('harness/README.md', '# unrelated\n')
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'main moves on'])
  await git(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  await box.root.write('harness/skills/a/standard.md', '# a, unpushed\n')
  await git(['commit', '-q', '-am', 'unpushed'])
  return { base, unpushed: await git(['rev-parse', 'HEAD']) }
}

/** The registry: the harness under its Base: name, the principal holding the documents, and a checkout with no origin/main. */
const register = async (box: Sandbox): Promise<string> => {
  const root = await realpath(box.root.path)
  const entries = [
    ['ki-agent-backpack', 'example/ki-agent-backpack', 'harness'],
    ['principal', 'example/principal', 'principal'],
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
  await box.root.write('principal/.ki.toml', declaration('https://github.com/example/principal'))
  return root
}

const document = (box: Sandbox, name: string, header: readonly string[]) =>
  box.root.write(
    `principal/${WORK}/${name}`,
    [`# ${name}`, '', ...header, '', '## Proposal', '', 'Base: ignored', ''].join('\n')
  )

const report = async (box: Sandbox, command = 'ki work base --format json') => {
  const result = await box.run(command, { runner: 'default' })
  return { result, json: JSON.parse(result.stdout) }
}

const verdicts = (json: { documents: { path: string; verdict: string; files: unknown[]; reason: string | null }[] }) =>
  Object.fromEntries(
    json.documents.map((entry) => [
      entry.path.slice(WORK.length + 1),
      { verdict: entry.verdict, files: entry.files, reason: entry.reason }
    ])
  )

describe('ki work base', () => {
  test('reports moved, renamed, deleted and current documents against origin/main, and skips the graduated', async () => {
    const box = await sandbox()
    const { base } = await harness(box)
    await register(box)
    await document(box, 'moved.change.md', [
      'Status: draft',
      `Base: ki-agent-backpack@${base}`,
      'Touches: `skills/a/standard.md`, `skills/d/steady.md`, `skills/f/`',
      '**Status:** a later line does not govern'
    ])
    await document(box, 'renamed.change.md', [
      `Base: ki-agent-backpack@${base} (8 November 2026)`,
      'Touches: `skills/b/old.md` and `./skills/e`'
    ])
    await document(box, 'deleted.change.md', [
      `Base: ki-agent-backpack@${base}`,
      'Touches: skills/c/gone.md and skills/d/steady.md.'
    ])
    await document(box, 'current.change.md', [
      `**Base:** ki-agent-backpack@${base}`,
      'Touches: `example/ki-agent-backpack` `skills/d/steady.md`'
    ])
    await document(box, 'graduated.change.md', [
      'Status: graduated',
      `Base: ki-agent-backpack@${base}`,
      'Touches: `skills/a/standard.md`'
    ])
    await document(box, 'note.design.md', [`Base: ki-agent-backpack@${base}`, 'Touches: `skills/d/steady.md`'])
    await document(box, 'unmigrated.design.md', ['Status: draft', 'Touches: `skills/a/standard.md`'])
    await box.root.write(`principal/${WORK}/notes.md`, 'Base: ki-agent-backpack@0000000\n')

    const { result, json } = await report(box)

    expect(result.exitCode).toBe(1)
    expect(json.schema).toBe('ki/work-base/v1')
    expect(json.graduated).toEqual([{ repository: 'principal', path: `${WORK}/graduated.change.md` }])
    expect(json.documents.map((entry: { path: string }) => entry.path.slice(WORK.length + 1))).toEqual([
      'current.change.md',
      'deleted.change.md',
      'moved.change.md',
      'note.design.md',
      'renamed.change.md'
    ])
    expect(json.documents[2]).toMatchObject({
      repository: 'principal',
      base: { repository: 'ki-agent-backpack', commit: base },
      touches: ['skills/a/standard.md', 'skills/d/steady.md', 'skills/f'],
      status: 'draft'
    })
    expect(verdicts(json)).toEqual({
      'current.change.md': { verdict: 'current', files: [], reason: null },
      'deleted.change.md': {
        verdict: 'moved',
        files: [{ path: 'skills/c/gone.md', change: 'deleted' }],
        reason: null
      },
      'moved.change.md': {
        verdict: 'moved',
        files: [
          { path: 'skills/a/standard.md', change: 'modified' },
          { path: 'skills/f/added.md', change: 'added' }
        ],
        reason: null
      },
      'note.design.md': { verdict: 'current', files: [], reason: null },
      'renamed.change.md': {
        verdict: 'moved',
        files: [
          { path: 'skills/b/old.md', change: 'renamed', to: 'skills/b/new.md' },
          { path: 'docs/elsewhere.md', change: 'renamed', to: 'skills/e/arrived.md' }
        ],
        reason: null
      }
    })
  })

  test('reports unknown, never a pass, where the base or the touched files cannot be checked', async () => {
    const box = await sandbox()
    const { base, unpushed } = await harness(box)
    await register(box)
    await box.root.git(['init', '-q', '-b', 'main'], 'unfetched')
    await document(box, 'missing.change.md', ['Base: ki-agent-backpack@deadbeef0', 'Touches: `skills/a/standard.md`'])
    await document(box, 'unpushed.change.md', [
      `Base: ki-agent-backpack@${unpushed.slice(0, 9)}`,
      'Touches: `skills/a/standard.md`'
    ])
    await document(box, 'no-base.change.md', ['Touches: `skills/a/standard.md`'])
    await document(box, 'no-touches.change.md', [`Base: ki-agent-backpack@${base}`])
    await document(box, 'malformed.change.md', ['Base: ki-agent-backpack', 'Touches: `skills/a/standard.md`'])
    await document(box, 'unregistered.change.md', ['Base: other-harness@abcd123', 'Touches: `skills/a/standard.md`'])
    await document(box, 'unfetched.change.md', ['Base: unfetched@abcd123', 'Touches: `skills/a/standard.md`'])
    await document(box, 'elsewhere.change.md', [
      `Base: ki-agent-backpack@${base}`,
      'Touches: `example/app` `docs/x.md`; `example/app` `docs/y.md`; `example/ki-agent-backpack` `skills/a/standard.md`'
    ])
    await document(box, 'empty.change.md', [`Base: ki-agent-backpack@${base}`, 'Touches: `example/ki-agent-backpack`'])

    const { result, json } = await report(box)

    expect(result.exitCode).toBe(1)
    const checkout = `${await realpath(box.root.path)}`
    expect(verdicts(json)).toEqual({
      'elsewhere.change.md': {
        verdict: 'unknown',
        files: [],
        reason: 'touches files outside ki-agent-backpack: example/app'
      },
      'empty.change.md': { verdict: 'unknown', files: [], reason: 'Touches: names no files' },
      'malformed.change.md': {
        verdict: 'unknown',
        files: [],
        reason: 'Base: ki-agent-backpack is not <repository>@<commit>'
      },
      'missing.change.md': {
        verdict: 'unknown',
        files: [],
        reason: `base deadbeef0 is not in ki-agent-backpack at ${checkout}/harness; fetch it, or correct the Base: line`
      },
      'no-base.change.md': { verdict: 'unknown', files: [], reason: 'no Base: line' },
      'no-touches.change.md': { verdict: 'unknown', files: [], reason: 'no Touches: line' },
      'unfetched.change.md': {
        verdict: 'unknown',
        files: [],
        reason: `unfetched at ${checkout}/unfetched has no origin/main; fetch it, then check again`
      },
      'unpushed.change.md': {
        verdict: 'unknown',
        files: [],
        reason: `base ${unpushed.slice(0, 9)} is not on ki-agent-backpack's origin/main: unpushed, or on another branch`
      },
      'unregistered.change.md': {
        verdict: 'unknown',
        files: [],
        reason: 'other-harness is not in the local registry'
      }
    })
    expect(json.documents.find((entry: { path: string }) => entry.path.endsWith('malformed.change.md')).base).toBe(null)
  })

  test('renders the text report and exits 0 when every document is current', async () => {
    const box = await sandbox()
    const { base } = await harness(box)
    await register(box)
    await document(box, 'current.change.md', [`Base: ki-agent-backpack@${base}`, 'Touches: `skills/d/steady.md`'])
    await document(box, 'graduated.change.md', ['Status: Graduated 8 November 2026', 'Touches: `skills/a/standard.md`'])

    const result = await box.run('ki work base', { runner: 'default' })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        '╭─ KI WORK BASE',
        '├─ moved (0)',
        '├─ unknown (0)',
        '├─ current (1)',
        `│  ╰─ principal · ${WORK}/current.change.md · ki-agent-backpack@${base}`,
        '├─ graduated, not checked (1)',
        '╰─ summary: DOCUMENTS=1 MOVED=0 UNKNOWN=0 CURRENT=1 GRADUATED=1',
        ''
      ].join('\n')
    )
  })

  test('renders moved files and unknown reasons as text and exits 1', async () => {
    const box = await sandbox()
    const { base } = await harness(box)
    await register(box)
    await document(box, 'renamed.change.md', [
      `Base: ki-agent-backpack@${base}`,
      'Touches: `skills/b/old.md`, `skills/c/gone.md`'
    ])
    await document(box, 'no-base.change.md', ['Touches: `skills/a/standard.md`'])

    const result = await box.run('ki work base', { runner: 'default' })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe(
      [
        '╭─ KI WORK BASE',
        '├─ moved (1)',
        `│  ╰─ principal · ${WORK}/renamed.change.md · ki-agent-backpack@${base}`,
        '│     ├─ skills/b/old.md renamed to skills/b/new.md',
        '│     ╰─ skills/c/gone.md deleted',
        '├─ unknown (1)',
        `│  ╰─ principal · ${WORK}/no-base.change.md`,
        '│     no Base: line',
        '├─ current (0)',
        '├─ graduated, not checked (0)',
        '╰─ summary: DOCUMENTS=2 MOVED=1 UNKNOWN=1 CURRENT=0 GRADUATED=0',
        ''
      ].join('\n')
    )
  })

  test('reads only the repository --repo names, keyed by the registry or else by its folder name', async () => {
    const box = await sandbox()
    const { base } = await harness(box)
    await register(box)
    await document(box, 'current.change.md', [`Base: ki-agent-backpack@${base}`, 'Touches: `skills/d/steady.md`'])
    await box.root.write('loose/.ki.toml', declaration('https://github.com/example/loose'))
    await box.root.write(
      `loose/${WORK}/loose.change.md`,
      `Base: ki-agent-backpack@${base}\nTouches: \`skills/d/steady.md\`\n`
    )
    box.cd('..')

    const registered = await report(box, `ki work base --repo ${box.root.path}/principal --format json`)
    const unregistered = await report(box, `ki work base --repo ${box.root.path}/loose --format json`)

    expect(registered.result.exitCode).toBe(0)
    expect(registered.json.documents.map((entry: { repository: string }) => entry.repository)).toEqual(['principal'])
    expect(unregistered.json.documents.map((entry: { repository: string }) => entry.repository)).toEqual(['loose'])
  })
})
