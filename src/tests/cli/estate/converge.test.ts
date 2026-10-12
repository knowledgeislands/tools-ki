import { lstat, readdir, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Runner, runCommand, sandbox } from '../_cli_helper.ts'

interface Target {
  readonly from: string
  readonly to?: string
  readonly path_from?: string
  readonly path_to: string
  readonly register?: boolean
  readonly title?: string
}

const encoded = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-')

/** A sandbox whose `lsof` reports the configured busy directories and whose other commands run for real. */
const estate = async (options: { readonly busy?: readonly string[]; readonly runner?: Runner } = {}) => {
  const box = await sandbox()
  const home = await realpath(box.home.path)
  const busy = [...(options.busy ?? [])]
  box.setRunner(async (command, arguments_, environment, limits) => {
    if (command === 'lsof') return { exitCode: 0, output: busy.map((path) => `p1\nn${join(home, path)}\n`).join('') }
    return (options.runner ?? runCommand)(command, arguments_, environment, limits)
  })
  const repository = async (path: string, remote?: string): Promise<void> => {
    await box.home.git(['init', '-q', '-b', 'main'], path)
    await box.home.write(`${path}/README.md`, `# ${path}\n`)
    await box.home.git(['add', '.'], path)
    await box.home.git(['commit', '-qm', 'init'], path)
    if (remote) await box.home.git(['remote', 'add', 'origin', remote], path)
  }
  const manifest = async (targets: readonly Target[]): Promise<string> => {
    await box.home.write(
      'targets.json',
      JSON.stringify({
        layout: 'test',
        repositories: targets.map((target) => ({
          title: target.from,
          to: target.from,
          register: false,
          ...target
        }))
      })
    )
    return join(home, 'targets.json')
  }
  const registry = (entries: Readonly<Record<string, { readonly repository: string; readonly path: string }>>) =>
    box.state.write(
      'ki/registry.toml',
      [
        'schema = 1',
        ...Object.entries(entries).flatMap(([key, entry]) => [
          '',
          `[repositories.${JSON.stringify(key)}]`,
          `repository = ${JSON.stringify(entry.repository)}`,
          `path = ${JSON.stringify(join(home, entry.path))}`
        ]),
        ''
      ].join('\n')
    )
  const session = (folder: string, cwd: string | undefined) =>
    box.home.write(
      `.claude/projects/${folder}/session.jsonl`,
      cwd === undefined ? '{"type":"summary"}\n' : `{"type":"user","cwd":${JSON.stringify(join(home, cwd))}}\n`
    )
  const remote = (path: string) => box.home.git(['remote', 'get-url', 'origin'], path)
  return { box, home, busy, repository, manifest, registry, session, remote }
}

type Estate = Awaited<ReturnType<typeof estate>>

const exists = async (path: string): Promise<boolean> => Boolean(await lstat(path).catch(() => undefined))

/**
 * The main reshape: two renamed checkouts in one organisation folder, one nested checkout, a linked
 * Paperclip worktree, Claude history, absolute, relative and tracked symlinks, and a OneDrive store link.
 */
const reshape = async (fixture: Estate): Promise<string> => {
  const { box, home, repository, manifest, registry, session } = fixture
  await repository('workspaces/kit/org/alpha', 'git@github.com:acme/alpha.git')
  await repository('workspaces/kit/org/beta', 'https://github.com/acme/beta')
  await repository('workspaces/deep/nest/gamma', 'ssh://git@github.com/acme/gamma.git')
  await repository('workspaces/kit/org/alpha-x', 'git@gitlab.com:acme/alpha-x.git')
  await repository('workspaces/kit/org/no-origin')
  await box.home.write('workspaces/kit/org/.mgit.toml', 'managed\n')
  await box.home.write('workspaces/kit/org/alpha/notes.txt', 'untracked\n')
  await box.home.git(
    ['worktree', 'add', '-q', join(home, '.paperclip/instances/default/worktrees/w1/alpha-wt')],
    'workspaces/kit/org/alpha'
  )
  await box.home.write('.paperclip/instances/default/worktrees/w1/plain/file.txt', 'not a worktree\n')
  await box.home.mkdir('.paperclip/instances/empty')
  await box.home.mkdir('.paperclip/instances/default/worktrees/a/b/c/d/e')
  await box.home.mkdir('workspaces/kit/org/plain/a/b/c')
  await symlink(join(home, 'workspaces/kit/org/alpha/README.md'), join(home, 'workspaces/kit/org/beta/absolute'))
  await symlink('../alpha/README.md', join(home, 'workspaces/kit/org/beta/relative'))
  await symlink('README.md', join(home, 'workspaces/kit/org/alpha/internal'))
  await symlink(join(home, 'workspaces/kit/org/alpha'), join(home, 'workspaces/kit/org/beta/tracked'))
  await box.home.git(['add', 'tracked'], 'workspaces/kit/org/beta')
  await box.home.git(['commit', '-qm', 'link'], 'workspaces/kit/org/beta')
  await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-test/notes')
  await symlink(
    join(home, 'workspaces/kit/org/alpha'),
    join(home, 'Library/CloudStorage/OneDrive-Personal/sources-test/notes/alpha')
  )
  await box.home.write('Library/CloudStorage/OneDrive-Broken', 'not a directory\n')
  await box.home.write('Library/CloudStorage/Dropbox/ignored', '\n')
  await box.home.write('Library/CloudStorage/OneDrive-Personal/other-store/ignored', '\n')
  await session(encoded(join(home, 'workspaces/kit/org/alpha')), 'workspaces/kit/org/alpha')
  await session(encoded(join(home, 'workspaces/kit/org/alpha/sub')), 'workspaces/kit/org/alpha/sub')
  await session(encoded(join(home, 'workspaces/kit/org/alpha-x')), 'workspaces/kit/org/alpha-x')
  await session(`${encoded(join(home, 'workspaces/kit/org/alpha'))}-unknown`, undefined)
  await box.home.mkdir(`.claude/projects/${encoded(join(home, 'workspaces/kit/org/alpha'))}-empty`)
  await box.home.write(
    '.claude.json',
    JSON.stringify(
      {
        numStartups: 1,
        projects: {
          [join(home, 'workspaces/kit/org/alpha')]: { allowedTools: [] },
          [join(home, 'workspaces/kit/org/alpha/sub')]: { allowedTools: [] },
          [join(home, 'workspaces/kit/org/alpha-x')]: { allowedTools: [] }
        }
      },
      null,
      2
    )
  )
  await registry({
    alpha: { repository: 'https://github.com/acme/alpha', path: 'workspaces/kit/org/alpha' },
    gamma: { repository: 'https://github.com/acme/gamma', path: 'workspaces/stale/gamma' },
    missing: { repository: 'https://github.com/acme/missing', path: 'workspaces/gone/missing' }
  })
  return manifest([
    {
      from: 'acme/alpha',
      to: 'acme/alpha-renamed',
      title: 'Alpha',
      path_from: '~/workspaces/kit/org/alpha',
      path_to: '~/workspaces/acme/alpha-renamed'
    },
    { from: 'acme/beta', path_from: '~/elsewhere/beta', path_to: '~/workspaces/acme/beta' },
    { from: 'acme/gamma', to: 'acme/gamma-renamed', path_to: '~/workspaces/deep/gamma' },
    { from: 'acme/absent', path_to: '~/workspaces/acme/absent' }
  ])
}

const snapshot = async (fixture: Estate) => ({
  registry: await fixture.box.state.read('ki/registry.toml'),
  claude: await fixture.box.home.read('.claude.json'),
  projects: (await readdir(join(fixture.home, '.claude/projects'))).sort(),
  alpha: await exists(join(fixture.home, 'workspaces/kit/org/alpha')),
  relative: await readlink(join(fixture.home, 'workspaces/kit/org/beta/relative')).catch(() => undefined)
})

describe('[ki estate converge]', () => {
  test('previews every planned action by default without changing anything', async () => {
    const fixture = await estate()
    const manifest = await reshape(fixture)
    const before = await snapshot(fixture)
    const result = await fixture.box.run(['ki', 'estate', 'converge', manifest])
    const home = fixture.home
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(`ki estate converge: preview of ${manifest}`)
    expect(result.output).toContain(
      [
        'converge acme/alpha-renamed (Alpha)',
        `  move ${home}/workspaces/kit/org/alpha -> ${home}/workspaces/acme/alpha-renamed`,
        `  worktree repair ${home}/workspaces/acme/alpha-renamed`,
        `    linked ${home}/.paperclip/instances/default/worktrees/w1/alpha-wt -> ${home}/.paperclip/instances/default/worktrees/w1/alpha-wt`,
        '  remote origin git@github.com:acme/alpha.git -> git@github.com:acme/alpha-renamed.git',
        `  registry alpha -> alpha-renamed: https://github.com/acme/alpha-renamed at ${home}/workspaces/acme/alpha-renamed`,
        `  claude folder ${home}/.claude/projects/${encoded(`${home}/workspaces/kit/org/alpha`)} -> ${home}/.claude/projects/${encoded(`${home}/workspaces/acme/alpha-renamed`)}`,
        `  claude folder ${home}/.claude/projects/${encoded(`${home}/workspaces/kit/org/alpha/sub`)} -> ${home}/.claude/projects/${encoded(`${home}/workspaces/acme/alpha-renamed/sub`)}`,
        `  claude project ${home}/workspaces/kit/org/alpha -> ${home}/workspaces/acme/alpha-renamed`,
        `  claude project ${home}/workspaces/kit/org/alpha/sub -> ${home}/workspaces/acme/alpha-renamed/sub`,
        '  note: 2 untracked file(s) move with the checkout'
      ].join('\n')
    )
    expect(result.output).toContain(
      `note: Claude folder ${encoded(`${home}/workspaces/kit/org/alpha`)}-empty has no session to attribute`
    )
    expect(result.output).toContain(
      `note: Claude folder ${encoded(`${home}/workspaces/kit/org/alpha`)}-unknown has no session to attribute`
    )
    expect(result.output).not.toContain(
      `claude folder ${home}/.claude/projects/${encoded(`${home}/workspaces/kit/org/alpha-x`)}`
    )
    expect(result.output).toContain(
      [
        'converge acme/beta (acme/beta)',
        `  move ${home}/workspaces/kit/org/beta -> ${home}/workspaces/acme/beta`,
        `  worktree repair ${home}/workspaces/acme/beta`,
        `  note: found at ${home}/workspaces/kit/org/beta, not the manifest path_from ${home}/elsewhere/beta`,
        '  note: 2 untracked file(s) move with the checkout',
        '  note: not in the ki registry'
      ].join('\n')
    )
    expect(result.output).toContain(
      [
        'converge acme/gamma-renamed (acme/gamma)',
        `  move ${home}/workspaces/deep/nest/gamma -> ${home}/workspaces/deep/gamma`,
        `  worktree repair ${home}/workspaces/deep/gamma`,
        '  remote origin ssh://git@github.com/acme/gamma.git -> ssh://git@github.com/acme/gamma-renamed.git',
        `  registry gamma -> gamma: https://github.com/acme/gamma-renamed at ${home}/workspaces/deep/gamma`
      ].join('\n')
    )
    expect(result.output).toContain('absent acme/absent (acme/absent): no local checkout')
    expect(result.output).toContain(
      `  rewrite symlink ${home}/workspaces/acme/beta/absolute: ${home}/workspaces/kit/org/alpha/README.md -> ${home}/workspaces/acme/alpha-renamed/README.md`
    )
    expect(result.output).toContain(
      `  rewrite symlink ${home}/workspaces/acme/beta/relative: ../alpha/README.md -> ../alpha-renamed/README.md`
    )
    expect(result.output).toContain(
      `  rewrite symlink ${home}/Library/CloudStorage/OneDrive-Personal/sources-test/notes/alpha: ${home}/workspaces/kit/org/alpha -> ${home}/workspaces/acme/alpha-renamed`
    )
    expect(result.output).toContain(
      `  tracked symlink, report only ${home}/workspaces/acme/beta/tracked: ${home}/workspaces/kit/org/alpha -> ${home}/workspaces/acme/alpha-renamed`
    )
    expect(result.output).not.toContain('internal')
    expect(result.output).toContain(`  remove empty ${home}/workspaces/deep/nest`)
    expect(result.output).toContain(`  leftover ${home}/workspaces/kit/org: .mgit.toml, alpha-x, no-origin`)
    expect(result.output).toContain(
      'summary: 3 converge, 0 no-op, 0 skip, 0 to clone, 1 absent; 3 symlink rewrite(s), 1 tracked symlink(s), 1 leftover parent(s)'
    )
    expect(result.output).toContain('preview only; rerun with --apply to execute')
    expect(result.output).toContain(
      `sweep: 2 remaining occurrence(s), report only\n  ${home}/.claude.json:4: workspaces/kit/org/alpha\n  ${home}/.claude.json:7: workspaces/kit/org/alpha\n`
    )
    expect(await snapshot(fixture)).toEqual(before)
    expect(await exists(join(fixture.box.state.path, 'ki/converge'))).toBe(false)
  })

  test('applies, re-applies as a no-op, and rolls back every recorded change', async () => {
    const fixture = await estate()
    const manifest = await reshape(fixture)
    const before = await snapshot(fixture)
    const { box, home } = fixture
    const applied = await box.run(['ki', 'estate', 'converge', manifest, '--apply'], {
      now: () => Date.UTC(2026, 9, 12)
    })
    expect(applied.exitCode).toBe(0)
    expect(applied.output).toContain('ki estate converge: apply of')
    const log = join(box.state.path, 'ki/converge/2026-10-12T00-00-00-000Z.json')
    expect(applied.output).toContain(`log ${log}\n`)
    expect(JSON.parse(await readFile(log, 'utf8'))).toMatchObject({
      schema: 'ki/estate-converge/v1',
      manifest,
      startedAt: '2026-10-12T00:00:00.000Z',
      backups: [
        { copy: join(box.state.path, 'ki/converge/2026-10-12T00-00-00-000Z.registry.toml') },
        { copy: join(box.state.path, 'ki/converge/2026-10-12T00-00-00-000Z.claude.json') }
      ]
    })
    expect(await readFile(join(box.state.path, 'ki/converge/2026-10-12T00-00-00-000Z.claude.json'), 'utf8')).toBe(
      before.claude
    )

    expect(await fixture.remote('workspaces/acme/alpha-renamed')).toBe('git@github.com:acme/alpha-renamed.git')
    expect(await fixture.remote('workspaces/acme/beta')).toBe('https://github.com/acme/beta')
    expect(await fixture.remote('workspaces/deep/gamma')).toBe('ssh://git@github.com/acme/gamma-renamed.git')
    expect(await box.home.git(['status', '--porcelain'], '.paperclip/instances/default/worktrees/w1/alpha-wt')).toBe('')
    expect(await box.home.read('workspaces/acme/alpha-renamed/notes.txt')).toBe('untracked\n')
    expect(await exists(join(home, 'workspaces/deep/nest'))).toBe(false)
    expect(await box.home.read('workspaces/kit/org/.mgit.toml')).toBe('managed\n')
    const registry = await box.state.read('ki/registry.toml')
    expect(registry).toContain(
      `[repositories."alpha-renamed"]\nrepository = "https://github.com/acme/alpha-renamed"\npath = "${home}/workspaces/acme/alpha-renamed"`
    )
    expect(registry).toContain(
      `[repositories."gamma"]\nrepository = "https://github.com/acme/gamma-renamed"\npath = "${home}/workspaces/deep/gamma"`
    )
    expect(registry).not.toContain('[repositories."alpha"]')
    const claude = JSON.parse(await box.home.read('.claude.json')) as {
      numStartups: number
      projects: Record<string, unknown>
    }
    expect(claude.numStartups).toBe(1)
    expect(Object.keys(claude.projects)).toEqual([
      join(home, 'workspaces/acme/alpha-renamed'),
      join(home, 'workspaces/acme/alpha-renamed/sub'),
      join(home, 'workspaces/kit/org/alpha-x')
    ])
    expect(await exists(join(home, '.claude/projects', encoded(join(home, 'workspaces/acme/alpha-renamed/sub'))))).toBe(
      true
    )
    expect(await readlink(join(home, 'workspaces/acme/beta/relative'))).toBe('../alpha-renamed/README.md')
    expect(await box.home.read('workspaces/acme/beta/relative')).toBe('# workspaces/kit/org/alpha\n')
    expect(await box.home.read('workspaces/acme/beta/absolute')).toBe('# workspaces/kit/org/alpha\n')
    expect(await readlink(join(home, 'workspaces/acme/beta/tracked'))).toBe(join(home, 'workspaces/kit/org/alpha'))
    expect(applied.output).toContain('sweep: 0 remaining occurrence(s), report only')

    const again = await box.run(['ki', 'estate', 'converge', manifest, '--apply'])
    expect(again.exitCode).toBe(0)
    expect(again.output).toContain('no-op acme/alpha-renamed (Alpha)')
    expect(again.output).toContain('no-op acme/beta (acme/beta)')
    expect(again.output).toContain('no-op acme/gamma-renamed (acme/gamma)')
    expect(again.output).toContain('nothing to apply')
    expect(await readdir(join(box.state.path, 'ki/converge'))).toHaveLength(3)

    const preview = await box.run(['ki', 'estate', 'converge', '--rollback', log])
    expect(preview.exitCode).toBe(0)
    expect(preview.output).toContain(`ki estate converge: rollback preview of ${log}`)
    expect(preview.output).toContain(`  recreate ${home}/workspaces/deep/nest`)
    expect(preview.output).toContain(`  move ${home}/workspaces/acme/alpha-renamed -> ${home}/workspaces/kit/org/alpha`)
    expect(preview.output).toContain('preview only; rerun with --apply to execute')
    expect(await exists(join(home, 'workspaces/acme/alpha-renamed'))).toBe(true)

    const rolledBack = await box.run(['ki', 'estate', 'converge', '--rollback', log, '--apply'], {
      now: () => Date.UTC(2026, 9, 13)
    })
    expect(rolledBack.exitCode).toBe(0)
    const rollbackLog = join(box.state.path, 'ki/converge/2026-10-13T00-00-00-000Z.rollback.json')
    expect(rolledBack.output).toContain(`log ${rollbackLog}\n`)
    expect(await snapshot(fixture)).toEqual({ ...before, claude: `${before.claude}` })
    expect(await fixture.remote('workspaces/kit/org/alpha')).toBe('git@github.com:acme/alpha.git')
    expect(await fixture.remote('workspaces/deep/nest/gamma')).toBe('ssh://git@github.com/acme/gamma.git')
    expect(await box.home.git(['status', '--porcelain'], '.paperclip/instances/default/worktrees/w1/alpha-wt')).toBe('')
    expect(await readlink(join(home, 'workspaces/kit/org/beta/absolute'))).toBe(
      join(home, 'workspaces/kit/org/alpha/README.md')
    )
    expect(await exists(join(home, 'workspaces/acme'))).toBe(true)

    const redone = await box.run(['ki', 'estate', 'converge', '--rollback', rollbackLog, '--apply'], {
      now: () => Date.UTC(2026, 9, 14)
    })
    expect(redone.exitCode).toBe(0)
    expect(await exists(join(home, 'workspaces/deep/nest'))).toBe(false)
    expect(await fixture.remote('workspaces/acme/alpha-renamed')).toBe('git@github.com:acme/alpha-renamed.git')
  })

  test('skips dirty, busy, colliding and ambiguous checkouts with their reasons', async () => {
    const fixture = await estate({ busy: ['workspaces/old/busy/src', 'elsewhere'] })
    const { box, home, repository, manifest, registry } = fixture
    await repository('workspaces/old/dirty', 'git@github.com:acme/dirty.git')
    await box.home.write('workspaces/old/dirty/README.md', 'changed\n')
    await repository('workspaces/old/busy', 'git@github.com:acme/busy.git')
    await repository('workspaces/old/collide', 'git@github.com:acme/collide.git')
    await box.home.mkdir('workspaces/new/collide')
    await repository('workspaces/old/twin-a', 'git@github.com:acme/twin.git')
    await repository('workspaces/old/twin-b', 'git@github.com:acme/twin.git')
    await repository('workspaces/old/one', 'git@github.com:acme/one.git')
    await repository('workspaces/old/two', 'git@github.com:acme/two.git')
    await repository('workspaces/old/keyed', 'git@github.com:acme/keyed.git')
    await box.home.mkdir('workspaces/new/occupied')
    await repository('workspaces/old/unplaced', 'git@github.com:acme/unplaced.git')
    await registry({
      keyed: { repository: 'https://github.com/acme/keyed', path: 'workspaces/old/keyed' },
      taken: { repository: 'https://github.com/acme/other', path: 'workspaces/other/taken' }
    })
    const path = await manifest([
      { from: 'acme/dirty', path_to: '~/workspaces/new/dirty' },
      { from: 'acme/busy', path_to: '~/workspaces/new/busy' },
      { from: 'acme/collide', path_to: '~/workspaces/new/collide' },
      { from: 'acme/twin', path_to: '~/workspaces/new/twin' },
      { from: 'acme/one', path_to: '~/workspaces/new/shared' },
      { from: 'acme/two', path_to: '~/workspaces/new/shared' },
      { from: 'acme/keyed', path_to: '~/workspaces/new/taken' },
      { from: 'acme/pending', register: true, path_to: '~/workspaces/new/occupied' },
      { from: 'acme/unplaced', path_from: '', path_to: '' },
      { from: 'acme/nowhere', path_from: '', path_to: '' }
    ])
    const result = await box.run(['ki', 'estate', 'converge', path, '--apply'])
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('skip acme/dirty (acme/dirty): tree has 1 uncommitted change(s)')
    expect(result.output).toContain(
      `skip acme/busy (acme/busy): busy: a process is working in ${home}/workspaces/old/busy/src`
    )
    expect(result.output).toContain(
      `skip acme/collide (acme/collide): target ${home}/workspaces/new/collide already exists`
    )
    expect(result.output).toContain(
      `skip acme/twin (acme/twin): several checkouts: ${home}/workspaces/old/twin-a, ${home}/workspaces/old/twin-b`
    )
    expect(result.output).toContain(
      `skip acme/one (acme/one): another manifest entry also targets ${home}/workspaces/new/shared`
    )
    expect(result.output).toContain(
      `skip acme/two (acme/two): another manifest entry also targets ${home}/workspaces/new/shared`
    )
    expect(result.output).toContain(
      'skip acme/keyed (acme/keyed): registry: local KI repository registry already holds key taken'
    )
    expect(result.output).toContain(
      `skip acme/pending (acme/pending): target ${home}/workspaces/new/occupied exists but is not a checkout of acme/pending`
    )
    expect(result.output).toContain(
      `skip acme/unplaced (acme/unplaced): the manifest gives no path_to for ${home}/workspaces/old/unplaced`
    )
    expect(result.output).toContain('absent acme/nowhere (acme/nowhere): no local checkout')
    expect(result.output).toContain('nothing to apply')
    expect(await box.home.read('workspaces/old/dirty/README.md')).toBe('changed\n')
    expect(await exists(join(home, 'workspaces/old/busy'))).toBe(true)

    const allowed = await box.run([
      'ki',
      'estate',
      'converge',
      path,
      '--apply',
      '--allow-busy',
      '~/workspaces/old/busy'
    ])
    expect(allowed.exitCode).toBe(0)
    expect(allowed.output).toContain('converge acme/busy (acme/busy)')
    expect(await exists(join(home, 'workspaces/new/busy/README.md'))).toBe(true)
  })

  test('discovers a checkout whose remote already names the renamed identity', async () => {
    const fixture = await estate()
    const { box, home, repository, manifest } = fixture
    await repository('workspaces/old/renamed', 'git@github.com:acme/after.git')
    await repository('workspaces/new/settled', 'git@github.com:acme/settled-before')
    const path = await manifest([
      {
        from: 'acme/before',
        to: 'acme/after',
        path_from: '~/workspaces/old/renamed',
        path_to: '~/workspaces/new/after'
      },
      { from: 'acme/settled-before', to: 'acme/settled', path_to: '~/workspaces/new/settled' }
    ])
    const result = await box.run(['ki', 'estate', 'converge', path, '--apply'])
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      `converge acme/after (acme/before)\n  move ${home}/workspaces/old/renamed -> ${home}/workspaces/new/after\n  worktree repair ${home}/workspaces/new/after\n  note: not in the ki registry`
    )
    expect(result.output).toContain(
      'converge acme/settled (acme/settled-before)\n  remote origin git@github.com:acme/settled-before -> git@github.com:acme/settled'
    )
    expect(await fixture.remote('workspaces/new/after')).toBe('git@github.com:acme/after.git')
    expect(await fixture.remote('workspaces/new/settled')).toBe('git@github.com:acme/settled')
    expect(result.output).toContain('sweep: 0 remaining occurrence(s), report only')
  })

  test('reports registered targets to clone and clones them only with --clone', async () => {
    const origin = await sandbox()
    await origin.root.git(['init', '-q', '--bare', 'origin.git'])
    const bare = join(await realpath(origin.root.path), 'origin.git')
    const fixture = await estate({
      runner: (command, arguments_, environment, limits) =>
        runCommand(
          command,
          arguments_.map((argument) => (argument === 'git@github.com:acme/fresh.git' ? bare : argument)),
          environment,
          limits
        )
    })
    const { box, home, manifest } = fixture
    const path = await manifest([{ from: 'acme/fresh', register: true, path_to: '~/workspaces/new/fresh' }])
    const preview = await box.run(['ki', 'estate', 'converge', path])
    expect(preview.output).toContain(`to clone acme/fresh (acme/fresh) -> ${home}/workspaces/new/fresh (use --clone)`)
    expect(preview.output).toContain('sweep: 0 remaining occurrence(s), report only')
    const cloned = await box.run(['ki', 'estate', 'converge', path, '--clone', '--apply'], {
      now: () => Date.UTC(2026, 0, 1)
    })
    expect(cloned.exitCode).toBe(0)
    expect(cloned.output).toContain(`  clone git@github.com:acme/fresh.git -> ${home}/workspaces/new/fresh`)
    expect(await exists(join(home, 'workspaces/new/fresh/.git'))).toBe(true)
    const log = join(box.state.path, 'ki/converge/2026-01-01T00-00-00-000Z.json')
    expect(JSON.parse(await readFile(log, 'utf8')).backups).toEqual([])
    const rollback = await box.run(['ki', 'estate', 'converge', '--rollback', log])
    expect(rollback.output).toContain(
      `  retain cloned checkout ${home}/workspaces/new/fresh; converge never deletes a repository`
    )
  })

  test('moves a registered checkout outside the workspaces tree', async () => {
    const fixture = await estate()
    const { box, home, repository, manifest, registry } = fixture
    await repository('.local/share/chezmoi', 'git@github.com:acme/dotfiles.git')
    await registry({ chezmoi: { repository: 'https://github.com/acme/dotfiles', path: '.local/share/chezmoi' } })
    const path = await manifest([{ from: 'acme/dotfiles', path_to: '~/dotfiles' }])
    const result = await box.run(['ki', 'estate', 'converge', path, '--apply'])
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      `registry chezmoi -> dotfiles: https://github.com/acme/dotfiles at ${home}/dotfiles`
    )
    expect(await exists(join(home, 'dotfiles/.git'))).toBe(true)
  })

  test('refuses a rollback whose recorded state has since changed', async () => {
    const setup = async () => {
      const fixture = await estate()
      await fixture.repository('workspaces/old/solo', 'git@github.com:acme/solo.git')
      await fixture.registry({ solo: { repository: 'https://github.com/acme/solo', path: 'workspaces/old/solo' } })
      await fixture.box.home.write(
        '.claude.json',
        `${JSON.stringify({ projects: { [join(fixture.home, 'workspaces/old/solo')]: {} } }, null, 2)}\n`
      )
      const path = await fixture.manifest([{ from: 'acme/solo', path_to: '~/workspaces/new/solo' }])
      await fixture.box.run(['ki', 'estate', 'converge', path, '--apply'], { now: () => 0 })
      expect(await fixture.box.home.read('.claude.json')).toMatch(/\}\n$/)
      return { ...fixture, log: join(fixture.box.state.path, 'ki/converge/1970-01-01T00-00-00-000Z.json') }
    }
    const occupied = await setup()
    await occupied.box.home.mkdir('workspaces/old/solo')
    const blocked = await occupied.box.run(['ki', 'estate', 'converge', '--rollback', occupied.log, '--apply'])
    expect(blocked.exitCode).toBe(1)
    expect(blocked.output).toContain(`ki: error: converge stopped; 3 action(s) recorded in`)
    expect(blocked.output).toContain(
      `${occupied.home}/workspaces/old/solo already exists; not moving ${occupied.home}/workspaces/new/solo`
    )

    const registry = await setup()
    await registry.box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\n')
    const changed = await registry.box.run(['ki', 'estate', 'converge', '--rollback', registry.log, '--apply'])
    expect(changed.output).toContain(
      `local KI repository registry no longer holds solo at ${registry.home}/workspaces/new/solo`
    )

    const claude = await setup()
    await claude.box.home.write('.claude.json', '{"projects":{}}')
    const missing = await claude.box.run(['ki', 'estate', 'converge', '--rollback', claude.log, '--apply'])
    expect(missing.output).toContain(
      `~/.claude.json cannot rename project ${claude.home}/workspaces/new/solo to ${claude.home}/workspaces/old/solo`
    )
  })

  test('reports Claude history it will not merge', async () => {
    const fixture = await estate()
    const { box, home, repository, manifest, session } = fixture
    await repository('workspaces/old/solo', 'git@github.com:acme/solo.git')
    await session(encoded(join(home, 'workspaces/old/solo')), 'workspaces/old/solo')
    await session(encoded(join(home, 'workspaces/new/solo')), 'workspaces/new/solo')
    await box.home.write(
      '.claude.json',
      JSON.stringify({ projects: { [join(home, 'workspaces/old/solo')]: {}, [join(home, 'workspaces/new/solo')]: {} } })
    )
    const path = await manifest([{ from: 'acme/solo', path_to: '~/workspaces/new/solo' }])
    const result = await box.run(['ki', 'estate', 'converge', path])
    expect(result.output).toContain(
      `  note: Claude folder ${home}/.claude/projects/${encoded(join(home, 'workspaces/new/solo'))} already exists; not merging ${encoded(join(home, 'workspaces/old/solo'))}`
    )
    expect(result.output).toContain(
      `  note: ~/.claude.json already holds project ${home}/workspaces/new/solo; not merging ${home}/workspaces/old/solo`
    )
  })

  test('sweeps configuration for remaining old paths and renamed identities without printing their lines', async () => {
    const fixture = await estate()
    const { box, home, repository, manifest } = fixture
    await repository('workspaces/old/solo', 'git@github.com:acme/solo.git')
    await box.home.write(
      '.local/share/chezmoi/dot_zshrc.tmpl',
      'export A={{ .chezmoi.homeDir }}/workspaces/old/solo/bin\nexport B=~/workspaces/old/solo-two\n'
    )
    await box.home.write('.local/share/chezmoi/.git/config', 'workspaces/old/solo\n')
    await box.home.write('.local/share/chezmoi/binary.dat', 'workspaces/old/solo\0')
    await box.home.write('.local/share/chezmoi/large.txt', `workspaces/old/solo\n${'x'.repeat(4 * 1024 * 1024)}`)
    await box.home.write('.claude/settings.json', '{"secret":"token","repo":"github.com/acme/solo.git"}\n')
    await box.home.write('.claude/plugins/known.json', '"acme/solo"\n')
    await box.home.write('.claude/plugins/notes.md', 'acme/solo\n')
    await box.home.write('.paperclip/instances/default/config.json', 'acme/solo-other acme/solo.github acme/solo.\n')
    await box.home.write('.mcporter/credentials.json', 'acme/solo\n')
    await box.home.mkdir('.local/share/ki/harnesses/acme/installed')
    await box.home.mkdir('.claude/skills')
    await symlink(join(home, 'workspaces/old/solo/skills/a'), join(home, '.claude/skills/a'))
    const path = await manifest([{ from: 'acme/solo', to: 'acme/solo-renamed', path_to: '~/workspaces/new/solo' }])
    const result = await box.run(['ki', 'estate', 'converge', path])
    expect(result.output).toContain(
      [
        'sweep: 5 remaining occurrence(s), report only',
        `  ${home}/.local/share/chezmoi/dot_zshrc.tmpl:1: workspaces/old/solo`,
        `  ${home}/.claude/settings.json:1: acme/solo`,
        `  ${home}/.claude/skills/a:0: workspaces/old/solo`,
        `  ${home}/.claude/plugins/known.json:1: acme/solo`,
        `  ${home}/.paperclip/instances/default/config.json:1: acme/solo`
      ].join('\n')
    )
    expect(result.output).not.toContain('token')
  })

  test('stops at a failing git step and records the actions already taken', async () => {
    const fixture = await estate({
      runner: async (command, arguments_, environment, limits) =>
        arguments_.includes('set-url')
          ? { exitCode: 128, output: 'remote locked\n' }
          : runCommand(command, arguments_, environment, limits)
    })
    const { box, home, repository, manifest } = fixture
    await repository('workspaces/old/solo', 'git@github.com:acme/solo.git')
    const path = await manifest([{ from: 'acme/solo', to: 'acme/solo-renamed', path_to: '~/workspaces/new/solo' }])
    const result = await box.run(['ki', 'estate', 'converge', path, '--apply'], { now: () => 0 })
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      `ki: error: converge stopped; 1 action(s) recorded in ${box.state.path}/ki/converge/1970-01-01T00-00-00-000Z.json: git remote set-url origin git@github.com:acme/solo-renamed.git failed in ${home}/workspaces/new/solo: remote locked`
    )
  })

  test('rejects invalid grammar, manifests, logs and a missing lsof', async () => {
    const box = await sandbox()
    const home = await realpath(box.home.path)
    expect((await box.run('ki estate converge')).output).toContain(
      'ki: error: ki estate converge requires exactly one manifest or --rollback <log>'
    )
    expect((await box.run('ki estate converge targets.json --rollback log.json')).exitCode).toBe(2)
    expect((await box.run('ki estate converge --rollback log.json --clone')).output).toContain(
      'ki: error: ki estate converge --rollback does not accept --clone or --allow-busy'
    )
    const invalid = async (content: string) => {
      await box.home.write('targets.json', content)
      return (await box.run(['ki', 'estate', 'converge', join(home, 'targets.json')])).output
    }
    expect(await invalid('{')).toContain(`estate targets ${home}/targets.json must be a readable JSON document`)
    expect(await invalid('[]')).toContain('estate targets must hold a repositories list')
    expect(await invalid('{"repositories":[1]}')).toContain('estate targets repositories[0] needs from')
    expect(await invalid('{"repositories":[{"from":"a/b","to":"Not Valid","path_to":"~/x"}]}')).toContain(
      'estate targets repositories[0] from and to must be GitHub owner/name identities'
    )
    expect(await invalid('{"repositories":[{"from":"a/b","to":"a/b","path_to":"relative/x"}]}')).toContain(
      'estate targets path relative/x must be absolute or start with ~/'
    )
    expect(await invalid('{"repositories":[{"from":"a/b","to":"a/b","register":true,"path_to":""}]}')).toContain(
      'estate targets repositories[0] needs path_to'
    )
    box.setRunner(async () => {
      throw new Error('spawn lsof ENOENT')
    })
    expect(await invalid('{"repositories":[{"from":"a/b","to":"a/b","path_to":"/tmp/x"}]}')).toContain(
      'lsof is required to detect processes working inside a checkout'
    )
    await box.home.write('log.json', '{')
    expect((await box.run(['ki', 'estate', 'converge', '--rollback', join(home, 'log.json')])).output).toContain(
      `converge log ${home}/log.json must be a readable JSON document`
    )
    await writeFile(join(home, 'log.json'), '{"schema":"other"}')
    expect((await box.run(['ki', 'estate', 'converge', '--rollback', join(home, 'log.json')])).output).toContain(
      `${home}/log.json is not a ki estate converge log`
    )
  })
})
