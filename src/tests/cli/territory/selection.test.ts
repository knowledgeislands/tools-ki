import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

const registry = async (box: Sandbox, entries: readonly { key: string; repository: string; path: string }[]) =>
  box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      ...entries.flatMap((entry) => [
        `[repositories.${JSON.stringify(entry.key)}]`,
        `repository = ${JSON.stringify(entry.repository)}`,
        `path = ${JSON.stringify(entry.path)}`
      ])
    ].join('\n')
  )
const fixture = async (prefix: string | null = 'ki') => {
  const box = await sandbox()
  const capital = await box.project.mkdir('Capital checkout')
  const member = await box.project.mkdir('nested/Tool [*]\nname')
  await box.project.write(
    'Capital checkout/.ki.toml',
    capitalConfiguration({ members: [home('example/capital'), home('example/member')] }).replace(
      'territory_name =',
      `${prefix === null ? '' : `territory_prefix = ${JSON.stringify(prefix)}\n`}territory_name =`
    )
  )
  await box.project.write('nested/Tool [*]\nname/.ki.toml', memberConfiguration('example/member', { trades: false }))
  const entries = [
    { key: 'capital-key', repository: home('example/capital'), path: capital },
    { key: 'member-key', repository: home('example/member'), path: member }
  ]
  await registry(box, entries)
  return { box, capital, member, entries }
}
const roots = (box: Sandbox, ...args: string[]) => box.run(['ki', 'territory', 'roots', '--null', ...args])
describe('territory selection', () => {
  test('selects by explicit prefix with deterministic atomic NUL roots and key-independent literal basename alternatives', async () => {
    const { box, capital, member } = await fixture()
    const selected = await roots(box, '-t', 'ki')
    expect(selected.exitCode).toBe(0)
    expect(selected.stdout).toBe(`${[capital, member].sort().join('\0')}\0`)
    expect((await roots(box, '-t', 'capital-key')).exitCode).toBe(2)
    for (const args of [
      ['--filter', 'Tool [*]'],
      ['--filter', 'Tool', '--filter', 'missing'],
      ['--filter', 'Tool', '--filter', 'Tool']
    ]) {
      expect((await roots(box, '-t', 'ki', ...args)).stdout).toBe(`${member}\0`)
    }
    expect((await roots(box, '--estate', '--filter', 'Capital')).stdout).toBe(`${capital}\0`)
    for (const prefix of ['tool', 'member-key', '*', '']) {
      const failed = await roots(box, '-t', 'ki', '--filter', prefix)
      expect(failed.exitCode).toBe(2)
      expect(failed.stdout).toBe('')
    }
    expect((await box.run(['ki', 'territory', 'roots', '-t', 'ki', '--filter', 'Capital'])).stdout).toBe(`${capital}\n`)
  })
  test('fallback follows the Capital registry key while explicit prefixes survive key changes', async () => {
    const { box, entries } = await fixture(null)
    expect((await roots(box, '-t', 'capital-key')).exitCode).toBe(0)
    await registry(
      box,
      entries.map((entry) => (entry.key === 'capital-key' ? { ...entry, key: 'renamed-capital' } : entry))
    )
    expect((await roots(box, '-t', 'capital-key')).exitCode).toBe(2)
    expect((await roots(box, '-t', 'renamed-capital')).exitCode).toBe(0)
    await box.project.write(
      'Capital checkout/.ki.toml',
      capitalConfiguration({ members: entries.map((entry) => entry.repository) }).replace(
        'territory_name =',
        'territory_prefix = "ki"\nterritory_name ='
      )
    )
    expect((await roots(box, '-t', 'ki')).exitCode).toBe(0)
    expect((await roots(box, '-t', 'renamed-capital')).exitCode).toBe(2)
  })
  test('lists the resolvable roots and warns of each member it cannot resolve, after filtering', async () => {
    const { box, capital, entries, member } = await fixture()
    await registry(box, entries.slice(0, 1))
    const unregistered = await roots(box, '-t', 'ki')
    expect(unregistered.exitCode).toBe(0)
    expect(unregistered.stdout).toBe(`${capital}\0`)
    expect(unregistered.stderr).toBe(
      `ki: warning: territory ki member ${home('example/member')} is not registered; register its checkout with ki registry add, or drop it from territory_members if it was archived or deleted\n`
    )
    expect((await roots(box, '-t', 'ki', '--filter', 'Capital')).stderr).toBe('')
    const onlyAbsent = await roots(box, '-t', 'ki', '--filter', 'member')
    expect(onlyAbsent.exitCode).toBe(0)
    expect(onlyAbsent.stdout).toBe('')
    await registry(box, entries)
    await rm(member, { recursive: true })
    expect((await roots(box, '-t', 'ki', '--filter', 'Capital')).stderr).toBe('')
    expect((await roots(box, '--estate', '--filter', 'Capital')).exitCode).toBe(0)
    const gone = await roots(box, '-t', 'ki')
    expect(gone.exitCode).toBe(0)
    expect(gone.stdout).toBe(`${capital}\0`)
    expect(gone.stderr).toBe(
      `ki: warning: territory ki member ${home('example/member')} has no checkout at ${member}, its registered path; clone it there again, or remove member-key with ki registry remove\n`
    )
    expect((await roots(box, '--estate')).stderr).toContain('has no checkout at')
    // Selections that read repositories rather than list them stay strict.
    expect((await box.run(['ki', 'repo', 'audit', '-t', 'ki'])).stderr).toContain('physical directory')
  })
  test('show and audit name each unregistered member, check the rest and exit 1', async () => {
    const { box, entries } = await fixture()
    await registry(box, entries.slice(0, 1))
    const member = home('example/member')

    const show = await box.run(['ki', 'territory', 'show', '-t', 'ki'])
    expect(show.exitCode).toBe(1)
    expect(show.stdout).toBe(
      `╭─ KI TERRITORY\n├─ ki: Example territory\n│  ╰─ capital-key · maturity unknown · health unknown\n├─ unregistered\n│  ╰─ ${member}\n╰─ summary: REPOSITORIES=1 UNREGISTERED=1\n`
    )
    const audit = await box.run(['ki', 'territory', 'audit', '-t', 'ki'])
    expect(audit.exitCode).toBe(1)
    expect(audit.stdout).toBe(
      `╭─ KI TERRITORY AUDIT\n├─ ki: incomplete\n│  ╰─ ✗ member ${member} is not registered; register its checkout with ki registry add, or drop it from territory_members if it was archived or deleted\n╰─ summary: REPOSITORIES=1 FINDINGS=1\n`
    )
    const onlyMissing = await box.run(['ki', 'territory', 'show', '-t', 'ki', '--filter', 'member'])
    expect(onlyMissing.exitCode).toBe(1)
    expect(onlyMissing.stdout).toContain('summary: REPOSITORIES=0 UNREGISTERED=1')
    const filteredOut = await box.run(['ki', 'territory', 'audit', '-t', 'ki', '--filter', 'Capital'])
    expect(filteredOut.exitCode).toBe(0)
    expect(filteredOut.stdout).toContain('ki: healthy')
    expect((await box.run(['ki', 'territory', 'audit', '-t', 'ki', '--filter', 'none'])).exitCode).toBe(2)
    expect((await box.run(['ki', 'repo', 'audit', '-t', 'ki'])).stderr).toContain('is not registered')
  })
  test('show and audit tell a renamed member, a gone checkout and an unregistered one apart', async () => {
    const { box, capital, entries, member } = await fixture()
    // The Capital lists the new name and an archived member; the registry still holds the old name.
    await box.project.write(
      'Capital checkout/.ki.toml',
      capitalConfiguration({
        members: [home('example/archived'), home('example/capital'), home('example/gone'), home('example/renamed')]
      }).replace('territory_name =', 'territory_prefix = "ki"\nterritory_name =')
    )
    await box.project.write('nested/Tool [*]\nname/.ki.toml', memberConfiguration('example/renamed'))
    const gone = join(box.project.path, 'gone')
    await registry(box, [...entries, { key: 'gone-key', repository: home('example/gone'), path: gone }])
    const show = await box.run(['ki', 'territory', 'show', '-t', 'ki'])
    expect(show.exitCode).toBe(1)
    expect(show.stdout).toBe(
      `╭─ KI TERRITORY\n├─ ki: Example territory\n│  ╰─ capital-key · maturity unknown · health unknown\n├─ unregistered\n│  ╰─ ${home('example/archived')}\n├─ renamed\n│  ╰─ ${home('example/renamed')}\n├─ missing\n│  ╰─ ${home('example/gone')}\n╰─ summary: REPOSITORIES=1 UNREGISTERED=1 RENAMED=1 MISSING=1\n`
    )
    const report = JSON.parse((await box.run(['ki', 'territory', 'show', '-t', 'ki', '--format', 'json'])).stdout)
    expect(report.unregistered).toEqual([home('example/archived')])
    expect(report.absent).toEqual([
      { identity: home('example/archived'), condition: 'unregistered' },
      { identity: home('example/gone'), condition: 'missing', key: 'gone-key', path: gone },
      {
        identity: home('example/renamed'),
        condition: 'renamed',
        key: 'member-key',
        path: member,
        declared: home('example/member')
      }
    ])
    const audit = await box.run(['ki', 'territory', 'audit', '-t', 'ki'])
    expect(audit.exitCode).toBe(1)
    expect(audit.stdout).toContain('ki: incomplete')
    expect(audit.stdout).toContain(
      `✗ member ${home('example/renamed')} was renamed: member-key at ${member} goes by ${home('example/member')}`
    )
    expect(audit.stdout).toContain(`✗ member ${home('example/gone')} has no checkout at ${gone}`)
    expect(audit.stdout).toContain('summary: REPOSITORIES=1 FINDINGS=3')
    const listed = await roots(box, '-t', 'ki')
    expect(listed.exitCode).toBe(0)
    expect(listed.stdout).toBe(`${capital}\0`)
    expect(listed.stderr.match(/ki: warning: /g)).toHaveLength(3)
  })
  test('rejects ambiguous registry identities, duplicate handles, malformed Capitals and checkout disagreement', async () => {
    const { box, capital, entries, member } = await fixture()
    await registry(box, [
      ...entries,
      { ...(entries[1] as (typeof entries)[number]), key: 'duplicate', path: join(box.project.path, 'other') }
    ])
    expect((await roots(box, '-t', 'ki')).exitCode).toBe(1)
    await registry(box, entries)
    const other = await box.project.mkdir('other')
    await box.project.write(
      'other/.ki.toml',
      capitalConfiguration({ identity: 'example/other' }).replace(
        'territory_name =',
        'territory_prefix = "ki"\nterritory_name ='
      )
    )
    await registry(box, [...entries, { key: 'other', repository: home('example/other'), path: other }])
    expect((await roots(box, '-t', 'ki')).stderr).toContain('declared more than once')
    await box.project.write('other/.ki.toml', capitalConfiguration({ identity: 'example/other' }))
    await registry(box, [...entries, { key: 'ki', repository: home('example/other'), path: other }])
    const collision = await roots(box, '-t', 'ki')
    expect(collision.stdout).toBe('')
    expect(collision.stderr).toContain('territory handle ki is declared more than once')
    await registry(box, entries)
    await box.project.write('nested/Tool [*]\nname/.ki.toml', '[not valid TOML\n')
    const malformed = await roots(box, '-t', 'ki')
    expect(malformed.stdout).toBe(`${capital}\0`)
    expect(malformed.stderr).toContain(`cannot be read at ${member}: member-key: `)
    expect(malformed.stderr).toContain('must be available and valid TOML')
    expect((await roots(box, '-t', 'ki', '--filter', 'Capital')).stderr).toBe('')
    expect((await box.run(['ki', 'repo', 'audit', '-t', 'ki'])).stderr).toContain('must be available and valid TOML')
    await box.project.write(
      'nested/Tool [*]\nname/.ki.toml',
      memberConfiguration('example/member', { capital: home('example/other') })
    )
    expect((await roots(box, '-t', 'ki')).stderr).toContain(
      `member ${home('example/member')} names Capital ${home('example/other')} in ${member}; move it to that territory's territory_members or correct its capital`
    )
    expect((await box.run(['ki', 'repo', 'audit', '-t', 'ki'])).stderr).toContain('differs from territory')
    await box.project.write('nested/Tool [*]\nname/.ki.toml', memberConfiguration('example/renamed'))
    expect((await roots(box, '-t', 'ki')).stderr).toContain(
      `member ${home('example/member')} was renamed: member-key at ${member} goes by ${home('example/renamed')}; bring territory_members, the registry and its .ki.toml to one name`
    )
    expect((await box.run(['ki', 'repo', 'audit', '-t', 'ki'])).stderr).toContain('differs from registered')
    await box.project.write(
      'Capital checkout/.ki.toml',
      capitalConfiguration().replace('territory_name =', 'territory_prefix = "Bad"\nterritory_name =')
    )
    expect((await roots(box, '-t', 'ki')).stderr).toContain('lower-case hyphenated')
  })
  test('rejects invalid grammar and ignored selectors; filter alone narrows native default', async () => {
    const { box } = await fixture()
    for (const args of [[], ['-t', 'ki', '--estate'], ['team'], ['--agora', 'team']]) {
      expect((await roots(box, ...args)).exitCode).toBe(2)
    }
    for (const args of [
      ['ki', 'agora', 'list'],
      ['ki', 'registry', '-t', 'ki', 'list'],
      ['ki', 'registry', '--filter', 'Capital', 'remove', 'capital-key'],
      ['ki', 'repo', '--filter', 'Capital', 'init'],
      ['ki', 'repo', '-t', 'ki', '--estate', 'roadmap', 'list'],
      ['ki', 'repo', '-t', 'ki', '--repo', '.', 'roadmap', 'list']
    ])
      expect((await box.run(args)).exitCode).toBe(2)
    await box.project.write(
      '.ki.toml',
      `${memberConfiguration('example/default')}\n[skills.ki-work]\nadapter = "roadmap"\n[skills.ki-work-roadmap]\n`
    )
    expect((await box.run('ki repo --filter project roadmap list')).exitCode).toBe(0)
    expect((await box.run('ki repo --filter absent roadmap list')).exitCode).toBe(2)
  })
  test('refuses the removed -f short form, naming --filter and running nothing', async () => {
    const { box } = await fixture()
    for (const [args, command] of [
      [['ki', 'territory', 'roots', '--estate', '-f', 'Capital'], 'ki territory roots'],
      [['ki', 'territory', 'roots', '--estate', '-fCapital'], 'ki territory roots'],
      [['ki', 'territory', 'inspect', '-f', 'Capital', '--target', 'zed', '--workspace', 'x'], 'ki territory inspect'],
      [['ki', 'registry', '-f', 'Capital', 'list'], 'ki registry'],
      [['ki', 'repo', '-f', 'Capital', 'roadmap', 'list'], 'ki repo'],
      [['ki', 'repo', 'roadmap', 'list', '-f', 'Capital'], 'ki repo roadmap list']
    ] as const) {
      const refused = await box.run([...args])
      expect(refused.exitCode).toBe(2)
      expect(refused.stdout).toBe('')
      expect(refused.stderr).toContain(
        `ki: error: option '-f' has been removed from '${command}'; use --filter <prefix>\n`
      )
    }
    expect((await box.run('ki territory roots --estate -h')).output).not.toContain('-f,')
  })
})

test('opens, shows, discovers and audits selected territory roots through existing local adapters', async () => {
  const { box, capital, member } = await fixture()
  expect((await box.run('ki territory list')).output).toContain(
    'ki: Example territory (Capital: capital-key, members: 2)'
  )
  expect((await box.run('ki territory show -t ki --verbose')).output).toContain(member)
  expect((await box.run('ki territory show --estate')).output).toContain('estate: Registered estate')
  expect((await box.run('ki territory audit -t ki')).output).toContain('FINDINGS=0')
  const calls: { command: string; args: readonly string[] }[] = []
  box.setRunner(async (command, args) => {
    calls.push({ command, args })
    return { exitCode: 0, output: '' }
  })
  expect((await box.run('ki territory open -t ki --target zed')).exitCode).toBe(0)
  expect(calls.map((call) => call.args)).toEqual([['-n'], ['-e', member], ['-e', capital]])
  calls.length = 0
  expect((await box.run('ki territory open -t ki --filter Tool --target zed')).exitCode).toBe(0)
  expect(calls.map((call) => call.args)).toEqual([['-n'], ['-e', member]])
  expect((await box.run('ki territory open --estate --target vscode')).exitCode).toBe(0)
  expect((await box.run('ki territory open --estate --target delta')).exitCode).toBe(0)
  box.setRunner(async () => ({ exitCode: 7, output: 'launch failed' }))
  expect((await box.run('ki territory open -t ki --target vscode')).stderr).toContain('launch failed')
  box.setRunner(async () => ({ exitCode: 3, output: '' }))
  expect((await box.run('ki territory open -t ki --target zed')).exitCode).toBe(3)
  const empty = await sandbox()
  expect((await empty.run('ki territory list')).exitCode).toBe(0)
  expect((await roots(empty, '--estate')).exitCode).toBe(2)
})

test('filters native mGit logical directory names before nested checkout validation and expansion', async () => {
  const box = await sandbox()
  await box.project.write(
    '.mgit.toml',
    'kind = "workspace"\n[members.Tool]\nkind = "repository"\ntype = "nested"\n[members.excluded]\nkind = "repository"\ntype = "standard"\n'
  )
  await box.project.write(
    'Tool/main/.ki.toml',
    `${memberConfiguration('example/tool')}\n[skills.ki-work]\nadapter = "roadmap"\n[skills.ki-work-roadmap]\n`
  )
  const selected = await box.run('ki repo --filter Tool roadmap list')
  expect(selected.exitCode).toBe(0)
  expect(selected.stdout).toContain('/Tool/main)')
  expect((await box.run('ki repo --filter main roadmap list')).exitCode).toBe(2)
  expect((await box.run('ki repo roadmap list')).exitCode).toBe(2)
})

test('filters explicit roots and rejects empty territory handles without changing defaults', async () => {
  const { box, capital } = await fixture()
  box.setRunner(async () => ({ exitCode: 0, output: '' }))
  expect(
    (
      await box.run([
        'ki',
        'repo',
        '--repo',
        capital,
        '--repo',
        'missing',
        '--filter',
        'Capital',
        'open',
        '--target',
        'vscode',
        '--no-stores'
      ])
    ).exitCode
  ).toBe(0)
  expect((await box.run(['ki', 'repo', '-t', '', 'roadmap', 'list'])).exitCode).toBe(2)
  expect((await box.run(['ki', 'repo', '--repo', capital, '--filter', 'absent', 'roadmap', 'list'])).exitCode).toBe(2)
  // Pattern matches are narrowed before validation, so the non-KI `nested` directory is never inspected.
  const opened: (readonly string[])[] = []
  box.setRunner(async (_command, args) => {
    opened.push(args)
    return { exitCode: 0, output: '' }
  })
  const open = (...args: string[]) => box.run(['ki', 'repo', ...args, 'open', '--target', 'vscode', '--no-stores'])
  expect((await open('--repo', '*')).exitCode).toBe(2)
  expect((await open('--repo', '*', '--filter', 'Capital')).exitCode).toBe(0)
  box.cd('Capital checkout')
  expect((await open('--repo', '.', '--filter', 'Capital')).exitCode).toBe(0)
  expect(opened).toEqual([
    ['--new-window', capital],
    ['--new-window', capital]
  ])
})
