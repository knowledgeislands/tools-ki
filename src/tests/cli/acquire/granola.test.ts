import { lstat, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { type GranolaMeetingFixture, granolaFixtureRunner } from '../_granola_helper.ts'

type TestRunner = (
  command: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv
) => Promise<{ readonly exitCode: number; readonly output: string }>

interface ReceiverFixture {
  readonly key: string
  readonly repository: string
  readonly path: string
  readonly folderIds?: readonly string[]
  readonly duplicateFolderIds?: readonly string[]
  readonly unfoldered?: boolean | 'flag'
  readonly residual?: boolean | 'flag'
  readonly captureRoot?: string
  readonly folderTerritories?: Readonly<Record<string, string>>
}

const declaration = (receiver: ReceiverFixture): string =>
  [
    '[repo]',
    'harnesses = ["knowledgeislands/ki-agentic-harness"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    `repository = ${JSON.stringify(receiver.repository)}`,
    '',
    '[skills.ki-acquire-granola]',
    ...(receiver.folderIds ? [`folder_ids = ${JSON.stringify(receiver.folderIds)}`] : []),
    ...(receiver.duplicateFolderIds ? [`duplicate_folder_ids = ${JSON.stringify(receiver.duplicateFolderIds)}`] : []),
    ...(receiver.unfoldered === undefined ? [] : [`unfoldered = ${JSON.stringify(receiver.unfoldered)}`]),
    ...(receiver.residual === undefined ? [] : [`residual = ${JSON.stringify(receiver.residual)}`]),
    ...(receiver.captureRoot ? [`capture_root = ${JSON.stringify(receiver.captureRoot)}`] : []),
    ...(receiver.folderTerritories
      ? [
          '[skills.ki-acquire-granola.folder_territories]',
          ...Object.entries(receiver.folderTerritories).map(
            ([id, territory]) => `${JSON.stringify(id)} = ${JSON.stringify(territory)}`
          )
        ]
      : []),
    ''
  ].join('\n')

const setupReceivers = async (box: Sandbox, receivers: readonly ReceiverFixture[]): Promise<void> => {
  box.setEnv({ KI_GRANOLA_REQUEST_INTERVAL_MS: '0' })
  await box.setupCanonicalHarness()
  await box.data.write(
    'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/environment/ki-acquire-granola/SKILL.md',
    [
      '---',
      'name: ki-acquire-granola',
      'ki-depends-on: []',
      'ki-acquire-adapter: granola',
      'ki-acquire-actions: [import]',
      'ki-acquire-repository-properties: [folder_ids, duplicate_folder_ids, unfoldered, residual, capture_root, folder_territories]',
      'ki-acquire-invocation-properties: [refresh-transcripts]',
      'ki-acquire-capabilities: [account, folders, meetings, details, transcripts]',
      'ki-acquire-omissions: [transcript]',
      'ki-acquire-mutation-boundary: read-only',
      'ki-acquire-checkpoint: detail-transcript',
      'ki-acquire-reset-scopes: [adapter, source, component, rebuild]',
      '---',
      ''
    ].join('\n')
  )
  for (const receiver of receivers) await writeFile(join(receiver.path, '.ki.toml'), declaration(receiver))
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      '',
      ...receivers.flatMap((receiver) => [
        `[repositories.${receiver.key}]`,
        `repository = ${JSON.stringify(receiver.repository)}`,
        `path = ${JSON.stringify(receiver.path)}`,
        ''
      ])
    ].join('\n')
  )
}

const command = (repository: string, ...options: readonly string[]): readonly string[] => [
  'ki',
  'acquire',
  'import',
  '--adapter',
  'granola',
  '--repo',
  repository,
  '--since',
  '2026-01-01',
  '--until',
  '2026-01-03',
  ...options
]

type JsonRecord = Record<string, unknown>

const packageDirectories = async (repository: string): Promise<readonly string[]> =>
  (await readdir(join(repository, '+/_ACQUIRE/granola'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort()

describe('[ki acquire import --adapter granola]', () => {
  test('stages one readable Markdown file per meeting and keeps existing captures unless refreshed', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('repository with spaces')
    const receiver: ReceiverFixture = {
      key: 'target',
      repository: 'https://github.com/example/target',
      path: repository,
      folderIds: ['folder-legal', 'folder-secondary'],
      unfoldered: true,
      residual: true
    }
    const peerPath = await box.root.mkdir('peer')
    const peer: ReceiverFixture = {
      key: 'peer',
      repository: 'https://github.com/example/peer',
      path: peerPath,
      folderIds: ['folder-peer']
    }
    await setupReceivers(box, [receiver, peer])
    expect((await lstat(join(repository, '.ki.toml'))).isFile()).toBe(true)
    const meetings: GranolaMeetingFixture[] = [
      {
        id: 'meeting-a',
        date: '2026-01-01',
        title: 'Foldered',
        folderIds: ['folder-secondary', 'folder-legal'],
        detail: {
          summary:
            '### Content Reorganization\n\n#### Sections Moved\n\n- Item\n\n    Follow-up\n\nSummary line  \n\nNext  ',
          participants: ['Kris Brown', 'Site owner']
        },
        transcript: { transcript: 'Speaker A: hello  Speaker B: bye  ' }
      },
      { id: 'meeting-b', date: '2026-01-02', title: 'Unfoldered' },
      { id: 'meeting-c', date: '2026-01-03', title: 'Peer', folderIds: ['folder-peer'] }
    ]
    const folders = [
      { id: 'folder-legal', title: 'Legal' },
      { id: 'folder-secondary', title: 'Secondary' },
      { id: 'folder-peer', title: 'Peer' }
    ]
    const firstSource = granolaFixtureRunner({
      meetings,
      folders
    })
    box.setRunner(firstSource.runner)
    const first = await box.run(command(repository), { now: () => Date.parse('2026-01-04T12:00:00Z') })

    expect(first.exitCode, first.output).toBe(0)
    expect(first.output).toContain('Coverage: 3 discovered, 2 selected, 1 routed elsewhere')
    expect(first.output).toContain('Meetings: 2 new, 0 refreshed, 0 kept')
    const packages = await packageDirectories(repository)
    expect(packages).toHaveLength(2)
    for (const packageName of packages) {
      expect(packageName).toMatch(/^2026-01-0[12]--.+--meeting-[ab]\.md$/)
      const document = await box.root.read(`repository with spaces/+/_ACQUIRE/granola/${packageName}`)
      expect(document).toContain('type: granola-meeting')
      expect(document).toContain('## Transcript')
      expect(document).not.toContain('## Notes')
      expect(document).not.toContain('markdownlint-disable')
      if (packageName.includes('meeting-a')) {
        expect(document).toContain('## Attendees\n\nKris Brown and Site owner')
        expect(document).toContain('## Content Reorganization')
        expect(document).toContain('### Sections Moved')
        expect(document).toContain('- Item\n\n  Follow-up')
        expect(document).toContain('Speaker A: hello\n\nSpeaker B: bye')
      }
      expect(document).not.toMatch(/[ \t]+$/m)
    }
    expect(await readdir(join(repository, '+/_ACQUIRE/granola'))).toEqual(packages)
    const firstDocument = await box.root.read(`repository with spaces/+/_ACQUIRE/granola/${packages[1]}`)

    const repeatedSource = granolaFixtureRunner({ meetings, folders })
    box.setRunner(repeatedSource.runner)
    const repeated = await box.run(command(repository), { now: () => Date.parse('2026-01-05T12:00:00Z') })
    expect(repeated.exitCode, repeated.output).toBe(0)
    expect(repeated.output).toContain('Meetings: 0 new, 0 refreshed, 2 kept')
    expect(repeated.output).toContain(
      `Kept: meeting-b · capture exists at ${packages[1]}; not overwritten without --refresh`
    )
    expect(
      repeatedSource.calls.filter((call) => ['get_meetings', 'get_meeting_transcript'].includes(call.tool))
    ).toEqual([])
    expect(await box.root.read(`repository with spaces/+/_ACQUIRE/granola/${packages[1]}`)).toBe(firstDocument)

    const amendedSource = granolaFixtureRunner({
      meetings: [
        meetings[0] as GranolaMeetingFixture,
        { ...(meetings[1] as GranolaMeetingFixture), detail: { summary: 'amended' } },
        meetings[2] as GranolaMeetingFixture
      ],
      folders
    })
    box.setRunner(amendedSource.runner)
    const amended = await box.run(command(repository, '--refresh'), { now: () => Date.parse('2026-01-06T12:00:00Z') })
    expect(amended.exitCode, amended.output).toBe(0)
    expect(amended.output).toContain('Meetings: 0 new, 2 refreshed, 0 kept')
    expect(await packageDirectories(repository)).toEqual(packages)
    expect(await box.root.read(`repository with spaces/+/_ACQUIRE/granola/${packages[1]}`)).toContain('amended')
  })

  test('splits saturated date windows and fails closed on a saturated single day', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const meeting: GranolaMeetingFixture = { id: 'meeting-a', date: '2026-01-02', title: 'One' }
    const saturated = Array.from({ length: 100 }, (_, index) => ({
      id: `saturated-${index}`,
      date: '2026-01-02',
      title: `Saturated ${index}`
    }))
    const source = granolaFixtureRunner({
      meetings: [meeting],
      onList: ({ since, until, matches }) => (since === '2026-01-01' && until === '2026-01-03' ? saturated : matches)
    })
    box.setRunner(source.runner)
    const result = await box.run(command(repository, '--dry-run'))
    expect(result.exitCode).toBe(0)
    expect(source.calls.filter((call) => call.tool === 'list_meetings')).toHaveLength(3)
    expect(await lstat(join(repository, '+')).catch(() => undefined)).toBeUndefined()

    const adjacent = granolaFixtureRunner({
      meetings: [meeting],
      onList: ({ since, until, matches }) => (since === '2026-01-01' && until === '2026-01-02' ? saturated : matches)
    })
    box.setRunner(adjacent.runner)
    const adjacentResult = await box.run([
      'ki',
      'acquire',
      'import',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--since',
      '2026-01-01',
      '--until',
      '2026-01-02',
      '--dry-run'
    ])
    expect(adjacentResult.exitCode).toBe(0)
    expect(adjacent.calls.filter((call) => call.tool === 'list_meetings')).toHaveLength(3)

    const conflicting = granolaFixtureRunner({
      meetings: [meeting],
      onList: ({ since, until, matches }) => {
        if (since === '2026-01-01' && until === '2026-01-03') return saturated
        return matches.map((candidate) => ({ ...candidate, title: since }))
      }
    })
    box.setRunner(conflicting.runner)
    const conflictingResult = await box.run(command(repository, '--dry-run'))
    expect(conflictingResult.exitCode).toBe(1)
    expect(conflictingResult.output).toContain('conflicting discovery projections')

    const blocked = granolaFixtureRunner({ meetings: saturated, onList: () => saturated })
    box.setRunner(blocked.runner)
    const failure = await box.run([
      'ki',
      'acquire',
      'import',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--since',
      '2026-01-02',
      '--until',
      '2026-01-02'
    ])
    expect(failure.exitCode).toBe(1)
    expect(failure.output).toContain('complete enumeration cannot be proven')
  })

  test('fails closed on receiver conflicts and permits explicit intentional duplication', async () => {
    const box = await sandbox()
    const target = await box.root.mkdir('target')
    const peer = await box.root.mkdir('peer')
    const base: ReceiverFixture[] = [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: target,
        folderIds: ['folder-shared']
      },
      {
        key: 'peer',
        repository: 'https://github.com/example/peer',
        path: peer,
        folderIds: ['folder-shared']
      }
    ]
    await setupReceivers(box, base)
    const fixture = {
      meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Shared', folderIds: ['folder-shared'] }],
      folders: [{ id: 'folder-shared', title: 'Shared' }]
    }
    box.setRunner(granolaFixtureRunner(fixture).runner)
    const conflict = await box.run(command(target))
    expect(conflict.exitCode).toBe(1)
    expect(conflict.output).toContain('conflicting receivers')
    expect(await lstat(join(target, '+')).catch(() => undefined)).toBeUndefined()

    await setupReceivers(
      box,
      base.map((receiver) => ({ ...receiver, duplicateFolderIds: ['folder-shared'] }))
    )
    box.setRunner(granolaFixtureRunner(fixture).runner)
    const duplicated = await box.run(command(target))
    expect(duplicated.exitCode).toBe(0)
    expect(duplicated.output).toContain('1 intentionally duplicated')
  })

  test('reports uncovered routing, invalid intervals, missing tools, and transcript omissions without invention', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        folderIds: ['folder-selected']
      }
    ])
    const meetings = [
      {
        id: 'meeting-a',
        date: '2026-01-02',
        title: 'Unmatched',
        folderIds: ['folder-other'],
        transcript: null
      }
    ] as const
    const folders = [
      { id: 'folder-selected', title: 'Selected' },
      { id: 'folder-other', title: 'Other' }
    ]
    box.setRunner(granolaFixtureRunner({ meetings, folders }).runner)
    const uncovered = await box.run(command(repository))
    expect(uncovered.exitCode).toBe(1)
    expect(uncovered.output).toContain('receiver coverage is incomplete')

    box.setRunner(
      granolaFixtureRunner({
        meetings: [{ id: 'meeting-unfoldered', date: '2026-01-02', title: 'Unfoldered' }],
        folders
      }).runner
    )
    const uncoveredUnfoldered = await box.run(command(repository))
    expect(uncoveredUnfoldered.exitCode).toBe(1)
    expect(uncoveredUnfoldered.output).toContain('unfoldered; receiver coverage is incomplete')

    const invalid = await box.run([
      'ki',
      'acquire',
      'import',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--since',
      '2026-02-30',
      '--until',
      '2026-01-01'
    ])
    expect(invalid.exitCode).toBe(1)
    expect(invalid.output).toContain('date is invalid')
    const malformed = await box.run([
      'ki',
      'acquire',
      'import',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--since',
      'yesterday',
      '--until',
      '2026-01-01'
    ])
    expect(malformed.output).toContain('dates must use YYYY-MM-DD')
    const reversed = await box.run([
      'ki',
      'acquire',
      'import',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--since',
      '2026-01-03',
      '--until',
      '2026-01-01'
    ])
    expect(reversed.output).toContain('--since must not be after --until')

    box.setRunner(granolaFixtureRunner({ meetings, folders, missingTools: ['get_meetings'] }).runner)
    const missingTool = await box.run(command(repository))
    expect(missingTool.exitCode).toBe(1)
    expect(missingTool.output).toContain('missing required read-only tool get_meetings')

    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        residual: true
      }
    ])
    box.setRunner(granolaFixtureRunner({ meetings, folders }).runner)
    const omitted = await box.run(command(repository))
    expect(omitted.exitCode).toBe(0)
    expect(omitted.output).toContain('Omissions: 1')
    const [packageName] = await packageDirectories(repository)
    const document = await box.root.read(`target/+/_ACQUIRE/granola/${packageName}`)
    expect(document).toContain('  - "transcript"')
    expect(document).toContain('_Transcript unavailable from the source._')
  })

  test.each(['structured', 'result', 'content', 'data'] as const)(
    'accepts mcporter %s response envelopes through the CLI adapter',
    async (responseWrapper) => {
      const box = await sandbox()
      const repository = await box.root.mkdir('target')
      await setupReceivers(box, [
        {
          key: 'target',
          repository: 'https://github.com/example/target',
          path: repository,
          unfoldered: true
        }
      ])
      box.setRunner(
        granolaFixtureRunner({
          meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Wrapped' }],
          responseWrapper
        }).runner
      )
      box.cd('../target')
      const result = await box.run(
        ['ki', 'acquire', 'import', '--adapter', 'granola', '--since', '2026-01-01', '--dry-run'],
        {
          now: () => Date.parse('2026-01-03T12:00:00Z')
        }
      )
      expect(result.exitCode, result.output).toBe(0)
      expect(result.output).toContain('Interval: 2026-01-01 through 2026-01-03')
    }
  )

  test.each([
    {
      name: 'an unsupported selector key',
      configure: (text: string) => `${text}unknown = true\n`,
      expected: 'unsupported property unknown'
    },
    {
      name: 'a non-boolean selector',
      configure: (text: string) => text.replace('unfoldered = true', 'unfoldered = "yes"'),
      expected: '.unfoldered must be boolean',
      receiver: { unfoldered: true }
    },
    {
      name: 'a malformed folder selector',
      configure: (text: string) => text.replace('folder_ids = ["folder-a"]', 'folder_ids = "folder-a"'),
      expected: '.folder_ids must be an array',
      receiver: { folderIds: ['folder-a'] }
    },
    {
      name: 'a repeated folder selector',
      configure: (text: string) => text,
      expected: '.folder_ids must not repeat',
      receiver: { folderIds: ['folder-a', 'folder-a'] }
    },
    {
      name: 'an unselected duplication selector',
      configure: (text: string) => text,
      expected: '.duplicate_folder_ids must be selected',
      receiver: { folderIds: ['folder-a'], duplicateFolderIds: ['folder-b'] }
    },
    {
      name: 'no receiver selector',
      configure: (text: string) => text,
      expected: 'must select a folder, unfoldered meetings, or residual meetings'
    }
  ])('rejects $name', async ({ configure, expected, receiver: receiverOptions = {} }) => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    const receiver: ReceiverFixture = {
      key: 'target',
      repository: 'https://github.com/example/target',
      path: repository,
      ...receiverOptions
    }
    await setupReceivers(box, [receiver])
    await writeFile(join(repository, '.ki.toml'), configure(await box.root.read('target/.ki.toml')))
    box.setRunner(granolaFixtureRunner({ meetings: [], folders: [{ id: 'folder-a', title: 'A' }] }).runner)
    const result = await box.run(command(repository))
    expect([1, 2]).toContain(result.exitCode)
    expect(result.output).toContain(expected)
  })

  test('ignores governance-only Granola declarations outside the selected receiver', async () => {
    const box = await sandbox()
    const target = await box.root.mkdir('target')
    const governance = await box.root.mkdir('governance')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: target,
        folderIds: ['folder-a']
      },
      {
        key: 'governance',
        repository: 'https://github.com/example/governance',
        path: governance
      }
    ])
    box.setRunner(
      granolaFixtureRunner({
        meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting A', folderIds: ['folder-a'] }],
        folders: [{ id: 'folder-a', title: 'A' }]
      }).runner
    )

    const result = await box.run(command(target))

    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('Coverage: 1 discovered, 1 selected, 0 routed elsewhere')
  })

  test('preserves live Granola text projections while extracting stable identities', async () => {
    const box = await sandbox()
    const target = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: target,
        folderIds: ['folder-a']
      }
    ])
    box.setRunner(
      granolaFixtureRunner({
        meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting & A', folderIds: ['folder-a'] }],
        folders: [{ id: 'folder-a', title: 'A' }],
        meetingResponseFormat: 'text'
      }).runner
    )

    const result = await box.run(command(target))

    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('Coverage: 1 discovered, 1 selected, 0 routed elsewhere')
    const packages = await packageDirectories(target)
    expect(packages).toHaveLength(1)
    const document = await box.root.read(`target/+/_ACQUIRE/granola/${packages[0]}`)
    expect(document).toContain('# Meeting & A')
    expect(document).toContain('Summary for meeting-a')
    expect(document).toContain('Transcript for meeting-a')
    expect(document).not.toContain('"transcript"')
    expect(document).not.toContain('source material')
  })

  test('keeps one Attendees section when the source summary already carries one', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const meeting = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting A',
      detail: {
        participants: ['Kris Brown', 'Site owner'],
        summary: '### Attendees\n\n- Kris Brown\n- Site owner\n\n### Decisions\n\n- Ship it'
      },
      transcript: { transcript: 'Speaker A: hello' }
    }
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)

    const first = await box.run(command(repository))
    expect(first.exitCode, first.output).toBe(0)
    const [path] = await packageDirectories(repository)
    const document = await box.root.read(`target/+/_ACQUIRE/granola/${path}`)
    expect(document.match(/^## Attendees$/gm)).toHaveLength(1)
    expect(document).toContain('## Attendees\n\n- Kris Brown\n- Site owner')
    expect(document).toContain('## Decisions')
    expect(document).toContain('participants:')

    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    const repeated = await box.run(command(repository))
    expect(repeated.exitCode, repeated.output).toBe(0)
    expect((await box.root.read(`target/+/_ACQUIRE/granola/${path}`)).match(/^## Attendees$/gm)).toHaveLength(1)
  })

  test('renders defensive Markdown fallbacks and rejects unsafe meeting paths', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    box.setRunner(
      granolaFixtureRunner({
        meetings: [
          {
            id: 'meeting-a',
            date: '2026-01-02',
            title: 'Meeting A',
            detail: {
              date: 'not-a-date',
              participants: ['One', { name: 'Two' }, { email: 'three@example.com' }],
              summary: '# Meeting A\n\nBody'
            },
            transcript: { transcript: 'prefix {not-json} Speaker A: hello' }
          },
          {
            id: 'meeting-b',
            date: '2026-01-02',
            title: 'Meeting B',
            detail: { participants: ['Only'] },
            transcript: { transcript: '<transcript>XML transcript</transcript>' }
          }
        ]
      }).runner
    )

    const result = await box.run(command(repository))

    expect(result.exitCode, result.output).toBe(0)
    const documents = await Promise.all(
      (await packageDirectories(repository)).map((path) => box.root.read(`target/+/_ACQUIRE/granola/${path}`))
    )
    expect(documents.join('\n')).toContain('three@example.com')
    expect(documents.join('\n')).toContain('Only')
    expect(documents.join('\n')).toContain('XML transcript')
    expect((await packageDirectories(repository)).some((path) => path.startsWith('undated--'))).toBe(true)

    const unsafe = await sandbox()
    const unsafeRepository = await unsafe.root.mkdir('target')
    await setupReceivers(unsafe, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: unsafeRepository,
        unfoldered: true
      }
    ])
    unsafe.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'unsafe/id', date: '2026-01-02', title: 'Unsafe' }] }).runner
    )
    expect((await unsafe.run(command(unsafeRepository))).output).toContain('produced unsafe path')
  })

  test('renders structured and textual projection fallback chains', async () => {
    const defaults = await sandbox()
    const defaultsRepository = await defaults.root.mkdir('target')
    await setupReceivers(defaults, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: defaultsRepository,
        unfoldered: true
      }
    ])
    defaults.setRunner(
      granolaFixtureRunner({
        meetings: [
          {
            id: 'meeting-default',
            date: '2026-01-02',
            title: 'Fixture only',
            listing: { title: null, date: null },
            detail: { title: null, date: null }
          },
          {
            id: 'meeting-slug',
            date: '2026-01-02',
            title: 'Fixture only',
            detail: { title: '!!!' }
          }
        ]
      }).runner
    )
    expect((await defaults.run(command(defaultsRepository))).exitCode).toBe(0)
    expect(await packageDirectories(defaultsRepository)).toEqual([
      '2026-01-02--meeting--meeting-slug.md',
      'undated--untitled-meeting--meeting-default.md'
    ])

    const textual = await sandbox()
    const textualRepository = await textual.root.mkdir('target')
    await setupReceivers(textual, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: textualRepository,
        folderIds: ['folder-a']
      }
    ])
    const base = granolaFixtureRunner({
      meetings: [
        {
          id: 'meeting-a',
          date: '2026-01-02',
          title: 'Text title',
          folderIds: ['folder-a']
        }
      ],
      folders: [{ id: 'folder-a', title: 'Folder' }],
      meetingResponseFormat: 'text'
    }).runner
    const content = (text: string): string => `${JSON.stringify({ content: [{ type: 'text', text }] })}\n`
    textual.setRunner((executable, arguments_, environment) => {
      const tool = (arguments_[1] ?? '').replace('granola.', '')
      if (tool === 'list_meeting_folders')
        return Promise.resolve({
          exitCode: 0,
          output: '{"folders":[{"id":"folder-a"},{"id":"folder-empty"}]}\n'
        })
      if (tool === 'list_meetings' && arguments_.some((argument) => argument.includes('"folder_id":"folder-empty"')))
        return Promise.resolve({
          exitCode: 0,
          output: content('<meetings_data count="0" />')
        })
      if (tool === 'get_meetings')
        return Promise.resolve({
          exitCode: 0,
          output: content(
            '<meetings_data count="1"><meeting id="meeting-a"><summary>XML notes</summary></meeting></meetings_data>'
          )
        })
      if (tool === 'get_meeting_transcript')
        return Promise.resolve({ exitCode: 0, output: content('prefix {not-json} transcript') })
      return base(executable, arguments_, environment)
    })

    const result = await textual.run(command(textualRepository))

    expect(result.exitCode, result.output).toBe(0)
    const [path] = await packageDirectories(textualRepository)
    const document = await textual.root.read(`target/+/_ACQUIRE/granola/${path}`)
    expect(document).toContain('# Text title')
    expect(document).toContain('XML notes')
    expect(document).toContain('prefix {not-json} transcript')
    expect(document).toContain('name: null')
  })

  test('rejects conflicting global and folder meeting projections', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        folderIds: ['folder-a']
      }
    ])
    const meeting: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Global',
      folderIds: ['folder-a']
    }
    box.setRunner(
      granolaFixtureRunner({
        meetings: [meeting],
        folders: [{ id: 'folder-a', title: 'A' }],
        onList: ({ folderId, matches }) => (folderId ? [{ ...meeting, title: 'Folder' }] : matches)
      }).runner
    )

    expect((await box.run(command(repository))).output).toContain(
      'meeting meeting-a has conflicting global and folder projections'
    )
  })

  test('discovers folder-only meetings, keeps several captures and refreshes minimal captures', async () => {
    const folderBox = await sandbox()
    const folderRepository = await folderBox.root.mkdir('target')
    await setupReceivers(folderBox, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: folderRepository,
        folderIds: ['folder-a']
      }
    ])
    const folderMeeting: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting',
      folderIds: ['folder-a']
    }
    folderBox.setRunner(
      granolaFixtureRunner({
        meetings: [folderMeeting],
        folders: [{ id: 'folder-a', title: 'Folder' }],
        onList: ({ folderId, matches }) => (folderId ? matches : [])
      }).runner
    )
    expect((await folderBox.run(command(folderRepository))).output).toContain('1 new, 0 refreshed, 0 kept')

    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    const meeting: GranolaMeetingFixture = { id: 'meeting-a', date: '2026-01-02', title: 'Meeting', transcript: null }
    const root = join(repository, '+/_ACQUIRE/granola')
    const path = join(root, '2026-01-02--meeting--meeting-a.md')
    await mkdir(root, { recursive: true })
    const minimal = '---\nsource_id: "meeting-a"\n---\n'
    for (const content of [
      minimal,
      `${minimal}\n## Transcript\n\n`,
      `${minimal}\n## Transcript\n\n_Transcript unavailable from the source._\n`
    ]) {
      await writeFile(path, content)
      box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
      const result = await box.run(command(repository, '--refresh'))
      expect(result.output).toContain('0 new, 1 refreshed, 0 kept')
      const refreshed = await readFile(path, 'utf8')
      expect(refreshed).toContain('_Transcript unavailable from the source._')
      expect(refreshed).not.toContain('transcript_sha256')
    }
    await writeFile(join(root, '2026-01-03--copy--meeting-a.md'), minimal)
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    const several = await box.run(command(repository, '--refresh'))
    expect(several.output).toContain('0 new, 0 refreshed, 1 kept')
    expect(several.output).toContain('Kept: meeting-a · several captures exist')
  })

  test('requires an available registered eligible target and validates selected folder identities', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    const receiver: ReceiverFixture = {
      key: 'target',
      repository: 'https://github.com/example/target',
      path: repository,
      folderIds: ['missing-folder']
    }
    await setupReceivers(box, [receiver])
    box.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    const missingFolder = await box.run(command(repository))
    expect(missingFolder.output).toContain('selects unavailable Granola folder missing-folder')

    await writeFile(
      join(repository, '.ki.toml'),
      declaration(receiver).replace(/\n\[skills\.ki-acquire-granola\][\s\S]*$/, '\n')
    )
    const ineligible = await box.run(command(repository))
    expect(ineligible.exitCode).toBe(2)
    expect(ineligible.output).toContain('not enabled')

    await writeFile(join(repository, '.ki.toml'), declaration({ ...receiver, folderIds: undefined, unfoldered: true }))
    const missingPath = join(box.root.path, 'missing-repository')
    await box.state.write(
      'ki/registry.toml',
      [
        'schema = 1',
        '',
        '[repositories.absent]',
        'repository = "https://github.com/example/absent"',
        `path = ${JSON.stringify(missingPath)}`,
        '',
        '[repositories.target]',
        'repository = "https://github.com/example/target"',
        `path = ${JSON.stringify(repository)}`,
        ''
      ].join('\n')
    )
    const unavailable = await box.run(command(repository))
    expect(unavailable.output).toContain('registered repository is unavailable')
  })

  test('fails helpfully when the read-only MCP contract or source projections are malformed', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const fixture = {
      meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }]
    }
    const textOutput = (value: string): string => `${JSON.stringify({ content: [{ type: 'text', text: value }] })}\n`
    const exercise = async (
      change: (tool: string, run: () => ReturnType<TestRunner>) => ReturnType<TestRunner>
    ): Promise<string> => {
      const base = granolaFixtureRunner(fixture).runner
      const runner: TestRunner = (executable, arguments_, environment) => {
        const tool = arguments_[0] === 'list' ? 'schema' : (arguments_[1] ?? '').replace('granola.', '')
        return change(tool, () => base(executable, arguments_, environment))
      }
      box.setRunner(runner)
      return (await box.run(command(repository, '--dry-run'))).output
    }

    expect(
      await exercise((tool, run) => (tool === 'schema' ? Promise.resolve({ exitCode: 1, output: '' }) : run()))
    ).toContain('schema inspection failed: mcporter exited non-zero')
    expect(
      await exercise((tool, run) => (tool === 'schema' ? Promise.resolve({ exitCode: 0, output: 'not-json' }) : run()))
    ).toContain('schema response is not JSON')
    expect(
      await exercise((tool, run) => (tool === 'schema' ? Promise.resolve({ exitCode: 0, output: '[]' }) : run()))
    ).toContain('schema response is malformed')
    expect(
      await exercise((tool, run) =>
        tool === 'get_account_info' ? Promise.resolve({ exitCode: 1, output: '' }) : run()
      )
    ).toContain('get_account_info failed: mcporter exited non-zero')
    expect(
      await exercise((tool, run) =>
        tool === 'get_account_info' ? Promise.resolve({ exitCode: 0, output: 'not-json' }) : run()
      )
    ).toContain('get_account_info response is not JSON')
    expect(
      await exercise((tool, run) =>
        tool === 'get_account_info' ? Promise.resolve({ exitCode: 0, output: '{"content":[null]}\n' }) : run()
      )
    ).toContain('lacks stable identity or note-access scopes')
    expect(
      await exercise((tool, run) =>
        tool === 'get_account_info'
          ? Promise.resolve({
              exitCode: 0,
              output: '{"content":[{"text":"{}"},{"text":"{}"}]}\n'
            })
          : run()
      )
    ).toContain('lacks stable identity or note-access scopes')
    expect(
      await exercise((tool, run) =>
        tool === 'list_meeting_folders' ? Promise.resolve({ exitCode: 0, output: '{"folders":[{}]}\n' }) : run()
      )
    ).toContain('folder has no stable identity')
    expect(
      await exercise((tool, run) =>
        tool === 'list_meetings' ? Promise.resolve({ exitCode: 0, output: '{}\n' }) : run()
      )
    ).toContain('response contains no meetings array')
    expect(
      await exercise((tool, run) =>
        tool === 'list_meetings'
          ? Promise.resolve({ exitCode: 0, output: textOutput('source material without an envelope') })
          : run()
      )
    ).toContain('meetings response is malformed')
    expect(
      await exercise((tool, run) =>
        tool === 'list_meetings'
          ? Promise.resolve({ exitCode: 0, output: textOutput('<meetings_data></meetings_data>') })
          : run()
      )
    ).toContain('response has no meeting count')
    expect(
      await exercise((tool, run) =>
        tool === 'list_meetings'
          ? Promise.resolve({
              exitCode: 0,
              output: textOutput('<meetings_data count="1"><meeting></meeting></meetings_data>')
            })
          : run()
      )
    ).toContain('meetings has no stable identity')
    expect(
      await exercise((tool, run) =>
        tool === 'list_meetings'
          ? Promise.resolve({ exitCode: 0, output: textOutput('<meetings_data count="1"></meetings_data>') })
          : run()
      )
    ).toContain('response count does not match its meeting projections')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meetings' ? Promise.resolve({ exitCode: 0, output: '{"meetings":[]}\n' }) : run()
      )
    ).toContain('did not return exactly one meeting')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meetings'
          ? Promise.resolve({ exitCode: 0, output: '{"meetings":[{"id":"different"}]}\n' })
          : run()
      )
    ).toContain('meeting detail returned unrequested identity')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meetings'
          ? Promise.resolve({
              exitCode: 0,
              output: '{"meetings":[{"id":"meeting-a"},{"id":"meeting-a"}]}\n'
            })
          : run()
      )
    ).toContain('meeting detail repeated identity')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meetings'
          ? Promise.resolve({ exitCode: 0, output: '{"meetings":[],"not_found":["different"]}\n' })
          : run()
      )
    ).toContain('meeting detail marked unrequested identity different unavailable')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meetings'
          ? Promise.resolve({
              exitCode: 0,
              output: '{"meetings":[{"id":"meeting-a"}],"not_found":["meeting-a"]}\n'
            })
          : run()
      )
    ).toContain('meeting detail both returned and marked meeting-a unavailable')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meeting_transcript'
          ? Promise.resolve({
              exitCode: 0,
              output: '{"content":[{"type":"text","text":"Speaker A: exact transcript"}]}\n'
            })
          : run()
      )
    ).toContain('Granola acquisition plan')
    expect(
      await exercise((tool, run) =>
        tool === 'get_meeting_transcript' ? Promise.resolve({ exitCode: 1, output: '' }) : run()
      )
    ).toContain('get_meeting_transcript failed: mcporter exited non-zero')
  })

  test('rejects malformed request timing and resolves detail identities omitted from a batch', async () => {
    const invalidInterval = await sandbox()
    const intervalRepository = await invalidInterval.root.mkdir('target')
    await setupReceivers(invalidInterval, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: intervalRepository,
        unfoldered: true
      }
    ])
    invalidInterval.setEnv({ KI_GRANOLA_REQUEST_INTERVAL_MS: '-1' })
    invalidInterval.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    expect((await invalidInterval.run(command(intervalRepository))).output).toContain(
      'KI_GRANOLA_REQUEST_INTERVAL_MS must be a non-negative integer'
    )

    const invalidRetry = await sandbox()
    const retryRepository = await invalidRetry.root.mkdir('target')
    await setupReceivers(invalidRetry, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: retryRepository,
        unfoldered: true
      }
    ])
    invalidRetry.setEnv({ KI_GRANOLA_RATE_LIMIT_BASE_MS: 'nope' })
    invalidRetry.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    expect((await invalidRetry.run(command(retryRepository))).output).toContain(
      'KI_GRANOLA_RATE_LIMIT_BASE_MS must be a non-negative integer'
    )

    const defaults = await sandbox()
    const defaultsRepository = await defaults.root.mkdir('target')
    await setupReceivers(defaults, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: defaultsRepository,
        unfoldered: true
      }
    ])
    defaults.setEnv({ KI_GRANOLA_REQUEST_INTERVAL_MS: undefined })
    const defaultBase = granolaFixtureRunner({ meetings: [] }).runner
    defaults.setRunner((executable, arguments_, environment) =>
      arguments_[1] === 'granola.get_account_info'
        ? Promise.resolve({ exitCode: 1, output: '' })
        : defaultBase(executable, arguments_, environment)
    )
    expect((await defaults.run(command(defaultsRepository))).output).toContain(
      'get_account_info failed: mcporter exited non-zero'
    )

    const paced = await sandbox()
    const pacedRepository = await paced.root.mkdir('target')
    await setupReceivers(paced, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: pacedRepository,
        unfoldered: true
      }
    ])
    paced.setEnv({ KI_GRANOLA_REQUEST_INTERVAL_MS: '20' })
    paced.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    expect((await paced.run(command(pacedRepository, '--dry-run'))).exitCode).toBe(0)

    const batch = await sandbox()
    const batchRepository = await batch.root.mkdir('target')
    await setupReceivers(batch, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: batchRepository,
        unfoldered: true
      }
    ])
    const base = granolaFixtureRunner({
      meetings: [
        { id: 'meeting-a', date: '2026-01-02', title: 'A' },
        { id: 'meeting-b', date: '2026-01-02', title: 'B' }
      ]
    }).runner
    const detailCalls: string[][] = []
    batch.setRunner((executable, arguments_, environment) => {
      const tool = (arguments_[1] ?? '').replace('granola.', '')
      if (tool === 'get_meetings') {
        const argumentsIndex = arguments_.indexOf('--args')
        const parsed = JSON.parse(arguments_[argumentsIndex + 1] ?? '{}') as {
          readonly meeting_ids?: readonly string[]
        }
        const meetingIds = [...(parsed.meeting_ids ?? [])]
        detailCalls.push(meetingIds)
        if (meetingIds.length === 1)
          return Promise.resolve({
            exitCode: 0,
            output: '{"meetings":[],"not_found":["meeting-b"]}\n'
          })
        return Promise.resolve({
          exitCode: 0,
          output:
            '{"content":[{"type":"text","text":"<meetings_data count=\\"1\\"><meeting id=\\"meeting-a\\"></meeting></meetings_data>"}]}\n'
        })
      }
      return base(executable, arguments_, environment)
    })
    const result = await batch.run(command(batchRepository))
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('2 new')
    expect(result.output).toContain('Omissions: 1')
    expect(detailCalls).toEqual([['meeting-a', 'meeting-b'], ['meeting-b']])
  })

  test.each([
    { name: 'another identity', content: 'source_id: "meeting-other"', expected: 'does not carry source identity' },
    { name: 'malformed identity', content: 'source_id: meeting-a', expected: 'has malformed source_id' },
    { name: 'non-string identity', content: 'source_id: 7', expected: 'has malformed source_id' },
    { name: 'missing front matter', content: '', expected: 'does not carry source identity' }
  ])('ignores retired ledgers and refuses a capture with $name', async ({ content, expected }) => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    await mkdir(join(repository, '+/_ACQUIRE/granola'), { recursive: true })
    await writeFile(join(repository, '+/_ACQUIRE/granola/ledger.json'), 'not-json')
    await writeFile(join(repository, '+/_ACQUIRE/granola/journal.json'), 'not-json')
    await writeFile(
      join(repository, '+/_ACQUIRE/granola/2026-01-01--meeting--meeting-a.md'),
      content ? `---\n${content}\n---\n` : 'no front matter\n'
    )
    box.setRunner(granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-01', title: 'A' }] }).runner)
    const kept = await box.run(command(repository))
    expect(kept.exitCode, kept.output).toBe(0)
    expect(kept.output).toContain('Meetings: 0 new, 0 refreshed, 1 kept')
    const result = await box.run(command(repository, '--refresh'))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(expected)
  })

  test('retries an explicit Granola rate limit without weakening other source failures', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const source = granolaFixtureRunner({
      meetings: [{ id: 'meeting-a', date: '2026-01-01', title: 'First' }],
      rateLimitDetailOnce: 'meeting-a'
    })
    box.setEnv({ KI_GRANOLA_RATE_LIMIT_BASE_MS: '0' })
    box.setRunner(source.runner)

    const acquired = await box.run(command(repository))

    expect(acquired.exitCode, acquired.output).toBe(0)
    expect(source.calls.filter((call) => call.tool === 'get_meetings')).toHaveLength(2)
  })

  test('keeps captures unless refreshed and retains a transcript the provider withdraws', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const original: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting',
      detail: { summary: 'Original notes' },
      transcript: { transcript: 'Speaker: immutable transcript' }
    }
    const firstSource = granolaFixtureRunner({ meetings: [original] })
    box.setRunner(firstSource.runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    expect(firstSource.calls.filter((call) => call.tool === 'get_meeting_transcript')).toHaveLength(1)

    const path = 'target/+/_ACQUIRE/granola/2026-01-02--meeting--meeting-a.md'
    const transcriptSha256 = /^transcript_sha256: (.+)$/m.exec(await box.root.read(path))?.[1]
    expect(transcriptSha256).toMatch(/^"[a-f0-9]{64}"$/)
    const changedSource = granolaFixtureRunner({
      meetings: [{ ...original, detail: { summary: 'Changed notes' } }]
    })
    box.setRunner(changedSource.runner)
    const kept = await box.run(command(repository))
    expect(kept.exitCode, kept.output).toBe(0)
    expect(kept.output).toContain('Meetings: 0 new, 0 refreshed, 1 kept')
    expect(await box.root.read(path)).toContain('Original notes')
    const changed = await box.run(command(repository, '--refresh'))
    expect(changed.exitCode, changed.output).toBe(0)
    expect(changed.output).toContain('Meetings: 0 new, 1 refreshed, 0 kept')
    expect(await box.root.read(path)).toContain('Changed notes')
    const withdrawnSource = granolaFixtureRunner({ meetings: [{ ...original, transcript: null }] })
    box.setRunner(withdrawnSource.runner)
    const withdrawn = await box.run(command(repository, '--refresh'))
    expect(withdrawn.exitCode, withdrawn.output).toBe(0)
    expect(withdrawn.output).toContain('Omissions: 0')
    const document = await box.root.read(path)
    expect(document).toContain('Speaker: immutable transcript')
    expect(document).toContain('Original notes')
    expect(document).toContain(`transcript_sha256: ${transcriptSha256}`)
    expect(withdrawnSource.calls.every((call) => !/(archive|delete|move|tag|update)/i.test(call.tool))).toBe(true)
  })

  test('treats a successful meeting-not-found transcript response as unavailable', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const base = granolaFixtureRunner({
      meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }]
    }).runner
    box.setRunner((executable, arguments_, environment) => {
      const tool = (arguments_[1] ?? '').replace('granola.', '')
      if (tool === 'get_meeting_transcript')
        return Promise.resolve({
          exitCode: 0,
          output: `${JSON.stringify({ content: [{ type: 'text', text: 'Meeting not found' }] })}\n`
        })
      return base(executable, arguments_, environment)
    })

    const result = await box.run(command(repository))

    expect(result.exitCode, result.output).toBe(0)
    const document = await box.root.read('target/+/_ACQUIRE/granola/2026-01-02--meeting--meeting-a.md')
    expect(document).toContain('transcript_state: "unavailable"')
    expect(document).not.toContain('transcript_sha256')
  })

  test('records a successful structured transcript omission', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        unfoldered: true
      }
    ])
    const base = granolaFixtureRunner({
      meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }]
    }).runner
    box.setRunner((executable, arguments_, environment) => {
      const tool = (arguments_[1] ?? '').replace('granola.', '')
      if (tool === 'get_meeting_transcript')
        return Promise.resolve({ exitCode: 0, output: `${JSON.stringify({ transcript: 'Meeting not found' })}\n` })
      return base(executable, arguments_, environment)
    })

    const result = await box.run(command(repository))

    expect(result.exitCode, result.output).toBe(0)
    expect(await box.root.read('target/+/_ACQUIRE/granola/2026-01-02--meeting--meeting-a.md')).toContain(
      '_Transcript unavailable from the source._'
    )
  })

  test('handles orphan identity collision rename account refresh and unavailable detail boundaries', async () => {
    const orphan = await sandbox()
    const orphanRepository = await orphan.root.mkdir('target')
    await setupReceivers(orphan, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: orphanRepository,
        unfoldered: true
      }
    ])
    const meeting: GranolaMeetingFixture = { id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }
    const orphanPath = join(orphanRepository, '+/_ACQUIRE/granola/2026-01-02--meeting--meeting-a.md')
    await mkdir(join(orphanRepository, '+/_ACQUIRE/granola'), { recursive: true })
    await writeFile(orphanPath, '---\nsource_id: "other"\n---\n')
    orphan.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await orphan.run(command(orphanRepository))).output).toContain('capture exists at')
    expect((await orphan.run(command(orphanRepository, '--refresh'))).output).toContain(
      'does not carry source identity meeting-a'
    )

    await rm(orphanPath)
    await mkdir(orphanPath)
    expect((await orphan.run(command(orphanRepository))).output).toContain('meeting document')
    await rm(orphanPath, { recursive: true })
    expect((await orphan.run(command(orphanRepository))).exitCode).toBe(0)
    orphan.setRunner(granolaFixtureRunner({ meetings: [{ ...meeting, title: 'Renamed' }] }).runner)
    const renamed = await orphan.run(command(orphanRepository, '--refresh'))
    expect(renamed.output).toContain('0 new, 1 refreshed, 0 kept')
    expect(await packageDirectories(orphanRepository)).toEqual(['2026-01-02--meeting--meeting-a.md'])
    expect(await readFile(orphanPath, 'utf8')).toContain('# Renamed')

    orphan.setRunner(
      granolaFixtureRunner({
        meetings: [{ ...meeting, title: 'Renamed' }],
        account: {
          email: 'other@example.com',
          active_workspace: { id: 'fixture' },
          mcp_note_access: { scopes: ['owned'] }
        }
      }).runner
    )
    const other = await orphan.run(command(orphanRepository, '--refresh'))
    expect(other.exitCode, other.output).toBe(0)
    expect(other.output).toContain('belongs to another Granola account')

    const refresh = granolaFixtureRunner({ meetings: [{ ...meeting, title: 'Renamed', transcript: null }] })
    orphan.setRunner(refresh.runner)
    const refreshed = await orphan.run(command(orphanRepository, '--refresh'))
    expect(refreshed.exitCode, refreshed.output).toBe(0)
    expect(refresh.calls.filter((call) => call.tool === 'get_meeting_transcript')).toHaveLength(1)

    const unavailable = await sandbox()
    const unavailableRepository = await unavailable.root.mkdir('target')
    await setupReceivers(unavailable, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: unavailableRepository,
        unfoldered: true
      }
    ])
    unavailable.setRunner(granolaFixtureRunner({ meetings: [{ ...meeting, detailUnavailable: true }] }).runner)
    const imported = await unavailable.run(command(unavailableRepository))
    expect(imported.exitCode, imported.output).toBe(0)
    expect(imported.output).toContain('Omissions: 1')
  })

  test('retains account binding across workspace inventory changes and rejects identity or access changes', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    const meeting: GranolaMeetingFixture = { id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }
    const account = {
      email: 'owner@example.com',
      active_workspace: { id: 'active-workspace', display_name: 'Personal' },
      mcp_note_access: { scopes: ['personal', 'public'] }
    }
    box.setRunner(granolaFixtureRunner({ meetings: [meeting], account }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const capture = join(repository, '+/_ACQUIRE/granola/2026-01-02--meeting--meeting-a.md')
    const binding = (content: string): string | undefined => /^source_account_sha256: .*$/m.exec(content)?.[0]
    const original = await readFile(capture, 'utf8')

    for (const workspaces of [[], [{ id: 'active-workspace' }], [{ id: 'new-workspace' }]]) {
      box.setRunner(
        granolaFixtureRunner({
          meetings: [meeting],
          account: {
            ...account,
            workspaces,
            mcp_plan: 'changed plan metadata',
            sign_out_url: 'https://example.invalid/logout'
          }
        }).runner
      )
      const result = await box.run(command(repository, '--refresh'))
      expect(result.exitCode, result.output).toBe(0)
      expect(result.output).toContain('0 new, 1 refreshed, 0 kept')
      expect(binding(await readFile(capture, 'utf8'))).toBe(binding(original))
    }
    const bound = await readFile(capture, 'utf8')

    for (const changed of [
      { ...account, email: 'other@example.com' },
      { ...account, active_workspace: { id: 'other-workspace', display_name: 'Personal' } },
      { ...account, mcp_note_access: { scopes: ['personal'] } }
    ]) {
      box.setRunner(granolaFixtureRunner({ meetings: [meeting], account: changed }).runner)
      const result = await box.run(command(repository, '--refresh'))
      expect(result.exitCode, result.output).toBe(0)
      expect(result.output).toContain('belongs to another Granola account')
      expect(await readFile(capture, 'utf8')).toBe(bound)
    }

    for (const missingKey of ['email', 'active_workspace', 'mcp_note_access']) {
      const incomplete: Record<string, unknown> = { ...account }
      delete incomplete[missingKey]
      box.setRunner(granolaFixtureRunner({ meetings: [meeting], account: incomplete }).runner)
      expect((await box.run(command(repository))).output).toContain('lacks stable identity or note-access scopes')
      expect(await readFile(capture, 'utf8')).toBe(bound)
    }

    const fixture = granolaFixtureRunner({ meetings: [meeting], account })
    box.setRunner(async (executable, arguments_, environment) =>
      arguments_[1] === 'granola.get_account_info'
        ? { exitCode: 0, output: '[]' }
        : fixture.runner(executable, arguments_, environment)
    )
    expect((await box.run(command(repository))).output).toContain('account response is malformed')
  })

  test('ignores non-acquisition peers and validates peer acquisition selectors', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    const peer = await box.root.mkdir('peer')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    await writeFile(
      join(peer, '.ki.toml'),
      [
        '[repo]',
        'harnesses = ["knowledgeislands/ki-agentic-harness"]',
        '',
        '[skills.ki-repo-project]',
        '',
        '[skills.ki-repo]',
        'repo_type = "project"',
        'primary_shape = "ki-repo-project"',
        'repository = "https://github.com/example/peer"',
        ''
      ].join('\n')
    )
    await box.state.write(
      'ki/registry.toml',
      `${await box.state.read('ki/registry.toml')}\n[repositories.peer]\nrepository = "https://github.com/example/peer"\npath = ${JSON.stringify(peer)}\n`
    )
    box.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )
    expect((await box.run(command(repository))).exitCode).toBe(0)

    await writeFile(
      join(peer, '.ki.toml'),
      `${await readFile(join(peer, '.ki.toml'), 'utf8')}\n[skills.ki-acquire-granola]\nunknown = true\n`
    )
    expect((await box.run(command(repository))).output).toContain('unsupported key unknown')
  })
})

describe('[ki acquire central Granola inbox]', () => {
  test('captures multiple folders once, retains memberships, flags identities without reading their content, and finds moved captures', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('inbox')
    const receiver: ReceiverFixture = {
      key: 'inbox',
      repository: 'https://github.com/example/inbox',
      path: repository,
      folderIds: ['one', 'two', 'same'],
      captureRoot: 'captures',
      folderTerritories: { one: 'legal', two: 'personal', same: 'legal' },
      unfoldered: 'flag',
      residual: 'flag'
    }
    await setupReceivers(box, [receiver])
    await writeFile(join(repository, 'README.md'), 'Keep this repository')
    const folders = [
      { id: 'one', title: 'Legal' },
      { id: 'two', title: 'Personal' },
      { id: 'same', title: 'Same territory' },
      { id: 'other', title: 'Unexpected' }
    ]
    const meetings: GranolaMeetingFixture[] = [
      { id: 'single', date: '2026-01-02', title: 'Single', folderIds: ['one', 'same'] },
      { id: 'multiple', date: '2026-01-02', title: 'Multiple', folderIds: ['one', 'two'] },
      { id: 'unfoldered', date: '2026-01-02', title: 'Needs a folder' },
      { id: 'unmatched', date: '2026-01-02', title: 'Unknown folder', folderIds: ['other'] }
    ]
    const source = granolaFixtureRunner({ meetings, folders })
    box.setRunner(source.runner)
    const preview = await box.run(command(repository, '--dry-run'))
    expect(preview.exitCode, preview.output).toBe(0)
    expect(preview.output).toContain('2 flagged without content acquisition')
    expect(preview.output).toContain('Flagged: unfoldered · unfoldered · 2026-01-02 · Needs a folder')
    expect(await lstat(join(repository, '.acquire')).catch(() => undefined)).toBeUndefined()
    const imported = await box.run(command(repository))
    expect(imported.exitCode, imported.output).toBe(0)
    expect(await lstat(join(repository, '.acquire')).catch(() => undefined)).toBeUndefined()
    const single = 'captures/legal/granola/2026-01-02--single--single/meeting.md'
    const multiple = 'captures/_review/granola/2026-01-02--multiple--multiple/meeting.md'
    expect(await readFile(join(repository, single), 'utf8')).toContain('source_id: "single"')
    const markdown = await readFile(join(repository, multiple), 'utf8')
    expect(markdown).toContain('territory_names:\n  - "legal"\n  - "personal"')
    expect(markdown).toContain('name: "Legal"')
    expect(markdown).toContain('name: "Personal"')
    expect(imported.output).toContain('Flagged: unmatched · ')
    const contentCalls = source.calls.filter((call) => ['get_meetings', 'get_meeting_transcript'].includes(call.tool))
    expect(JSON.stringify(contentCalls)).not.toContain('unfoldered')
    expect(JSON.stringify(contentCalls)).not.toContain('unmatched')
    expect((await box.run(command(repository))).output).toContain('Meetings: 0 new, 0 refreshed, 2 kept')

    // A capture Acquire has moved to its territory is still found and kept.
    const moved = 'captures/personal/granola/2026-01-02--multiple--multiple/meeting.md'
    await mkdir(dirname(join(repository, moved)), { recursive: true })
    await rename(dirname(join(repository, multiple)), dirname(join(repository, moved)))
    const again = await box.run(command(repository, '--refresh'))
    expect(again.output).toContain('Meetings: 0 new, 2 refreshed, 0 kept')
    expect(await lstat(join(repository, multiple)).catch(() => undefined)).toBeUndefined()
    expect(await readFile(join(repository, moved), 'utf8')).toContain('source_id: "multiple"')
    expect(await readFile(join(repository, 'README.md'), 'utf8')).toBe('Keep this repository')
  })

  test('reports empty unmatched folders and keeps mixed memberships in review, including textual listing evidence', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('inbox')
    await setupReceivers(box, [
      {
        key: 'inbox',
        repository: 'https://github.com/example/inbox',
        path: repository,
        folderIds: ['one'],
        captureRoot: 'captures',
        folderTerritories: { one: 'legal' },
        unfoldered: 'flag',
        residual: 'flag'
      }
    ])
    const folders = [
      { id: 'one', title: 'Legal' },
      { id: 'unknown', title: 'Empty unexpected folder' }
    ]
    box.setRunner(
      granolaFixtureRunner({
        meetings: [
          { id: 'mixed', date: '2026-01-02', title: 'Mixed', folderIds: ['one', 'unknown'] },
          { id: 'outside', date: '2026-01-02', title: 'Title & detail' }
        ],
        folders,
        meetingResponseFormat: 'text'
      }).runner
    )
    const result = await box.run(command(repository))
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('Unmatched folder: unknown · Empty unexpected folder')
    expect(result.output).toContain('Flagged: outside · unfoldered · 2026-01-02 · Title & detail')
    const meetingPath = 'captures/_review/granola/2026-01-02--mixed--mixed/meeting.md'
    expect(await readFile(join(repository, meetingPath), 'utf8')).toContain('unmapped_folder_ids:\n  - "unknown"')
    box.setRunner(granolaFixtureRunner({ meetings: [], folders }).runner)
    const empty = await box.run(command(repository))
    expect(empty.exitCode, empty.output).toBe(0)
    expect(empty.output).toContain('Unmatched folder: unknown · Empty unexpected folder')
  })

  test('keeps identities flaggable when listing titles or dates and folder titles are omitted', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('inbox')
    await setupReceivers(box, [
      {
        key: 'inbox',
        repository: 'https://github.com/example/inbox',
        path: repository,
        unfoldered: 'flag',
        residual: 'flag'
      }
    ])
    const source = granolaFixtureRunner({
      meetings: [{ id: 'metadata-omitted', date: '2026-01-02', title: 'Title', listing: { title: null, date: null } }],
      folders: [{ id: 'unknown', title: 'Ignored' }]
    })
    box.setRunner((executable, arguments_, environment) => {
      if (arguments_[1] === 'granola.list_meeting_folders')
        return Promise.resolve({ exitCode: 0, output: '{"folders":[{"id":"unknown"}]}\n' })
      return source.runner(executable, arguments_, environment)
    })
    const result = await box.run(command(repository))
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('Unmatched folder: unknown · unknown title')
    expect(result.output).toContain('Flagged: metadata-omitted · unfoldered · unknown date · unknown title')
    expect(source.calls.filter((call) => ['get_meetings', 'get_meeting_transcript'].includes(call.tool))).toEqual([])
  })

  test('acquires original image bytes beside a central meeting', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('inbox')
    await setupReceivers(box, [
      {
        key: 'inbox',
        repository: 'https://github.com/example/inbox',
        path: repository,
        folderIds: ['one'],
        captureRoot: 'captures',
        folderTerritories: { one: 'legal' }
      }
    ])
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    box.setRunner(
      granolaFixtureRunner({
        meetings: [{ id, date: '2026-01-02', title: 'Images', folderIds: ['one'] }],
        folders: [{ id: 'one', title: 'Legal' }]
      }).runner
    )
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const directory = await box.root.mkdir('exports')
    const original = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 7])
    await writeFile(join(directory, 'attachment-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'), original)
    const images = await box.run([
      'ki',
      'acquire',
      'images',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--source',
      id,
      '--directory',
      directory,
      '--expected',
      '1'
    ])
    expect(images.exitCode, images.output).toBe(0)
    const meetingPath = `captures/legal/granola/2026-01-02--images--${id}/meeting.md`
    const acquiredImage = join(
      repository,
      meetingPath.replace('meeting.md', `${id}--attachment-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`)
    )
    expect(await readFile(acquiredImage)).toEqual(original)
    expect(await readFile(join(repository, meetingPath), 'utf8')).toContain('Images')
  })

  test('rejects unsafe and incomplete central layout declarations and symlinked parents', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('inbox')
    const receiver: ReceiverFixture = {
      key: 'inbox',
      repository: 'https://github.com/example/inbox',
      path: repository,
      folderIds: ['one'],
      captureRoot: 'captures',
      folderTerritories: { one: 'legal' },
      unfoldered: 'flag'
    }
    const folders = [{ id: 'one', title: 'Legal' }]
    box.setRunner(
      granolaFixtureRunner({
        meetings: [{ id: 'one-note', date: '2026-01-02', title: 'Note', folderIds: ['one'] }],
        folders
      }).runner
    )
    const invalidReceivers: ReceiverFixture[] = [
      { ...receiver, captureRoot: '../escape' },
      { ...receiver, captureRoot: '.' },
      { ...receiver, captureRoot: undefined },
      { ...receiver, folderTerritories: {} },
      { ...receiver, folderTerritories: { other: 'legal' } },
      { ...receiver, folderTerritories: { one: '../escape' } }
    ]
    for (const invalid of invalidReceivers) {
      await setupReceivers(box, [invalid])
      const result = await box.run(command(repository))
      expect(result.exitCode, result.output).toBe(1)
      expect(result.output).toMatch(/capture_root|folder_territories/)
    }
    await setupReceivers(box, [receiver])
    const elsewhere = await box.root.mkdir('elsewhere')
    await symlink(elsewhere, join(repository, 'captures'))
    const unsafe = await box.run(command(repository))
    expect(unsafe.output).toContain('Unsafe Granola parent directory')
    expect(await readdir(elsewhere)).toEqual([])
  })
})

describe('[ki acquire images --adapter granola]', () => {
  const meetingId = '46261c23-bd6c-4c6a-92d9-85ced57dfcc4'
  const attachmentId = '6823c90d-a684-449d-be05-0b2cb9194f96'
  const missingAttachmentId = '00000000-0000-0000-0000-000000000001'
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

  test('binds exact desktop exports to an acquired KB meeting and rejects incomplete or changed handoffs', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    box.setRunner(granolaFixtureRunner({ meetings: [{ id: meetingId, date: '2026-01-02', title: 'Meeting' }] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const directory = await box.root.mkdir('exports')
    const source = join(directory, `attachment-${attachmentId}.jpg`)
    const bytes = png
    await writeFile(source, bytes)
    const args = [
      'ki',
      'acquire',
      'images',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--source',
      meetingId,
      '--directory',
      directory,
      '--expected',
      '1'
    ]
    const dry = await box.run([...args, '--dry-run'])
    expect(dry.exitCode, dry.output).toBe(0)
    const manifestPath = join(repository, '+/_ACQUIRE/granola', `${meetingId}--attachments.json`)
    expect(await lstat(manifestPath).catch(() => undefined)).toBeUndefined()
    const imported = await box.run(args)
    expect(imported.exitCode, imported.output).toBe(0)
    expect(imported.output).toContain('1 images, 11 bytes')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as JsonRecord
    expect(manifest['expected_count']).toBe(1)
    expect((manifest['assets'] as JsonRecord[])[0]?.['attachment_id']).toBe(attachmentId)
    const acquired = join(repository, '+/_ACQUIRE/granola', `${meetingId}--attachment-${attachmentId}.png`)
    expect(await readFile(acquired)).toEqual(bytes)
    expect((await box.run(args)).exitCode).toBe(0)
    expect((await box.run([...args.slice(0, -1), '2'])).output).toContain('expected 2')
    await writeFile(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6]))
    expect((await box.run(args)).output).toContain('differs from acquired copy')
    await writeFile(acquired, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 7, 8, 9]))
    await writeFile(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 7, 8, 9]))
    expect((await box.run(args)).output).toContain('differs from manifest')
  })

  test('rejects invalid command scope, receiver, export directory, and files', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    const directory = await box.root.mkdir('exports')
    const args = [
      'ki',
      'acquire',
      'images',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--source',
      meetingId,
      '--directory',
      directory,
      '--expected',
      '1'
    ]
    expect((await box.run([...args, '--all'])).output).toContain('requires --adapter granola')
    expect((await box.run([...args.slice(0, -1), 'no'])).output).toContain('positive integer')
    expect((await box.run([...args.slice(0, -1), '99999999999999999999'])).output).toContain(
      'positive integer from the Granola image stack'
    )
    expect((await box.run([...args.slice(0, 8), 'bad', ...args.slice(9)])).output).toContain('meeting UUID')
    expect((await box.run(args)).output).toContain('must have exactly one capture')
    box.setRunner(granolaFixtureRunner({ meetings: [{ id: meetingId, date: '2026-01-02', title: 'Meeting' }] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const missingId = '00000000-0000-0000-0000-000000000000'
    expect((await box.run([...args.slice(0, 8), missingId, ...args.slice(9)])).output).toContain(
      'must have exactly one capture'
    )
    expect((await box.run([...args.slice(0, 10), join(directory, 'missing'), ...args.slice(11)])).output).toContain(
      'physical directory'
    )
    const linked = join(directory, 'linked')
    await symlink(directory, linked)
    expect((await box.run([...args.slice(0, 10), linked, ...args.slice(11)])).output).toContain('physical directory')
    await rm(linked)
    const source = join(directory, `attachment-${attachmentId}.jpg`)
    await writeFile(source, Buffer.from('not an image'))
    expect((await box.run(args)).output).toContain('not PNG, JPEG, or WebP')
    await rm(source)
    await writeFile(join(directory, 'unexpected.png'), png)
    expect((await box.run(args)).output).toContain('unexpected file')
    await rm(join(directory, 'unexpected.png'))
    await symlink(join(directory, 'missing'), source)
    expect((await box.run(args)).output).toContain('Unsafe Granola image file')
    await rm(source)
    await writeFile(source, png)
    const duplicate = join(directory, `attachment-${attachmentId}.png`)
    await writeFile(duplicate, png)
    expect((await box.run([...args.slice(0, -1), '2'])).output).toContain('repeats an attachment UUID')
    await rm(source)
    await rm(duplicate)
    const capture = join(repository, `+/_ACQUIRE/granola/2026-01-02--meeting--${meetingId}.md`)
    await writeFile(join(repository, `+/_ACQUIRE/granola/2026-01-03--copy--${meetingId}.md`), await readFile(capture))
    expect((await box.run(args)).output).toContain('must have exactly one capture')
  })

  test('verifies manifest shape, image presence, and JPEG and WebP exports', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    box.setRunner(granolaFixtureRunner({ meetings: [{ id: meetingId, date: '2026-01-02', title: 'Meeting' }] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const directory = await box.root.mkdir('exports')
    const source = join(directory, `attachment-${attachmentId}.jpg`)
    const args = [
      'ki',
      'acquire',
      'images',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--source',
      meetingId,
      '--directory',
      directory,
      '--expected',
      '1'
    ]
    const target = join(repository, '+/_ACQUIRE/granola')
    const manifestPath = join(target, `${meetingId}--attachments.json`)
    await writeFile(source, Buffer.from([255, 216, 255, 1]))
    expect((await box.run(args)).exitCode).toBe(0)
    const jpg = join(target, `${meetingId}--attachment-${attachmentId}.jpg`)
    expect(await lstat(jpg)).toBeDefined()
    const original = JSON.parse(await readFile(manifestPath, 'utf8')) as JsonRecord
    const check = async (value: unknown, expected: string): Promise<void> => {
      await writeFile(manifestPath, typeof value === 'string' ? value : JSON.stringify(value))
      expect((await box.run(args)).output).toContain(expected)
    }
    await check('{', 'invalid JSON')
    await check({ ...original, expected_count: 2 }, 'malformed')
    await check({ ...original, assets: [{}] }, 'invalid asset')
    await writeFile(manifestPath, JSON.stringify(original))
    await rm(jpg)
    expect((await box.run(args)).output).toContain('is missing')
    await writeFile(jpg, Buffer.from([255, 216, 255, 1]))
    const wrong = {
      ...original,
      assets: [{ ...(original['assets'] as JsonRecord[])[0], file: `${meetingId}--attachment-${attachmentId}.png` }]
    }
    await check(wrong, 'is missing')
    await writeFile(join(target, `${meetingId}--attachment-${attachmentId}.png`), Buffer.from([255, 216, 255, 1]))
    expect((await box.run(args)).output).toContain('wrong format extension')
    await writeFile(manifestPath, JSON.stringify(original))
    const webpDirectory = await box.root.mkdir('webp')
    const webpSource = join(webpDirectory, `attachment-${missingAttachmentId}.webp`)
    await writeFile(webpSource, Buffer.from('RIFF1234WEBPdata'))
    const alternate = [...args.slice(0, 10), webpDirectory, ...args.slice(11)]
    expect((await box.run(alternate)).output).toContain('manifest differs')
  })
})
