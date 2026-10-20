// `ki territory show` reports each island's declared maturity and its health, read from the
// latest whole-repository `ki repo audit` recorded on this machine under the `ki-repo`
// standard's decline rule; anything undeclared or unrecorded is unknown, never a guessed level.

import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

const CONFIGURATION = 'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n'
const OBSERVED = Date.parse('2026-10-20T07:00:00.000Z')

// A ki-repo catalogue whose one item reports the findings listed in the repository's
// `findings.json`, each as `[status, message, level?]`; a `broken` file makes its session
// invalid, so the audit cannot complete.
const RUBRIC = `
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export default {
  contract: 1,
  name: 'ki-repo',
  concern: 'island condition',
  createSession: async ({ repository }) => {
    if (existsSync(join(repository, 'broken'))) return {}
    return { subjects: [{ families: ['F'], context: () => ({ repository }) }], proposal: () => ({ writes: [] }) }
  },
  families: [{
    code: 'F',
    title: 'Family',
    description: 'Reports configured findings.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'EXAMPLE-1',
      title: 'Example',
      description: 'Reports configured findings.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        overrideLevels: ['WARN'],
        remediation: { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' },
        audit: {
          phase: 'PRIMARY',
          run: ({ repository }) => {
            const path = join(repository, 'findings.json')
            const findings = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
            return findings.map(([status, message, level]) => ({ status, message, ...(level ? { level } : {}) }))
          }
        }
      }
    }]
  }]
}
`

interface Island {
  readonly key: string
  readonly identity: string
  readonly root: string
  readonly kind: string
  readonly maturity: { readonly level: string | null; readonly declaration: string }
  readonly health: {
    readonly state: string
    readonly audit: string | null
    readonly observedAt: string | null
    readonly failures: number | null
    readonly warnings: number | null
  }
}

const UNKNOWN = { state: 'unknown', audit: null, observedAt: null, failures: null, warnings: null }

const fixture = async () => {
  const box = await sandbox()
  const capital = await box.project.mkdir('capital')
  const member = await box.project.mkdir('member')
  await box.project.write(
    'capital/.ki.toml',
    capitalConfiguration({ members: [home('example/capital'), home('example/member')] }).replace(
      'territory_name =',
      'territory_prefix = "ki"\nterritory_name ='
    )
  )
  await box.project.write('member/.ki.toml', memberConfiguration('example/member', { trades: false }))
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      `[repositories."capital"]\nrepository = "${home('example/capital')}"\npath = ${JSON.stringify(capital)}`,
      `[repositories."member"]\nrepository = "${home('example/member')}"\npath = ${JSON.stringify(member)}`
    ].join('\n')
  )
  await box.config.write('ki/config.toml', CONFIGURATION)
  await box.setupExampleHarness({ name: 'ki-repo', rubric: RUBRIC })
  return { box, capital, member }
}

const declare = (box: Sandbox, maturity: string): Promise<void> =>
  box.project.write(
    'member/.ki.toml',
    memberConfiguration('example/member', { trades: false }).replace(
      'repo_code = "TEST"',
      `repo_code = "TEST"\nmaturity = ${maturity}`
    )
  )

const findings = (box: Sandbox, values: readonly (readonly string[])[]): Promise<void> =>
  box.project.write('member/findings.json', JSON.stringify(values))

const audit = (box: Sandbox, member: string, ...args: string[]) =>
  box.run(['ki', 'repo', '--repo', member, 'audit', '--concise', ...args], { now: () => OBSERVED })

const islands = async (box: Sandbox): Promise<Record<string, Island>> => {
  const shown = await box.run('ki territory show -t ki --format json')
  expect(shown.exitCode).toBe(0)
  const report = JSON.parse(shown.stdout) as { readonly repositories: readonly Island[] }
  return Object.fromEntries(report.repositories.map((island) => [island.key, island]))
}

const health = async (box: Sandbox) => (await islands(box))['member']?.health

describe('[ki territory show island condition]', () => {
  test('publishes ki/territory/v1 with unknown maturity and health before any declaration or audit', async () => {
    const { box, capital, member } = await fixture()

    const shown = await box.run('ki territory show -t ki --format json')

    expect(shown.exitCode).toBe(0)
    expect(JSON.parse(shown.stdout)).toEqual({
      schema: 'ki/territory/v1',
      territory: { id: 'ki', title: 'Example territory' },
      repositories: [
        {
          key: 'capital',
          identity: 'example/capital',
          root: capital,
          kind: 'owner',
          maturity: { level: null, declaration: 'absent' },
          health: UNKNOWN
        },
        {
          key: 'member',
          identity: 'example/member',
          root: member,
          kind: 'member',
          maturity: { level: null, declaration: 'absent' },
          health: UNKNOWN
        }
      ],
      unregistered: []
    })
  })

  test('reads a declared level on the scale and reports any other value or declaration as unknown, never as a level', async () => {
    const { box } = await fixture()

    for (const level of ['founding', 'growing', 'settled', 'thriving']) {
      await declare(box, JSON.stringify(level))
      expect((await islands(box))['member']?.maturity).toEqual({ level, declaration: 'declared' })
    }
    for (const invalid of ['"ruined"', '3', '"Settled"']) {
      await declare(box, invalid)
      expect((await islands(box))['member']?.maturity).toEqual({ level: null, declaration: 'invalid' })
    }
    await box.project.write(
      'member/.ki.toml',
      memberConfiguration('example/member', { trades: false })
        .replace('harnesses = ["example/harness"]', 'harnesses = []')
        .replace('repo_code = "TEST"', 'repo_code = "TEST"\nmaturity = "settled"')
    )
    expect((await islands(box))['member']?.maturity).toEqual({ level: null, declaration: 'unreadable' })
  })

  test('derives health from the latest whole-repository audit under the four reader cases', async () => {
    const { box, member } = await fixture()

    await declare(box, '"settled"')
    expect((await audit(box, member)).exitCode).toBe(0)
    expect(await health(box)).toEqual({
      state: 'sound',
      audit: 'completed',
      observedAt: '2026-10-20T07:00:00.000Z',
      failures: 0,
      warnings: 0
    })
    expect((await islands(box))['capital']?.health).toEqual(UNKNOWN)

    await findings(box, [['VIOLATION', 'needs attention', 'WARN']])
    expect((await audit(box, member)).exitCode).toBe(0)
    expect(await health(box)).toMatchObject({ state: 'decline', failures: 0, warnings: 1 })

    await findings(box, [
      ['VIOLATION', 'broken'],
      ['VIOLATION', 'needs attention', 'WARN']
    ])
    expect((await audit(box, member)).exitCode).toBe(1)
    expect(await health(box)).toMatchObject({ state: 'ruin', audit: 'completed', failures: 1, warnings: 1 })

    await findings(box, [])
    expect((await audit(box, member)).exitCode).toBe(0)
    await box.project.write('member/broken', '')
    expect((await audit(box, member)).exitCode).not.toBe(0)
    expect(await health(box)).toEqual({
      state: 'ruin',
      audit: 'incomplete',
      observedAt: '2026-10-20T07:00:00.000Z',
      failures: null,
      warnings: null
    })
  })

  test('an undeclared island that otherwise passes reads its own warning, and a registration failure is a failure', async () => {
    const { box, member } = await fixture()

    await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')
    expect((await audit(box, member)).exitCode).toBe(1)
    expect(await health(box)).toMatchObject({ state: 'ruin', failures: 1, warnings: 0 })
  })

  test('a skill- or path-scoped audit records nothing, so the last whole-repository reading stands', async () => {
    const { box, member } = await fixture()

    expect((await audit(box, member)).exitCode).toBe(0)
    await findings(box, [['VIOLATION', 'broken']])
    expect((await audit(box, member, '--skill', 'ki-repo')).exitCode).toBe(1)
    expect((await audit(box, member, '--paths', 'findings.json')).exitCode).toBe(0)
    expect(await health(box)).toMatchObject({ state: 'sound', failures: 0 })
  })

  test('reads an unreadable or malformed audit record as unknown', async () => {
    const { box, member } = await fixture()
    const record = `ki/audit-health/${createHash('sha256').update(member).digest('hex')}.json`
    const valid = {
      schema: 'ki/audit-health-record/v1',
      repository: member,
      observedAt: '2026-10-20T07:00:00.000Z',
      audit: 'completed',
      failures: 0,
      warnings: 0
    }

    await box.state.write(record, `${JSON.stringify(valid)}\n`)
    expect(await health(box)).toMatchObject({ state: 'sound' })
    for (const malformed of [
      'not JSON',
      '[]',
      'null',
      JSON.stringify({ ...valid, schema: 'ki/audit-health-record/v2' }),
      JSON.stringify({ ...valid, repository: '/elsewhere' }),
      JSON.stringify({ ...valid, observedAt: 7 }),
      JSON.stringify({ ...valid, observedAt: 'yesterday' }),
      JSON.stringify({ ...valid, audit: 'partial' }),
      JSON.stringify({ ...valid, failures: -1 }),
      JSON.stringify({ ...valid, warnings: 1.5 })
    ]) {
      await box.state.write(record, malformed)
      expect(await health(box)).toEqual(UNKNOWN)
    }
  })

  test('renders maturity and health in the text view, with their evidence under --verbose', async () => {
    const { box, capital, member } = await fixture()

    await declare(box, '"growing"')
    await findings(box, [['VIOLATION', 'needs attention', 'WARN']])
    await audit(box, member)

    const shown = await box.run('ki territory show -t ki')
    expect(shown.exitCode).toBe(0)
    expect(shown.stdout).toBe(
      '╭─ KI TERRITORY\n├─ ki: Example territory\n│  ├─ capital · maturity unknown · health unknown\n│  ╰─ member · maturity growing · health in decline\n╰─ summary: REPOSITORIES=2\n'
    )

    const verbose = await box.run('ki territory show -t ki --verbose')
    expect(verbose.stdout).toContain(`│  │  ├─ ${capital}\n│  │  ├─ maturity: absent\n│  │  ╰─ audit: none recorded\n`)
    expect(verbose.stdout).toContain(
      `│     ├─ ${member}\n│     ├─ maturity: declared\n│     ╰─ audit: completed 2026-10-20T07:00:00.000Z FAIL=0 WARN=1\n`
    )

    await findings(box, [['VIOLATION', 'broken']])
    await audit(box, member)
    expect((await box.run('ki territory show -t ki')).stdout).toContain('member · maturity growing · health in ruin')
    await box.project.write('member/broken', '')
    await audit(box, member)
    expect((await box.run('ki territory show -t ki --verbose')).stdout).toContain(
      '╰─ audit: incomplete 2026-10-20T07:00:00.000Z\n'
    )
  })
})
