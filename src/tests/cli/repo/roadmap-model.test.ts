import { mkdir, realpath, rm } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'
import { capitalHome, home } from '../_territory_helper.ts'

type Box = Awaited<ReturnType<typeof sandbox>>

const NOW = Date.parse('2026-10-07T12:00:00Z')

const declaration = (repository?: string, capital?: string, components?: readonly string[]): string =>
  [
    '[repo]',
    'harnesses = ["example/harness"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-work]',
    'adapter = "roadmap"',
    '',
    '[skills.ki-work-roadmap]',
    ...(components ? [`components = ${JSON.stringify(components)}`] : []),
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    ...(repository ? [`repository = ${JSON.stringify(repository)}`] : []),
    ...(capital ? [`capital = ${JSON.stringify(capital)}`] : []),
    ''
  ].join('\n')

const record = (
  fields: Readonly<Record<string, string | undefined>> = {},
  body = '## Context\n\nTest item.\n'
): string => {
  const values = {
    id: 'KI-TOOL-CLI-003',
    title: 'Model item',
    kind: 'deliver',
    horizon: 'next',
    status: 'draft',
    blocks: '[]',
    blocked_by: '[]',
    baseline_ref: 'null',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...fields
  }
  return `---\n${Object.entries(values)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}:${value.startsWith('\n') ? value : ` ${value}`}`)
    .join('\n')}\n---\n\n${body}`
}

const registryFile = (
  entries: readonly { readonly key: string; readonly repository: string; readonly path: string }[]
) =>
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

const projectNote = (slug: string, initiative?: string): string =>
  `---\nnote_type: streams/project\nslug: ${slug}\n${initiative ? `initiative: ${initiative}\n` : ''}---\n\n# ${slug}\n`

const initiativeNote = (slug: string): string => `---\nnote_type: streams/initiative\nslug: ${slug}\n---\n\n# ${slug}\n`

/** A member repository and its Capital, with the Capital's Project registry and a local ki registry naming both. */
const territory = async (box: Box): Promise<{ readonly member: string; readonly capital: string }> => {
  await box.project.write('member/.ki.toml', declaration(home('example/member'), capitalHome))
  await box.project.write('capital/.ki.toml', declaration(capitalHome, capitalHome))
  await box.project.write('capital/Streams/Projects/alpha.md', projectNote('alpha', 'init-one'))
  await box.project.write('capital/Streams/Projects/beta.md', projectNote('beta'))
  await box.project.write('capital/Streams/Projects/Projects.md', projectNote('indexed', 'init-one'))
  await box.project.write('capital/Streams/Initiatives/init-one.md', initiativeNote('init-one'))
  await box.project.write('capital/Streams/Initiatives/init-two.md', initiativeNote('init-two'))
  await box.project.write('capital/Streams/Initiatives/Initiatives.md', initiativeNote('indexed'))
  await box.project.write('capital/Streams/Initiatives/bad.md', initiativeNote('Bad Slug'))
  await box.project.write('capital/Streams/Initiatives/project.md', projectNote('stray', 'init-one'))
  await box.project.write('capital/Streams/Initiatives/bare.md', '# No frontmatter\n')
  await box.project.write('capital/Streams/Projects/Loose.md', '---\ninitiatives: none\n---\n')
  await box.project.write('capital/Streams/Projects/other.md', '---\nnote_type: streams/other\nslug: other\n---\n')
  await box.project.write(
    'capital/Streams/Projects/bad-slug.md',
    '---\nnote_type: streams/project\nslug: Bad Slug\n---\n'
  )
  await box.project.write('capital/Streams/Projects/bare.md', '# No frontmatter\n')
  await box.project.write('capital/Streams/Projects/broken.md', '---\nslug: [unclosed\n---\n')
  await box.project.write('capital/Streams/Projects/listed.md', '---\n- one\n---\n')
  await box.project.write('capital/Streams/Projects/notes.txt', 'not a project\n')
  await mkdir(`${box.project.path}/capital/Streams/Projects/archive.md`, { recursive: true })
  const member = await realpath(`${box.project.path}/member`)
  const capital = await realpath(`${box.project.path}/capital`)
  await box.state.write(
    'ki/registry.toml',
    registryFile([
      { key: 'member', repository: home('example/member'), path: member },
      { key: 'capital', repository: capitalHome, path: capital }
    ])
  )
  return { member, capital }
}

const roadmapFile = (box: Box, repository: string, id: string, contents: string) =>
  box.project.write(`${repository}/docs/roadmap/${id}-item.md`, contents)

describe('[ki repo roadmap] model fields', () => {
  test('reads classification, hold and resolution fields and projects them in JSON', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration(home('example/repo'), undefined, ['cli', 'repo']))
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-003',
      record({
        kind: 'deliver',
        purpose: 'capability',
        project: 'alpha',
        initiative: 'init-one',
        component: 'cli',
        horizon: 'hold',
        hold: '\n  reason: waiting-for\n  condition: "The harness release"\n  review: "2026-11-01"\n  trades: [TRD-0000000a]'
      })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-004',
      record({
        id: 'KI-TOOL-CLI-004',
        horizon: undefined,
        status: 'cancelled',
        resolution: 'duplicate',
        resolution_target: 'KI-TOOL-CLI-003'
      })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-005',
      record({ id: 'KI-TOOL-CLI-005', theme: 'cli', status: 'in-progress', waiting_on_trades: '[TRD-0000000b]' })
    )

    const result = await box.run('ki repo --repo repo roadmap list --format json')
    const report = JSON.parse(result.output)

    expect(result.exitCode).toBe(0)
    expect(report.schema).toBe('ki/roadmap/v1')
    const byId = Object.fromEntries(report.items.map((entry: { id: string }) => [entry.id, entry]))
    expect(byId['KI-TOOL-CLI-003']).toMatchObject({
      horizon: 'hold',
      lane: 'hold',
      kind: 'deliver',
      purpose: 'capability',
      project: 'alpha',
      initiative: 'init-one',
      component: 'cli',
      hold: { reason: 'waiting-for', condition: 'The harness release', review: '2026-11-01', trades: ['TRD-0000000a'] },
      legacy: []
    })
    expect(byId['KI-TOOL-CLI-004']).toMatchObject({
      horizon: null,
      lane: 'cancelled',
      resolution: 'duplicate',
      resolutionTarget: 'KI-TOOL-CLI-003'
    })
    expect(byId['KI-TOOL-CLI-005']).toMatchObject({
      theme: 'cli',
      legacy: ['theme', 'waiting_on_trades', 'in-progress at next']
    })
  })

  test('rejects invalid new-shape values while tolerating legacy shapes', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration(home('example/repo')))
    const cases: readonly [string, Readonly<Record<string, string | undefined>>, string][] = [
      ['kind', { kind: 'build' }, 'kind must be one of deliver, decide, investigate, audit'],
      ['purpose', { purpose: 'fun' }, 'purpose must be one of capability'],
      ['project', { project: 'Not_A_Slug' }, 'project must be a lowercase kebab-case slug'],
      [
        'over-qualified project',
        { project: 'one/two/three' },
        'project must be a lowercase kebab-case slug, optionally qualified as <territory>/<slug>'
      ],
      ['qualified component', { component: 'one/two' }, 'component must be a lowercase kebab-case slug'],
      [
        'undeclared component',
        { component: 'web' },
        'component web must be declared in [skills.ki-work-roadmap].components'
      ],
      ['horizon at triage', { status: 'triage' }, 'must omit horizon at status triage'],
      [
        'horizon at cancelled',
        { status: 'cancelled', resolution: 'obsolete' },
        'must omit horizon at status cancelled'
      ],
      ['missing horizon', { horizon: undefined }, 'must declare a horizon at status draft'],
      ['hold without mapping', { horizon: 'hold' }, 'must carry a hold mapping exactly when its horizon is hold'],
      [
        'mapping without hold',
        { hold: '\n  reason: parked\n  condition: Later' },
        'must carry a hold mapping exactly when its horizon is hold'
      ],
      ['scalar hold', { horizon: 'hold', hold: 'parked' }, 'hold must be a mapping with reason and condition'],
      ['list hold', { horizon: 'hold', hold: '\n  - parked' }, 'hold must be a mapping with reason and condition'],
      [
        'broken hold',
        { horizon: 'hold', hold: '\n  reason: [parked' },
        'hold must be a mapping with reason and condition'
      ],
      [
        'extra hold key',
        { horizon: 'hold', hold: '\n  reason: parked\n  condition: Later\n  owner: me' },
        'hold may contain only reason, condition, review and trades'
      ],
      ['hold reason', { horizon: 'hold', hold: '\n  reason: bored\n  condition: Later' }, 'hold.reason must be one of'],
      [
        'hold condition',
        { horizon: 'hold', hold: '\n  reason: parked\n  condition: "  "' },
        'hold.condition must name the release condition'
      ],
      [
        'hold review',
        { horizon: 'hold', hold: '\n  reason: parked\n  condition: Later\n  review: soon' },
        'hold.review must be an ISO date'
      ],
      [
        'hold trades',
        { horizon: 'hold', hold: '\n  reason: parked\n  condition: Later\n  trades: [TRD-0000000a, TRD-0000000a]' },
        'hold.trades must list unique TRD identities'
      ],
      [
        'hold trade shape',
        { horizon: 'hold', hold: '\n  reason: parked\n  condition: Later\n  trades: TRD-0000000a' },
        'hold.trades must list unique TRD identities'
      ],
      ['missing resolution', { horizon: undefined, status: 'cancelled' }, 'must carry a resolution exactly when'],
      ['open resolution', { resolution: 'obsolete' }, 'must carry a resolution exactly when'],
      [
        'unknown resolution',
        { horizon: undefined, status: 'cancelled', resolution: 'abandoned' },
        'resolution must be one of'
      ],
      [
        'missing target',
        { horizon: undefined, status: 'cancelled', resolution: 'merged' },
        'resolution merged requires resolution_target'
      ],
      [
        'forbidden target',
        { horizon: undefined, status: 'cancelled', resolution: 'rejected', resolution_target: 'KI-TOOL-CLI-004' },
        'resolution rejected forbids resolution_target'
      ],
      [
        'self target',
        { horizon: undefined, status: 'cancelled', resolution: 'superseded', resolution_target: 'KI-TOOL-CLI-003' },
        'resolution_target must be another canonical work-item identifier'
      ],
      [
        'malformed target',
        { horizon: undefined, status: 'cancelled', resolution: 'superseded', resolution_target: 'later' },
        'resolution_target must be another canonical work-item identifier'
      ]
    ]
    for (const [name, fields, message] of cases) {
      await roadmapFile(box, 'repo', 'KI-TOOL-CLI-003', record(fields))
      const result = await box.run('ki repo --repo repo roadmap list')
      expect(result.exitCode, name).toBe(1)
      expect(result.output, name).toContain(message)
    }

    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-003',
      record({ status: 'done', horizon: 'triage', intake_disposition: 'rejected' })
    )
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-004', record({ id: 'KI-TOOL-CLI-004', status: 'done' }))
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-005',
      record({ id: 'KI-TOOL-CLI-005', horizon: 'parked', kind: undefined })
    )
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-006', record({ id: 'KI-TOOL-CLI-006', kind: undefined }))
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-007',
      record({ id: 'KI-TOOL-CLI-007', horizon: undefined, status: 'triage', kind: undefined })
    )
    const legacy = await box.run('ki repo --repo repo roadmap list --format json')
    expect(legacy.exitCode).toBe(0)
    expect(JSON.parse(legacy.output).items.map((entry: { legacy: string[] }) => entry.legacy)).toEqual([
      ['horizon triage', 'intake_disposition'],
      ['horizon on done'],
      ['horizon parked'],
      ['missing kind'],
      []
    ])
    const filtered = await box.run('ki repo --repo repo roadmap list --horizon hold')
    expect(filtered.output).toContain('KI-TOOL-CLI-005 [draft] Model item · legacy')
    expect(filtered.output).not.toContain('KI-TOOL-CLI-004')
    const done = await box.run('ki repo --repo repo roadmap list --status done')
    expect(done.output).toContain('done (2)')
  })

  test('rejects a component vocabulary that is not a list of unique kebab-case names', async () => {
    const box = await sandbox()
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-003', record())
    for (const components of ['"cli"', '["cli", "cli"]', '["Not A Slug"]', '[7]']) {
      await box.project.write(
        'repo/.ki.toml',
        declaration(home('example/repo')).replace(
          '[skills.ki-work-roadmap]\n',
          `[skills.ki-work-roadmap]\ncomponents = ${components}\n`
        )
      )
      const result = await box.run('ki repo --repo repo roadmap list')
      expect(result.output, components).toContain(
        '[skills.ki-work-roadmap].components must list unique lowercase kebab-case names'
      )
    }
  })
})

const withAreas = (areas: string): string =>
  declaration(home('example/repo')).replace(
    '[skills.ki-work-roadmap]\n',
    `[skills.ki-work-roadmap]\nareas = ${areas}\n`
  )

describe('[ki repo roadmap] areas', () => {
  test('reads area titles from the map form and groups by area', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', withAreas('{ CLI = "Command line", OPS = "Operations", OLD = "Retired" }'))
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', area: 'CLI' }))
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-002', record({ id: 'KI-TOOL-CLI-002', area: 'CLI' }))
    await roadmapFile(box, 'repo', 'KI-TOOL-OPS-003', record({ id: 'KI-TOOL-OPS-003', area: 'OPS' }))
    await roadmapFile(box, 'repo', 'KI-TOOL-NEW-004', record({ id: 'KI-TOOL-NEW-004', area: 'NEW' }))
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-005', record({ id: 'KI-TOOL-CLI-005' }))

    const json = JSON.parse((await box.run('ki repo --repo repo roadmap list --format json')).output)
    const byArea = await box.run('ki repo --repo repo roadmap list --by area')

    expect(
      Object.fromEntries(
        json.items.map((entry: { id: string; areaTitle: string | null }) => [entry.id, entry.areaTitle])
      )
    ).toEqual({
      'KI-TOOL-CLI-001': 'Command line',
      'KI-TOOL-CLI-002': 'Command line',
      'KI-TOOL-OPS-003': 'Operations',
      'KI-TOOL-NEW-004': null,
      'KI-TOOL-CLI-005': null
    })
    expect(byArea.exitCode).toBe(0)
    const output = byArea.output
    expect(output).toContain('area CLI: Command line (2)')
    expect(output).toContain('area OPS: Operations (1)')
    expect(output).toContain('area NEW (1)')
    expect(output.indexOf('area OPS: Operations (1)')).toBeLessThan(output.indexOf('unassigned (1)'))
    expect(output).not.toContain('warnings')
  })

  test('reads a legacy bare list without titles', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', withAreas('["CLI"]'))
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', area: 'CLI' }))

    const json = JSON.parse((await box.run('ki repo --repo repo roadmap list --format json')).output)
    const byArea = await box.run('ki repo --repo repo roadmap list --by area')

    expect(json.items[0]).toMatchObject({ area: 'CLI', areaTitle: null })
    expect(byArea.output).toContain('area CLI (1)')
  })

  test('rejects areas that do not map uppercase codes to titles', async () => {
    const box = await sandbox()
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-003', record())
    for (const areas of ['"CLI"', '["cli"]', '["CLI", "CLI"]', '[7]', '{ CLI = 7 }', '{ cli = "Command line" }']) {
      await box.project.write('repo/.ki.toml', withAreas(areas))
      const result = await box.run('ki repo --repo repo roadmap list')
      expect(result.output, areas).toContain('[skills.ki-work-roadmap].areas must map uppercase area codes to titles')
    }
  })
})

describe('[ki repo roadmap list --by]', () => {
  test('groups by Project and by registry Initiative with warnings that never fail the listing', async () => {
    const box = await sandbox()
    await territory(box)
    const items: readonly Readonly<Record<string, string | undefined>>[] = [
      { id: 'KI-TOOL-CLI-001', project: 'alpha' },
      { id: 'KI-TOOL-CLI-002', project: 'beta' },
      { id: 'KI-TOOL-CLI-003', project: 'gamma', initiative: 'init-two' },
      { id: 'KI-TOOL-CLI-004', project: 'gamma' },
      { id: 'KI-TOOL-CLI-005', initiative: 'init-one' },
      { id: 'KI-TOOL-CLI-006', initiative: 'ghost' },
      { id: 'KI-TOOL-CLI-007', project: 'alpha', initiative: 'init-two' },
      { id: 'KI-TOOL-CLI-008', horizon: 'now' },
      { id: 'KI-TOOL-CLI-009', project: 'alpha', initiative: 'init-one', horizon: undefined, status: 'done' }
    ]
    for (const fields of items) await roadmapFile(box, 'member', fields['id'] as string, record(fields))

    const byProject = await box.run('ki repo --repo member roadmap list --by project')
    const byInitiative = await box.run('ki repo --repo member roadmap list --by initiative')
    const json = await box.run('ki repo --repo member roadmap list --by project --format json')
    const invalid = await box.run('ki repo --repo member roadmap list --by team')

    expect(byProject.exitCode).toBe(0)
    const project = byProject.output
    expect(project.indexOf('project alpha (3)')).toBeLessThan(project.indexOf('project beta (1)'))
    expect(project.indexOf('project gamma (2)')).toBeLessThan(project.indexOf('unassigned (3)'))
    expect(project).toContain('KI-TOOL-CLI-009 [done] Model item')
    expect(project).toContain('KI-TOOL-CLI-008 [draft @ now] Model item')
    expect(project).toContain('warnings (2)')
    expect(project).toContain('KI-TOOL-CLI-003: project gamma is not in the registry')

    expect(byInitiative.exitCode).toBe(0)
    const initiative = byInitiative.output
    expect(initiative).toContain('initiative init-one (4)')
    expect(initiative).toContain('initiative init-two (1)')
    expect(initiative).toContain('initiative ghost (1)')
    expect(initiative).toContain('unassigned (3)')
    expect(initiative).toContain('KI-TOOL-CLI-002: project beta names no initiative')
    expect(initiative).toContain('KI-TOOL-CLI-006: initiative ghost is not in the registry')
    expect(initiative).toContain('KI-TOOL-CLI-007: initiative init-two contradicts project alpha in init-one')
    expect(initiative).toContain('KI-TOOL-CLI-004: project gamma is not in the registry')

    expect(json).toEqual({ exitCode: 2, output: 'ki: error: roadmap list --by applies only to text output\n' })
    expect(invalid.exitCode).toBe(2)
    expect(invalid.output).toContain("argument 'team' is invalid")
  })

  test('reads the registry from the Capital itself and in aggregate listings', async () => {
    const box = await sandbox()
    await territory(box)
    await roadmapFile(box, 'capital', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', project: 'alpha' }))
    await roadmapFile(box, 'member', 'KI-TOOL-CLI-002', record({ id: 'KI-TOOL-CLI-002', project: 'alpha' }))
    await box.project.mkdir('empty/docs/roadmap')
    await box.project.write('empty/.ki.toml', declaration(home('example/empty'), capitalHome))
    await box.project.write('absent/.ki.toml', declaration(home('example/absent'), capitalHome))
    await rm(`${box.project.path}/capital/Streams/Initiatives`, { recursive: true })
    await box.project.write(
      'capital/Streams/Projects/Initiatives.md',
      '---\ninitiatives:\n  - init-one\n  - Not A Slug\n  - 7\n---\n\n# Initiatives\n\nSlug `init-two`.\n'
    )

    const own = await box.run('ki repo --repo capital roadmap list --by initiative')
    await box.project.write('capital/Streams/Projects/Initiatives.md', '# Initiatives\n\nSlug `init-one`.\n')
    const aggregate = await box.run(
      'ki repo --repo capital --repo member --repo empty --repo absent roadmap list --aggregate --by initiative'
    )
    const plain = await box.run('ki repo --repo capital --repo member roadmap list --aggregate')

    expect(own.exitCode).toBe(0)
    expect(own.output).toContain('initiative init-one (1)')
    expect(own.output).toContain(
      'Streams/Projects/Initiatives.md is retired; keep one note per Initiative in Streams/Initiatives/'
    )
    expect(aggregate.exitCode).toBe(0)
    expect(aggregate.output).toContain('initiative init-one (2)')
    expect(plain.output).toContain('next (2)')
  })

  test('resolves qualified references in their named territory and warns when it cannot', async () => {
    const box = await sandbox()
    const { member, capital } = await territory(box)
    await box.project.write('other/.ki.toml', declaration(home('example/other'), home('example/other')))
    await box.project.write('other/Streams/Projects/host.md', projectNote('host', 'rig'))
    await box.project.write('other/Streams/Initiatives/rig.md', initiativeNote('rig'))
    await box.project.write('bare/.ki.toml', declaration(home('example/bare'), home('example/bare')))
    const other = await realpath(`${box.project.path}/other`)
    const bare = await realpath(`${box.project.path}/bare`)
    await box.state.write(
      'ki/registry.toml',
      registryFile([
        { key: 'member', repository: home('example/member'), path: member },
        { key: 'capital', repository: capitalHome, path: capital },
        { key: 'other', repository: home('example/other'), path: other },
        { key: 'bare', repository: home('example/bare'), path: bare }
      ])
    )
    const items: readonly Readonly<Record<string, string | undefined>>[] = [
      { id: 'KI-TOOL-CLI-001', project: 'other/host' },
      { id: 'KI-TOOL-CLI-002', project: 'capital/alpha' },
      { id: 'KI-TOOL-CLI-003', initiative: 'other/rig' },
      { id: 'KI-TOOL-CLI-004', project: 'other/ghost' },
      { id: 'KI-TOOL-CLI-005', project: 'nowhere/host' },
      { id: 'KI-TOOL-CLI-006', project: 'member/host' },
      { id: 'KI-TOOL-CLI-007', project: 'other/host', initiative: 'rig' },
      { id: 'KI-TOOL-CLI-008', initiative: 'other/ghost' },
      { id: 'KI-TOOL-CLI-009', project: 'other/host', initiative: 'other/rig' },
      { id: 'KI-TOOL-CLI-010', project: 'nowhere/host', initiative: 'nowhere/rig' },
      { id: 'KI-TOOL-CLI-011', initiative: 'bare/rig' }
    ]
    for (const fields of items) await roadmapFile(box, 'member', fields['id'] as string, record(fields))

    const byProject = await box.run('ki repo --repo member roadmap list --by project')
    const byInitiative = await box.run('ki repo --repo member roadmap list --by initiative')

    expect(byProject.exitCode).toBe(0)
    const project = byProject.output
    expect(project).toContain('project other/host (3)')
    expect(project).toContain('project alpha (1)')
    expect(project).toContain('project nowhere/host (2)')
    expect(project).toContain('project member/host (1)')
    expect(project).toContain('KI-TOOL-CLI-004: project other/ghost is not in the registry')
    expect(project).toContain(
      'territory nowhere registry unavailable: territory nowhere is not in the local ki registry'
    )
    expect(project).toContain(
      'territory member registry unavailable: territory member is not a registered Capital checkout'
    )
    expect(project).toContain(
      'territory bare registry unavailable: the capital has no Streams/Projects/ or Streams/Initiatives/ registry'
    )
    expect(byInitiative.exitCode).toBe(0)
    const initiative = byInitiative.output
    expect(initiative).toContain('initiative other/rig (4)')
    expect(initiative).toContain('initiative init-one (1)')
    expect(initiative).toContain('initiative nowhere/rig (1)')
    expect(initiative).toContain('initiative bare/rig (1)')
    expect(initiative).toContain('KI-TOOL-CLI-007: initiative rig contradicts project other/host in other/rig')
    expect(initiative).toContain('KI-TOOL-CLI-008: initiative other/ghost is not in the registry')
    expect(initiative).not.toContain('KI-TOOL-CLI-009:')
    expect(initiative).not.toContain('KI-TOOL-CLI-011:')

    await box.state.write('ki/registry.toml', 'schema = [\n')
    const invalid = await box.run('ki repo --repo member roadmap list --by project')
    expect(invalid.output).toMatch(/territory other registry unavailable: the local ki registry .* is invalid/)

    await box.state.write(
      'ki/registry.toml',
      registryFile([{ key: 'other', repository: home('example/other'), path: other }])
    )
    await box.project.write('loose/.ki.toml', declaration(home('example/loose')))
    await roadmapFile(box, 'loose', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', project: 'other/host' }))
    const loose = await box.run('ki repo --repo loose roadmap list --by project')
    expect(loose.output).toContain('project other/host (1)')
    expect(loose.output).not.toContain('registry unavailable')
  })

  test('warns and still lists when the Project registry is unavailable', async () => {
    const box = await sandbox()
    await box.project.write('plain/.ki.toml', declaration(home('example/plain')))
    await roadmapFile(box, 'plain', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', project: 'alpha' }))
    await roadmapFile(box, 'plain', 'KI-TOOL-CLI-002', record({ id: 'KI-TOOL-CLI-002', initiative: 'init-one' }))
    await box.project.write('member/.ki.toml', declaration(home('example/member'), capitalHome))
    await roadmapFile(box, 'member', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', project: 'alpha' }))
    const member = await realpath(`${box.project.path}/member`)

    const undeclared = await box.run('ki repo --repo plain roadmap list --by initiative')
    const missingRegistry = await box.run('ki repo --repo member roadmap list --by project')
    await box.state.write('ki/registry.toml', 'schema = [\n')
    const invalidRegistry = await box.run('ki repo --repo member roadmap list --by project')
    await box.state.write(
      'ki/registry.toml',
      registryFile([
        { key: 'member', repository: home('example/member'), path: member },
        { key: 'capital', repository: capitalHome, path: `${box.project.path}/nowhere` }
      ])
    )
    const unregistered = await box.run('ki repo --repo member roadmap list --by project')
    await box.project.write('capital/.ki.toml', declaration(capitalHome, capitalHome))
    const capital = await realpath(`${box.project.path}/capital`)
    await box.state.write(
      'ki/registry.toml',
      registryFile([
        { key: 'member', repository: home('example/member'), path: member },
        { key: 'capital', repository: capitalHome, path: capital }
      ])
    )
    const noProjects = await box.run('ki repo --repo member roadmap list --by initiative')
    await box.project.write('capital/Streams/Initiatives/init-one.md', initiativeNote('init-one'))
    await roadmapFile(box, 'member', 'KI-TOOL-CLI-002', record({ id: 'KI-TOOL-CLI-002', initiative: 'init-one' }))
    const initiativesOnly = await box.run('ki repo --repo member roadmap list --by initiative')

    expect(undeclared.exitCode).toBe(0)
    expect(undeclared.output).toContain('project registry unavailable: the repository declares no ki-repo capital')
    expect(undeclared.output).toContain('unassigned (1)')
    expect(undeclared.output).toContain('initiative init-one (1)')
    expect(missingRegistry.exitCode).toBe(0)
    expect(missingRegistry.output).toMatch(/project registry unavailable: the local ki registry .* is missing/)
    expect(missingRegistry.output).toContain('project alpha (1)')
    expect(invalidRegistry.output).toMatch(/project registry unavailable: the local ki registry .* is invalid/)
    expect(unregistered.output).toContain(
      `project registry unavailable: no local checkout of the capital ${capitalHome} is registered`
    )
    expect(noProjects.exitCode).toBe(0)
    expect(noProjects.output).toContain(
      'project registry unavailable: the capital has no Streams/Projects/ or Streams/Initiatives/ registry'
    )
    expect(initiativesOnly.exitCode).toBe(0)
    expect(initiativesOnly.output).toContain('initiative init-one (1)')
    expect(initiativesOnly.output).toContain('KI-TOOL-CLI-001: project alpha is not in the registry')
    expect(initiativesOnly.output).not.toContain('registry unavailable')
  })
})

describe('[ki repo roadmap migrate]', () => {
  const longCondition = `- [ ] Blocked by ${'the slow upstream dependency '.repeat(10)}finishing.`
  const migrationFixture = async (box: Box) => {
    await box.project.write('repo/.ki.toml', declaration(home('example/repo')))
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-001',
      record({ id: 'KI-TOOL-CLI-001', theme: 'cli', horizon: 'triage' })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-002',
      record({
        id: 'KI-TOOL-CLI-002',
        horizon: 'triage',
        status: 'done',
        intake_disposition: 'duplicate',
        intake_disposition_target: "'KI-TOOL-CLI-001'"
      })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-003',
      record({ id: 'KI-TOOL-CLI-003', horizon: 'triage', status: 'done', intake_disposition: 'rejected' })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-004',
      record(
        {
          id: 'KI-TOOL-CLI-004',
          horizon: 'waiting-for',
          waiting_on_trades: '[TRD-0000000a, TRD-0000000a, TRD-0000000b]'
        },
        [
          '## Waiting for nothing',
          '',
          '```text',
          'until the fence closes',
          '```',
          '',
          '| until | table |',
          '',
          longCondition,
          ''
        ].join('\n')
      )
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-005',
      record({ id: 'KI-TOOL-CLI-005', horizon: 'parked' }, 'Plain context. Parked until the spring review!\n')
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-006',
      record({ id: 'KI-TOOL-CLI-006', horizon: 'parked', project: 'other/host', initiative: 'other/rig' })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-007',
      record({ id: 'KI-TOOL-CLI-007', status: 'done', horizon: 'parked' })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-008',
      record({ id: 'KI-TOOL-CLI-008', status: 'done', horizon: 'triage' })
    )
    await roadmapFile(
      box,
      'repo',
      'KI-TOOL-CLI-009',
      record({ id: 'KI-TOOL-CLI-009', status: 'ready', horizon: 'triage' })
    )
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-010', record({ id: 'KI-TOOL-CLI-010' }))
  }

  test('previews the mechanical pass without changing any record', async () => {
    const box = await sandbox()
    await migrationFixture(box)
    const before = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-004-item.md')
    await box.project.write('absent/.ki.toml', declaration())
    await box.project.write('undeclared/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n')

    const preview = await box.run('ki repo --repo repo --repo absent roadmap migrate', { now: () => NOW })

    expect(preview.exitCode).toBe(0)
    const output = preview.output
    expect(output).toContain('KI REPO ROADMAP MIGRATE')
    expect(output).toContain('KI-TOOL-CLI-001 KI-TOOL-CLI-001-item.md')
    expect(output).toContain('- horizon: triage')
    expect(output).toContain('+ status: triage')
    expect(output).toContain('+ status: cancelled')
    expect(output).toContain('+ resolution: duplicate')
    expect(output).toContain('+ resolution_target: KI-TOOL-CLI-001')
    expect(output).toContain('+ resolution: rejected')
    expect(output).toContain('add a ## Cancelled section recording the approved disposition')
    expect(output).toContain('+ trades: [TRD-0000000a, TRD-0000000b]')
    expect(output).toContain('+ condition: "Blocked by the slow upstream dependency')
    expect(output).toContain('..."')
    expect(output).toContain('+ condition: "Parked until the spring review!"')
    expect(output).toContain('+ condition: "REVIEW: name the release condition"')
    expect(output).toContain('review the hold condition lifted from the record prose')
    expect(output).toContain('state the hold release condition')
    expect(output).toContain('+ updated_at: 2026-10-07T12:00:00Z')
    for (const untouched of ['KI-TOOL-CLI-007', 'KI-TOOL-CLI-008', 'KI-TOOL-CLI-009', 'KI-TOOL-CLI-010'])
      expect(output).not.toContain(`${untouched} ${untouched}`)
    expect(output).not.toContain('- theme')
    expect(output).toContain('no roadmap')
    expect(output).toContain('summary: WOULD_MIGRATE=6 REPOSITORIES=2')
    expect(await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-004-item.md')).toBe(before)
    expect((await box.run('ki repo --repo undeclared roadmap migrate')).output).toContain('no roadmap')
  })

  test('applies the pass in one repository, idempotently and without committing', async () => {
    const box = await sandbox()
    await migrationFixture(box)
    await box.project.write('other/.ki.toml', declaration())

    const several = await box.run('ki repo --repo repo --repo other roadmap migrate --apply')
    const applied = await box.run('ki repo --repo repo roadmap migrate --apply', { now: () => NOW })
    const again = await box.run('ki repo --repo repo roadmap migrate --apply', { now: () => NOW })
    const listed = await box.run('ki repo --repo repo roadmap list --format json')

    expect(several).toEqual({
      exitCode: 2,
      output: 'ki: error: ki repo roadmap migrate requires exactly one repository target\n'
    })
    expect(applied.exitCode).toBe(0)
    expect(applied.output).toContain('summary: MIGRATED=6 REPOSITORIES=1')
    expect(again.output).toContain('summary: MIGRATED=0 REPOSITORIES=1')
    expect(await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-005-item.md')).toContain(
      'horizon: hold\nhold:\n  reason: parked\n  condition: "Parked until the spring review!"\nstatus: draft'
    )
    const cancelled = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-002-item.md')
    expect(cancelled).toContain('status: cancelled\nresolution: duplicate\nresolution_target: KI-TOOL-CLI-001\n')
    expect(cancelled).not.toContain('intake_disposition')
    expect(cancelled).not.toContain('horizon')
    expect(await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-001-item.md')).toContain('theme: cli')
    const qualified = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-006-item.md')
    expect(qualified).toContain('horizon: hold\n')
    expect(qualified).toContain('project: other/host\ninitiative: other/rig\n')
    expect(listed.exitCode).toBe(0)
    const lanes = Object.fromEntries(
      JSON.parse(listed.output).items.map((entry: { id: string; lane: string }) => [entry.id, entry.lane])
    )
    expect(lanes).toMatchObject({
      'KI-TOOL-CLI-001': 'triage',
      'KI-TOOL-CLI-002': 'cancelled',
      'KI-TOOL-CLI-004': 'hold',
      'KI-TOOL-CLI-006': 'hold'
    })
  })

  test('reports unreadable records and refuses to apply around them', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration())
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-001', record({ id: 'KI-TOOL-CLI-001', horizon: 'parked' }))
    await roadmapFile(box, 'repo', 'KI-TOOL-CLI-002', record({ id: 'KI-TOOL-CLI-002', status: 'closed' }))
    const before = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-001-item.md')

    const preview = await box.run('ki repo --repo repo roadmap migrate')
    const apply = await box.run('ki repo --repo repo roadmap migrate --apply')

    expect(preview.exitCode).toBe(1)
    expect(preview.output).toContain('KI-TOOL-CLI-002-item.md has an invalid lifecycle status')
    expect(preview.output).toContain('KI-TOOL-CLI-001 KI-TOOL-CLI-001-item.md')
    expect(apply.exitCode).toBe(2)
    expect(apply.output).toContain('has unreadable work items; fix them before migrating')
    expect(await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-001-item.md')).toBe(before)
  })
})
