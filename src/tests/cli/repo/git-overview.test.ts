import { chmod, readFile, realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Runner, runCommand, type Sandbox, sandbox } from '../_cli_helper.ts'
import {
  facts,
  gitDeclaration,
  gitFixture,
  installGitCatalogue,
  observations,
  overview
} from '../_git_overview_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

const command = 'ki repo audit --skill ki-git --reporter-levels all'
const executionDirectory = (limits: Parameters<Runner>[3]): string => {
  if (!limits?.cwd) throw new Error('fixture expected a bounded working directory')
  return limits.cwd
}
const cleanCodes = ['CLEAN-2', 'CLEAN-3', 'CLEAN-4', 'CLEAN-5', 'CLEAN-6', 'CLEAN-7']
const supply = (box: Sandbox, document: unknown, exitCode = 0) => {
  const calls: Parameters<Runner>[] = []
  box.setRunner(async (...args) => {
    calls.push(args)
    expect(args[0]).toBe('mgit')
    expect(args[1]).toEqual(['--ignore', '--physical', 'overview', '--json'])
    expect(args[3]).toMatchObject({ timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024, platform: 'darwin' })
    return { exitCode, stdout: JSON.stringify(document), output: 'stderr is not JSON and must not be parsed' }
  })
  let network = 0
  box.setFetcher(async () => {
    network++
    throw new Error('provider forbidden')
  })
  return { calls, network: () => network }
}
const expectUnassessed = (output: string) => {
  for (const code of cleanCodes) {
    expect(output).toMatch(new RegExp(`info \\[.*\\(${code}\\)\\].*unassessed`))
    expect(output).not.toMatch(new RegExp(`pass \\[.*\\(${code}\\)`))
  }
  expect(output).not.toContain('estate is clean')
}

const dirty = (root: string) =>
  facts(root, {
    state: 'dirty',
    upstream: { state: 'tracking', name: 'origin/main', ahead: 2, behind: 3 },
    changes: { staged: 2, modified: 1, untracked: 3, conflicted: 0 },
    stashes: 2,
    worktrees: { linked: 3, prunable: 1, detached: 1 },
    last_fetch_age_days: 91,
    obsolete_branches: [
      { name: 'finished', scope: 'local', reasons: ['merged'], age_days: 2, automation: false },
      { name: 'equivalent', scope: 'local', reasons: ['equivalent'], age_days: 3, automation: false },
      { name: 'origin/automation/old', scope: 'remote', reasons: ['stale', 'merged'], age_days: 60, automation: true },
      { name: 'origin/dependabot/pkg', scope: 'remote', reasons: ['equivalent'], age_days: 40, automation: true },
      { name: 'origin/renovate/pkg', scope: 'remote', reasons: ['stale'], age_days: null, automation: true },
      { name: 'gone', scope: 'local', reasons: ['gone'], age_days: null, automation: false }
    ]
  })

describe('ki-git host evidence', () => {
  test('injects the complete producer document losslessly and keeps partial exit-1 evidence', async () => {
    const { box, root } = await gitFixture()
    const document = overview(
      facts('/unrelated'),
      { label: 'failed', path: '/failed', state: 'failed', error: 'fixture' },
      facts(root)
    )
    const spy = supply(box, document, 1)
    const result = await box.run(command, { platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expect(spy.calls).toHaveLength(1)
    expect(spy.calls[0]?.[3]?.cwd).toBe(root)
    expect(await observations(box)).toEqual([{ mode: 'audit', repository: root, supplied: true, document }])
    for (const code of cleanCodes) expect(result.output).toMatch(new RegExp(`pass \\[.*\\(${code}\\)`))
    expect(result.output).not.toMatch(/pass \[.*\(CLEAN-1\)/)
    expect(result.output).not.toContain('GIT-OVERVIEW')
    expect(spy.network()).toBe(0)
  })

  test.each(['audit', 'conform --dry-run', 'conform'])(
    'renders guarded canonical findings without Git writes during %s',
    async (operation) => {
      const { box, root } = await gitFixture()
      await box.project.git(['init', '-q', '-b', 'main'])
      await box.project.git(['add', '.ki.toml'])
      await box.project.git(['commit', '-q', '-m', 'fixture'])
      await box.project.write('untouched.txt', 'untouched\n')
      const before = await box.project.git(['status', '--porcelain=v1'])
      const index = await readFile(`${root}/.git/index`)
      const source = await box.project.read('.ki.toml')
      const spy = supply(box, overview(dirty(root)))
      const result = await box.run(`ki repo ${operation} --skill ki-git --reporter-levels all`, { platform: 'darwin' })
      expect(result.exitCode, result.output).toBe(0)
      for (const code of cleanCodes) expect(result.output).toMatch(new RegExp(`warn \\[.*\\(${code}\\)`))
      for (const text of [
        'finished',
        'equivalent',
        'automation/old',
        'dependabot/pkg',
        'renovate/pkg',
        'gone',
        '91 days ago',
        'unless a thread'
      ])
        expect(result.output).toContain(text)
      expect(result.output).not.toContain('proposed write')
      expect(await box.project.git(['status', '--porcelain=v1'])).toBe(before)
      expect(await readFile(`${root}/.git/index`)).toEqual(index)
      expect(await box.project.read('.ki.toml')).toBe(source)
      expect(await box.project.read('untouched.txt')).toBe('untouched\n')
      expect(spy.calls).toHaveLength(1)
      expect(spy.network()).toBe(0)
    }
  )

  test.each([
    ['upstream-free', { upstream: { state: 'none', name: null, ahead: 0, behind: 0 } }, 'no upstream'],
    ['gone', { upstream: { state: 'gone', name: 'origin/gone', ahead: 0, behind: 0 } }, 'gone upstream'],
    ['detached', { branch: null, detached: true }, 'every reported local branch is level with its upstream'],
    ['bare', { bare: true, branch: null }, 'bare repository'],
    [
      'no recorded fetch',
      {
        last_fetch_age_days: null,
        obsolete_branches: [
          { name: 'origin/old', scope: 'remote', reasons: ['merged'], age_days: 40, automation: false }
        ]
      },
      'no recorded fetch'
    ]
  ] as const)('preserves %s context and unsupported-fact limits', async (_name, extra, message) => {
    const { box, root } = await gitFixture()
    supply(box, overview(facts(root, extra)))
    const result = await box.run(command, { platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain(message)
    expect(result.output).not.toMatch(/pass \[.*\(CLEAN-1\)/)
    expect(result.output).not.toContain('estate is clean')
  })

  test('keeps repository-wide facts unassessed on a secondary checkout', async () => {
    const { box, root } = await gitFixture()
    const record: Record<string, unknown> = facts(root)
    delete record['worktrees']
    delete record['default_branch']
    supply(box, overview(record))
    const result = await box.run(command, { platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    for (const code of ['CLEAN-2', 'CLEAN-3', 'CLEAN-5', 'CLEAN-6'])
      expect(result.output).toMatch(new RegExp(`info \\[.*\\(${code}\\)\\].*unassessed`))
    expect(result.output).toContain('another checkout')
  })

  test('does not reinterpret a non-standard stale threshold or nullable default branch', async () => {
    const { box, root } = await gitFixture()
    supply(box, { ...overview(facts(root, { default_branch: null })), stale_days: 12 })
    const result = await box.run(command, { platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toMatch(/info \[.*\(CLEAN-3\)\].*unassessed/)
    expect(result.output).toContain('12-day stale threshold')
  })

  test.each([
    'null',
    'array',
    'tool',
    'command',
    'threshold',
    'repositories',
    'missing',
    'failed',
    'branch',
    'upstream',
    'changes',
    'stashes',
    'age',
    'worktrees',
    'branches',
    'branch-reason'
  ])('fails closed on parsed %s evidence without repairing the document', async (kind) => {
    const { box, root } = await gitFixture()
    const record: Record<string, unknown> = facts(root)
    let document: unknown = overview(record)
    if (kind === 'null') document = null
    if (kind === 'array') document = []
    if (kind === 'tool') document = { ...overview(record), tool: 'other' }
    if (kind === 'command') document = { ...overview(record), command: 'status' }
    if (kind === 'threshold') document = { ...overview(record), stale_days: -1 }
    if (kind === 'repositories') document = { ...overview(record), repositories: {} }
    if (kind === 'missing') document = overview(facts('/unrelated'))
    if (kind === 'failed')
      document = overview({ path: root, label: 'bad', state: 'failed', error: 'unavailable checkout' })
    if (kind === 'branch') record['branch'] = 12
    if (kind === 'upstream') record['upstream'] = { state: 'tracking', ahead: -1 }
    if (kind === 'changes') record['changes'] = { staged: -1, untracked: 0 }
    if (kind === 'stashes') record['stashes'] = null
    if (kind === 'age') record['last_fetch_age_days'] = 'yesterday'
    if (kind === 'worktrees') record['worktrees'] = { linked: -1 }
    if (kind === 'branches') record['obsolete_branches'] = null
    if (kind === 'branch-reason')
      record['obsolete_branches'] = [
        { name: 'bad', scope: 'local', reasons: [null], age_days: null, automation: false }
      ]
    supply(box, document)
    const result = await box.run(command, { platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expectUnassessed(result.output)
    expect(result.output).not.toContain('GIT-OVERVIEW')
    expect((await observations(box))[0]?.document).toEqual(document)
  })

  test.each(['missing', 'rejected', 'timeout', 'overflow', 'stdout', 'json', 'status'])(
    'warns on acquisition %s and leaves every CLEAN check unassessed',
    async (kind) => {
      const { box, root } = await gitFixture()
      box.setRunner(async () => {
        if (kind === 'missing') throw new Error('spawn mgit ENOENT')
        if (kind === 'rejected') throw 'runner rejection'
        if (kind === 'timeout') throw new Error('process timeout')
        if (kind === 'overflow') throw new Error('process output limit')
        if (kind === 'stdout') return { exitCode: 0, output: JSON.stringify(overview(facts(root))) }
        return {
          exitCode: kind === 'status' ? 2 : 0,
          stdout: kind === 'json' ? '{' : JSON.stringify(overview(facts(root))),
          output: ''
        }
      })
      const result = await box.run(command)
      expect(result.exitCode, result.output).toBe(0)
      expect(result.output).toContain('GIT-OVERVIEW')
      expect(result.output).toContain(root)
      expectUnassessed(result.output)
      expect((await observations(box))[0]?.supplied).toBe(false)
    }
  )

  test('refreshes evidence once after an independent conform write and does not reuse the initial document', async () => {
    const { box, root } = await gitFixture(true)
    let calls = 0
    const documents = [overview(facts(root)), overview(dirty(root))]
    box.setRunner(async (executable) => {
      expect(executable).toBe('mgit')
      return { exitCode: 0, stdout: JSON.stringify(documents[calls++]), output: '' }
    })
    const result = await box.run('ki repo conform --skill ki-git --reporter-levels all')
    expect(result.exitCode, result.output).toBe(0)
    expect(calls).toBe(2)
    expect(await box.project.read('marker.txt')).toBe('fixture\n')
    expect(await observations(box)).toEqual(
      documents.map((document, index) => ({
        mode: index ? 'audit' : 'conform',
        repository: root,
        supplied: true,
        document
      }))
    )
    expect(result.output).toMatch(/warn \[.*\(CLEAN-5\)/)
  })

  test('withholds evidence from another selected skill and skips acquisition for educate', async () => {
    const { box, root } = await gitFixture()
    await box.project.write('.ki.toml', `${gitDeclaration}\n[skills.ki-other]\n`)
    await box.setupExampleHarness({
      name: 'ki-other',
      rubric: `
export default { contract: 1, name: 'ki-other', concern: 'Session observer', families: [{ code: 'OTHER', title: 'Other', description: 'Evidence isolation', standard: 'fixture.md', selectContext: x => x, items: [{ code: 'OTHER-1', title: 'No git evidence', description: 'No evidence leak', sources: ['fixture.md'], mechanical: { level: 'FAIL', remediation: { class: 'diagnostic', guidance: 'Withhold evidence' }, audit: { phase: 'INSPECT', run: options => [{ status: Object.hasOwn(options, 'gitOverview') ? 'VIOLATION' : 'PASS', message: 'no Git document' }] } } }] }], createSession: async options => ({ subjects: [{ families: ['OTHER'], context: () => options }], proposal: () => ({ writes: [] }) }) }
`
    })
    const spy = supply(box, overview(facts(root)))
    expect((await box.run('ki repo audit --reporter-levels all', { platform: 'darwin' })).exitCode).toBe(0)
    expect(spy.calls).toHaveLength(1)
    expect((await box.run('ki repo audit --skill ki-other')).exitCode).toBe(0)
    expect((await box.run('ki repo conform --skill ki-other')).exitCode).toBe(0)
    expect((await box.run('ki repo educate --skill ki-git')).exitCode).toBe(0)
    expect(spy.calls).toHaveLength(1)
  })

  test('uses a physical cwd with the real bounded runner while keeping stderr separate', async () => {
    const { box, root } = await gitFixture()
    const bin = await box.root.mkdir('bin')
    await box.root.write(
      'bin/mgit',
      '#!/bin/sh\n[ "$PWD" = "$EXPECTED_ROOT" ] || exit 2\nprintf "stderr diagnostic" >&2\nexec /bin/cat "$FIXTURE_DOCUMENT"\n'
    )
    await chmod(`${bin}/mgit`, 0o755)
    await box.root.write('document.json', JSON.stringify(overview(facts(root))))
    box.setEnv({
      PATH: `${bin}:/usr/bin:/bin`,
      EXPECTED_ROOT: root,
      FIXTURE_DOCUMENT: `${box.root.path}/document.json`
    })
    const result = await box.run(command, { runner: 'default', platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toMatch(/pass \[.*\(CLEAN-5\)/)
    expect(result.output).not.toContain('GIT-OVERVIEW')
    const unsupported = await box.run(command, { runner: 'default', platform: 'win32' })
    expect(unsupported.output).toContain('bounded execution requires a POSIX process group')
    expectUnassessed(unsupported.output)
  })

  test('preserves producer UTF-8 characters split across stdout chunks', async () => {
    const { box, root } = await gitFixture()
    const bin = await box.root.mkdir('bin')
    const document = { ...overview(facts(root)), unicode: 'caf\u00e9' }
    const serialized = JSON.stringify(document)
    const split = serialized.indexOf('\u00e9')
    await box.root.write('prefix.json', serialized.slice(0, split))
    await box.root.write('suffix.json', serialized.slice(split + 1))
    await box.root.write(
      'bin/mgit',
      '#!/bin/sh\n/bin/cat "$FIXTURE_PREFIX"\nprintf "\\303"\n/bin/sleep 0.1\nprintf "\\251"\nexec /bin/cat "$FIXTURE_SUFFIX"\n'
    )
    await chmod(`${bin}/mgit`, 0o755)
    box.setEnv({
      PATH: `${bin}:/usr/bin:/bin`,
      FIXTURE_PREFIX: `${box.root.path}/prefix.json`,
      FIXTURE_SUFFIX: `${box.root.path}/suffix.json`
    })
    const result = await box.run(command, { runner: 'default', platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expect((await observations(box))[0]?.document).toEqual(document)
  })

  test.each(['timeout', 'overflow'])('handles the real bounded runner %s through the public seam', async (kind) => {
    const { box } = await gitFixture()
    const bin = await box.root.mkdir('bin')
    await box.root.write(
      'bin/mgit',
      kind === 'timeout' ? '#!/bin/sh\nexec /bin/sleep 2\n' : '#!/bin/sh\nprintf "a large output"\n'
    )
    await chmod(`${bin}/mgit`, 0o755)
    box.setEnv({ PATH: `${bin}:/usr/bin:/bin` })
    box.setRunner((executable, args, environment, limits) => {
      if (!limits) throw new Error('fixture expected bounded execution')
      return runCommand(executable, args, environment, {
        ...limits,
        timeoutMs: kind === 'overflow' ? 2000 : 30,
        maxBytes: kind === 'overflow' ? 1 : 1024
      })
    })
    const result = await box.run(command, { platform: 'darwin' })
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain(kind === 'timeout' ? 'process timeout' : 'process output limit')
    expectUnassessed(result.output)
  })

  test('preflights duplicate canonical roots before acquisition and supports symlink root matching', async () => {
    const { box, root } = await gitFixture()
    const alias = `${box.root.path}/alias`
    await symlink(root, alias)
    const spy = supply(box, overview(facts(alias)))
    const duplicate = await box.run(['ki', 'repo', 'audit', '--repo', root, '--repo', alias, '--skill', 'ki-git'])
    expect(duplicate.exitCode).toBe(2)
    expect(spy.calls).toHaveLength(0)
    const result = await box.run(
      ['ki', 'repo', 'audit', '--repo', alias, '--skill', 'ki-git', '--reporter-levels', 'all'],
      { platform: 'darwin' }
    )
    expect(result.exitCode, result.output).toBe(0)
    expect(spy.calls[0]?.[3]?.cwd).toBe(root)
    expect(result.output).toMatch(/pass \[.*\(CLEAN-5\)/)
  })

  test('isolates explicit and workspace roots, including extra repository-metadata records and skipped members', async () => {
    const box = await sandbox()
    await installGitCatalogue(box)
    const first = await box.project.mkdir('first')
    const second = await box.project.mkdir('second')
    await box.project.write('first/.ki.toml', gitDeclaration)
    await box.project.write('second/.ki.toml', gitDeclaration)
    await box.project.mkdir('outsider')
    await box.project.write(
      '.mgit.toml',
      'kind = "workspace"\n[members.first]\nkind = "repository"\ntype = "standard"\n[members.second]\nkind = "repository"\ntype = "standard"\n[members.outsider]\nkind = "repository"\ntype = "standard"\n'
    )
    const calls: string[] = []
    box.setRunner(async (executable, _args, _environment, limits) => {
      expect(executable).toBe('mgit')
      calls.push(executionDirectory(limits))
      const record = limits?.cwd === first ? facts(first, { stashes: 2 }) : facts(second)
      return {
        exitCode: 0,
        stdout: JSON.stringify(overview(facts('/metadata-extra', { stashes: 99 }), record)),
        output: ''
      }
    })
    const explicit = await box.run([
      'ki',
      'repo',
      'audit',
      '--repo',
      first,
      '--repo',
      second,
      '--skill',
      'ki-git',
      '--reporter-levels',
      'all'
    ])
    expect(explicit.exitCode, explicit.output).toBe(0)
    expect(calls).toEqual([first, second])
    expect(explicit.output).toContain('2 stash entries')
    expect(explicit.output).not.toContain('99 stash entries')
    calls.length = 0
    const workspace = await box.run(command)
    expect(workspace.exitCode, workspace.output).toBe(0)
    expect(calls).toEqual([first, second])
    expect(workspace.output).toContain('skipped mGit members (no .ki.toml): outsider')
    calls.length = 0
    expect((await box.run(`${command} --filter second`)).exitCode).toBe(0)
    expect(calls).toEqual([second])
  })

  test('keeps other selected roots assessable when one acquisition fails', async () => {
    const box = await sandbox()
    await installGitCatalogue(box)
    const roots = [await box.project.mkdir('first'), await box.project.mkdir('second')] as const
    for (const name of ['first', 'second']) await box.project.write(`${name}/.ki.toml`, gitDeclaration)
    box.setRunner(async (_executable, _args, _environment, limits) => {
      if (limits?.cwd === roots[0]) throw new Error('fixture unavailable')
      return { exitCode: 0, stdout: JSON.stringify(overview(facts(roots[1]))), output: '' }
    })
    const result = await box.run([
      'ki',
      'repo',
      'audit',
      '--repo',
      roots[0],
      '--repo',
      roots[1],
      '--skill',
      'ki-git',
      '--reporter-levels',
      'all'
    ])
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('GIT-OVERVIEW')
    expect(result.output).toMatch(/pass \[.*\(CLEAN-5\)/)
    expect((await observations(box)).map((entry) => entry.supplied)).toEqual([false, true])
  })

  test('retains estate, territory, principals and filter selection before evidence acquisition', async () => {
    const box = await sandbox()
    await installGitCatalogue(box)
    await box.setupExampleHarness({
      name: 'ki-trades',
      rubric: `export default { contract: 1, name: 'ki-trades', concern: 'Fixture', families: [], createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }) }`
    })
    await box.setupExampleHarness({
      name: 'ki-repo',
      rubric: `export default { contract: 1, name: 'ki-repo', concern: 'Selection fixture', families: [], createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }) }`
    })
    const capitalIdentity = home('example/capital')
    const memberIdentity = home('example/member')
    const capital = await box.project.mkdir('capital')
    const member = await box.project.mkdir('member')
    await box.project.write(
      'capital/.ki.toml',
      `${capitalConfiguration({ identity: 'example/capital', members: [capitalIdentity, memberIdentity] }).replace('territory_name =', 'territory_prefix = "fixture"\nterritory_name =')}\n[skills.ki-git]\n`
    )
    await box.project.write(
      'member/.ki.toml',
      `${memberConfiguration('example/member', { capital: capitalIdentity, trades: false })}\n[skills.ki-git]\n`
    )
    await box.state.write(
      'ki/registry.toml',
      `schema = 1\n[repositories.capital]\nrepository = "${capitalIdentity}"\npath = "${capital}"\n[repositories.member]\nrepository = "${memberIdentity}"\npath = "${member}"\n`
    )
    const calls: string[] = []
    box.setRunner(async (_executable, _args, _environment, limits) => {
      calls.push(executionDirectory(limits))
      return { exitCode: 0, stdout: JSON.stringify(overview(facts(executionDirectory(limits)))), output: '' }
    })
    for (const [selector, expected] of [
      ['--estate', [capital, member]],
      ['--territory fixture', [capital, member]],
      ['--principals', [capital]],
      ['--estate --filter member', [member]]
    ] as const) {
      calls.length = 0
      const result = await box.run(`${command} ${selector}`)
      expect(result.exitCode, result.output).toBe(0)
      expect(calls).toEqual(expected)
    }
    expect(await realpath(capital)).toBe(capital)
  })
})
