import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
  readonly unfoldered?: boolean
  readonly residual?: boolean
}

const declaration = (receiver: ReceiverFixture): string =>
  [
    '[repo]',
    'harnesses = ["knowledgeislands/ki-agentic-harness"]',
    '',
    '[skills.ki-repo]',
    `repository = ${JSON.stringify(receiver.repository)}`,
    '',
    '[skills.ki-housekeeping-granola]',
    ...(receiver.folderIds ? [`folder_ids = ${JSON.stringify(receiver.folderIds)}`] : []),
    ...(receiver.duplicateFolderIds ? [`duplicate_folder_ids = ${JSON.stringify(receiver.duplicateFolderIds)}`] : []),
    ...(receiver.unfoldered === undefined ? [] : [`unfoldered = ${receiver.unfoldered}`]),
    ...(receiver.residual === undefined ? [] : [`residual = ${receiver.residual}`]),
    ''
  ].join('\n')

const setupReceivers = async (box: Sandbox, receivers: readonly ReceiverFixture[]): Promise<void> => {
  box.setEnv({ KI_GRANOLA_REQUEST_INTERVAL_MS: '0' })
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
  'granola',
  'import',
  '--repo',
  repository,
  '--since',
  '2026-01-01',
  '--until',
  '2026-01-03',
  ...options
]

const packageDirectories = async (repository: string): Promise<readonly string[]> =>
  (await readdir(join(repository, '+/_ACQUIRE/granola'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort()

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const writeLegacyPackage = async (
  repository: string,
  meetingId = 'meeting-a'
): Promise<{ readonly base: string; readonly version: string }> => {
  const base = join(repository, '+/_ACQUIRE/granola')
  const content = '{}\n'
  const checksumLine = `${sha256(content)}  source/originals/listing.json`
  const version = sha256(`${checksumLine}\n`)
  const directory = join(base, version)
  await mkdir(join(directory, 'checksums'), { recursive: true })
  await mkdir(join(directory, 'source/originals'), { recursive: true })
  await writeFile(join(directory, 'source/originals/listing.json'), content)
  await writeFile(join(directory, 'checksums/sha256sums.txt'), `${checksumLine}\n`)
  await writeFile(join(directory, 'kep.toml'), `payload_sha256 = "${version}"\n`)
  await writeFile(
    join(base, 'ledger.json'),
    `${JSON.stringify(
      {
        schema: 1,
        provider: 'granola',
        account_sha256: sha256('{"account":"fixture","workspace":"fixture"}'),
        source_schema_sha256: 'legacy-schema',
        identity_checkpoint_sha256: 'legacy-identity',
        interval: { since: '2026-01-01', until: '2026-01-03' },
        exhaustive: true,
        windows: [],
        meetings: {
          [meetingId]: {
            latest_payload_sha256: version,
            versions: [version],
            folder_ids: [],
            inferred_unfoldered: true
          }
        },
        updated_at: '2026-01-04T00:00:00.000Z'
      },
      null,
      2
    )}\n`
  )
  return { base, version }
}

describe('[ki acquire granola import]', () => {
  test('stages one readable Markdown file per meeting and leaves unchanged repeats untouched', async () => {
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
    expect(first.output).toContain('Meetings: 2 new, 0 amended, 0 unchanged')
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
    const ledgerPath = 'repository with spaces/+/_ACQUIRE/granola/ledger.json'
    const originalLedger = await box.root.read(ledgerPath)

    const repeatedSource = granolaFixtureRunner({ meetings, folders })
    box.setRunner(repeatedSource.runner)
    const repeated = await box.run(command(repository), { now: () => Date.parse('2026-01-05T12:00:00Z') })
    expect(repeated.output).toContain('Meetings: 0 new, 0 amended, 2 unchanged')
    expect(repeated.output).toContain('Ledger: unchanged')
    expect(await box.root.read(ledgerPath)).toBe(originalLedger)

    const amendedSource = granolaFixtureRunner({
      meetings: [
        meetings[0] as GranolaMeetingFixture,
        { ...(meetings[1] as GranolaMeetingFixture), detail: { summary: 'amended' } },
        meetings[2] as GranolaMeetingFixture
      ],
      folders
    })
    box.setRunner(amendedSource.runner)
    const amended = await box.run(command(repository), { now: () => Date.parse('2026-01-06T12:00:00Z') })
    expect(amended.output).toContain('Meetings: 0 new, 1 amended, 1 unchanged')
    expect(await packageDirectories(repository)).toHaveLength(2)
    const ledger = JSON.parse(await box.root.read(ledgerPath)) as {
      meetings: Record<string, { versions: string[] }>
    }
    expect(ledger.meetings['meeting-b']?.versions).toHaveLength(2)
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
      'granola',
      'import',
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
      'granola',
      'import',
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
      'granola',
      'import',
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
      'granola',
      'import',
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
      'granola',
      'import',
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
    expect(omitted.output).toContain('Omissions: 1 meetings with unavailable detail or transcript')
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
      const result = await box.run(['ki', 'acquire', 'granola', 'import', '--since', '2026-01-01', '--dry-run'], {
        now: () => Date.parse('2026-01-03T12:00:00Z')
      })
      expect(result.exitCode, result.output).toBe(0)
      expect(result.output).toContain('Interval: 2026-01-01 through 2026-01-03')
    }
  )

  test.each([
    {
      name: 'an unsupported selector key',
      configure: (text: string) => `${text}unknown = true\n`,
      expected: 'unsupported key unknown'
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
    expect(result.exitCode).toBe(1)
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
        return Promise.resolve({ exitCode: 0, output: '{"folders":[{"id":"folder-a"}]}\n' })
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
      declaration(receiver).replace(/\n\[skills\.ki-housekeeping-granola\][\s\S]*$/, '\n')
    )
    const ineligible = await box.run(command(repository))
    expect(ineligible.exitCode).toBe(2)
    expect(ineligible.output).toContain('must be registered and declare')

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
    ).toContain('Granola acquisition plan')
    expect(
      await exercise((tool, run) =>
        tool === 'get_account_info'
          ? Promise.resolve({
              exitCode: 0,
              output: '{"content":[{"text":"{}"},{"text":"{}"}]}\n'
            })
          : run()
      )
    ).toContain('Granola acquisition plan')
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

  test('rejects malformed request timing and incomplete multi-meeting detail batches', async () => {
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
    batch.setRunner((executable, arguments_, environment) => {
      const tool = (arguments_[1] ?? '').replace('granola.', '')
      if (tool === 'get_meetings')
        return Promise.resolve({
          exitCode: 0,
          output: '{"meetings":[{"id":"meeting-a","title":"A","date":"2026-01-02"}]}\n'
        })
      return base(executable, arguments_, environment)
    })
    expect((await batch.run(command(batchRepository))).output).toContain(
      'meeting detail did not account for requested identity meeting-b'
    )
  })

  test.each([
    { name: 'non-JSON', content: 'not-json', expected: 'ledger is not valid JSON' },
    { name: 'non-object', content: '[]', expected: 'ledger is malformed' },
    { name: 'wrong top-level shape', content: '{"schema":2}', expected: 'ledger is malformed' },
    {
      name: 'wrong meeting shape',
      content: JSON.stringify({
        schema: 1,
        provider: 'granola',
        account_sha256: 'account',
        source_schema_sha256: 'schema',
        identity_checkpoint_sha256: 'identity',
        interval: { since: '2026-01-01', until: '2026-01-03' },
        exhaustive: true,
        windows: [],
        meetings: { bad: null },
        updated_at: '2026-01-04T00:00:00.000Z'
      }),
      expected: 'ledger meeting bad is malformed'
    }
  ])('rejects a $name receiver ledger', async ({ content, expected }) => {
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
    await writeFile(join(repository, '+/_ACQUIRE/granola/ledger.json'), content)
    box.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    const result = await box.run(command(repository))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(expected)
  })

  test('migrates a verified legacy package and refuses legacy meetings outside receiver scope', async () => {
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
    const legacy = await writeLegacyPackage(repository)
    box.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )

    const migrated = await box.run(command(repository))

    expect(migrated.exitCode, migrated.output).toBe(0)
    expect(
      (JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as { schema: number }).schema
    ).toBe(2)
    expect(await lstat(join(legacy.base, legacy.version)).catch(() => undefined)).toBeUndefined()

    const outside = await sandbox()
    const outsideRepository = await outside.root.mkdir('target')
    await setupReceivers(outside, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: outsideRepository,
        unfoldered: true
      }
    ])
    await writeLegacyPackage(outsideRepository, 'meeting-old')
    outside.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-new', date: '2026-01-02', title: 'New' }] }).runner
    )
    expect((await outside.run(command(outsideRepository))).output).toContain(
      'legacy ledger meeting meeting-old is outside the current receiver scope'
    )
  })

  test.each([
    {
      name: 'missing package directory',
      expected: 'KEP directory is not a physical directory',
      mutate: async (base: string, version: string) => rm(join(base, version), { recursive: true })
    },
    {
      name: 'linked package directory',
      expected: 'KEP directory is not a physical directory',
      mutate: async (base: string, version: string) => {
        const directory = join(base, version)
        const target = join(base, 'linked-target')
        await rm(directory, { recursive: true })
        await mkdir(target)
        await symlink(target, directory)
      }
    },
    {
      name: 'missing manifest',
      expected: 'KEP checksum manifest is missing',
      mutate: async (base: string, version: string) => rm(join(base, version, 'checksums/sha256sums.txt'))
    },
    {
      name: 'unterminated manifest',
      expected: 'KEP checksum manifest is malformed',
      mutate: async (base: string, version: string) =>
        writeFile(join(base, version, 'checksums/sha256sums.txt'), `${'0'.repeat(64)}  source/originals/listing.json`)
    },
    {
      name: 'unsafe manifest path',
      expected: 'KEP checksum manifest is malformed',
      mutate: async (base: string, version: string) =>
        writeFile(join(base, version, 'checksums/sha256sums.txt'), `${'0'.repeat(64)}  ../listing.json\n`)
    },
    {
      name: 'missing payload file',
      expected: 'KEP payload file is missing',
      mutate: async (base: string, version: string) => rm(join(base, version, 'source/originals/listing.json'))
    },
    {
      name: 'changed payload file',
      expected: 'KEP payload checksum differs',
      mutate: async (base: string, version: string) =>
        writeFile(join(base, version, 'source/originals/listing.json'), '{"changed":true}\n')
    },
    {
      name: 'content-address mismatch',
      expected: 'KEP payload checksum does not match its content-addressed directory',
      mutate: async (base: string, version: string) => {
        const content = '{"changed":true}\n'
        await writeFile(join(base, version, 'source/originals/listing.json'), content)
        await writeFile(
          join(base, version, 'checksums/sha256sums.txt'),
          `${sha256(content)}  source/originals/listing.json\n`
        )
      }
    },
    {
      name: 'missing metadata',
      expected: 'KEP metadata is missing',
      mutate: async (base: string, version: string) => rm(join(base, version, 'kep.toml'))
    },
    {
      name: 'mismatched metadata',
      expected: 'KEP metadata payload checksum differs',
      mutate: async (base: string, version: string) =>
        writeFile(join(base, version, 'kep.toml'), 'payload_sha256 = "different"\n')
    }
  ])('refuses legacy $name', async ({ expected, mutate }) => {
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
    const { base, version } = await writeLegacyPackage(repository)
    await mutate(base, version)
    box.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )

    const result = await box.run(command(repository))

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(expected)
  })

  test('rejects a non-file ledger and changed account while retaining folder-only identities', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: repository,
        folderIds: ['folder-a'],
        unfoldered: true
      }
    ])
    await mkdir(join(repository, '+/_ACQUIRE/granola/ledger.json'), { recursive: true })
    box.setRunner(granolaFixtureRunner({ meetings: [], folders: [{ id: 'folder-a', title: 'A' }] }).runner)
    const nonFile = await box.run(command(repository))
    expect(nonFile.output).toContain('ledger must be a physical file')

    const separate = await sandbox()
    const secondRepository = await separate.root.mkdir('target')
    await setupReceivers(separate, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: secondRepository,
        unfoldered: true
      }
    ])
    const fixture = { meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }
    separate.setRunner(granolaFixtureRunner(fixture).runner)
    expect((await separate.run(command(secondRepository))).exitCode).toBe(0)
    separate.setRunner(granolaFixtureRunner({ ...fixture, account: { account: 'different' } }).runner)
    const account = await separate.run(command(secondRepository))
    expect(account.output).toContain('account differs from receiver ledger')

    const third = await sandbox()
    const thirdRepository = await third.root.mkdir('target')
    await setupReceivers(third, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: thirdRepository,
        folderIds: ['folder-a']
      }
    ])
    const extra: GranolaMeetingFixture = {
      id: 'meeting-extra',
      date: '2026-01-02',
      title: 'Extra',
      folderIds: ['folder-a'],
      detailUnavailable: true,
      transcript: null
    }
    third.setRunner(
      granolaFixtureRunner({
        meetings: [extra],
        folders: [{ id: 'folder-a', title: 'A' }],
        onList: ({ folderId }) => (folderId ? [extra] : [])
      }).runner
    )
    const folderOnly = await third.run(command(thirdRepository))
    expect(folderOnly.exitCode, folderOnly.output).toBe(0)
    expect(folderOnly.output).toContain('Coverage: 1 discovered, 1 selected, 0 routed elsewhere')
    expect(folderOnly.output).toContain('Omissions: 1 meetings with unavailable detail or transcript')
    const [folderOnlyPackage] = await packageDirectories(thirdRepository)
    expect(await third.root.read(`target/+/_ACQUIRE/granola/${folderOnlyPackage}`)).toContain('  - "meeting_detail"')
  })

  test('rejects unsupported and malformed current ledgers plus changed document identity', async () => {
    const malformedFields = [
      'path',
      'latest_content_sha256',
      'latest_source_sha256',
      'versions',
      'folder_ids',
      'inferred_unfoldered',
      'acquired_at'
    ] as const
    for (const field of malformedFields) {
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
        granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
      )
      expect((await box.run(command(repository))).exitCode).toBe(0)
      const ledgerPath = join(repository, '+/_ACQUIRE/granola/ledger.json')
      const ledger = JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
        meetings: Record<string, Record<string, unknown>>
      }
      ;(ledger.meetings['meeting-a'] as Record<string, unknown>)[field] = null
      await writeFile(ledgerPath, `${JSON.stringify(ledger)}\n`)
      expect((await box.run(command(repository))).output).toContain('ledger meeting meeting-a is malformed')
    }

    const unsupported = await sandbox()
    const unsupportedRepository = await unsupported.root.mkdir('target')
    await setupReceivers(unsupported, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: unsupportedRepository,
        unfoldered: true
      }
    ])
    await mkdir(join(unsupportedRepository, '+/_ACQUIRE/granola'), { recursive: true })
    await writeFile(
      join(unsupportedRepository, '+/_ACQUIRE/granola/ledger.json'),
      `${JSON.stringify({
        schema: 3,
        provider: 'granola',
        account_sha256: 'account',
        source_schema_sha256: 'schema',
        identity_checkpoint_sha256: 'identity',
        interval: { since: '2026-01-01', until: '2026-01-03' },
        exhaustive: true,
        windows: [],
        meetings: {},
        updated_at: '2026-01-04T00:00:00.000Z'
      })}\n`
    )
    unsupported.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    expect((await unsupported.run(command(unsupportedRepository))).output).toContain('ledger has unsupported schema')

    const unsafePath = await sandbox()
    const unsafePathRepository = await unsafePath.root.mkdir('target')
    await setupReceivers(unsafePath, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: unsafePathRepository,
        unfoldered: true
      }
    ])
    unsafePath.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )
    expect((await unsafePath.run(command(unsafePathRepository))).exitCode).toBe(0)
    const unsafeLedgerPath = join(unsafePathRepository, '+/_ACQUIRE/granola/ledger.json')
    const unsafeLedger = JSON.parse(await unsafePath.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { path: string }>
    }
    ;(unsafeLedger.meetings['meeting-a'] as { path: string }).path = '../unsafe.md'
    await writeFile(unsafeLedgerPath, `${JSON.stringify(unsafeLedger)}\n`)
    expect((await unsafePath.run(command(unsafePathRepository))).output).toContain('has unsafe path')

    const identity = await sandbox()
    const identityRepository = await identity.root.mkdir('target')
    await setupReceivers(identity, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: identityRepository,
        unfoldered: true
      }
    ])
    identity.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )
    expect((await identity.run(command(identityRepository))).exitCode).toBe(0)
    const identityLedgerPath = join(identityRepository, '+/_ACQUIRE/granola/ledger.json')
    const identityLedger = JSON.parse(await identity.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { path: string; latest_content_sha256: string }>
    }
    const meeting = identityLedger.meetings['meeting-a']
    expect(meeting).toBeDefined()
    const documentPath = join(identityRepository, '+/_ACQUIRE/granola', meeting?.path as string)
    const changed = (await identity.root.read(`target/+/_ACQUIRE/granola/${meeting?.path}`)).replace(
      'source_id: "meeting-a"',
      'source_id: "meeting-b"'
    )
    await writeFile(documentPath, changed)
    ;(meeting as { latest_content_sha256: string }).latest_content_sha256 = sha256(changed)
    await writeFile(identityLedgerPath, `${JSON.stringify(identityLedger)}\n`)
    expect((await identity.run(command(identityRepository))).output).toContain('identity differs from ledger')
  })

  test('guards recovered and renamed meeting documents without retaining stale paths', async () => {
    for (const acquiredAt of ['absent', 'invalid']) {
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
      const base = join(repository, '+/_ACQUIRE/granola')
      await mkdir(base, { recursive: true })
      await writeFile(
        join(base, '2026-01-02--meeting--meeting-a.md'),
        acquiredAt === 'invalid' ? 'acquired_at: "\\u"\n' : '# Existing\n'
      )
      box.setRunner(
        granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
      )
      expect((await box.run(command(repository))).output).toContain('already exists with different content')
    }

    const unsafeRecovery = await sandbox()
    const unsafeRecoveryRepository = await unsafeRecovery.root.mkdir('target')
    await setupReceivers(unsafeRecovery, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: unsafeRecoveryRepository,
        unfoldered: true
      }
    ])
    await mkdir(join(unsafeRecoveryRepository, '+/_ACQUIRE/granola/2026-01-02--meeting--meeting-a.md'), {
      recursive: true
    })
    unsafeRecovery.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )
    expect((await unsafeRecovery.run(command(unsafeRecoveryRepository))).output).toContain('is unsafe')

    const renamed = await sandbox()
    const renamedRepository = await renamed.root.mkdir('target')
    await setupReceivers(renamed, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: renamedRepository,
        unfoldered: true
      }
    ])
    renamed.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Old title' }] }).runner
    )
    expect((await renamed.run(command(renamedRepository))).exitCode).toBe(0)
    const [oldPath] = await packageDirectories(renamedRepository)
    renamed.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'New title' }] }).runner
    )
    expect((await renamed.run(command(renamedRepository))).exitCode).toBe(0)
    expect(await packageDirectories(renamedRepository)).toEqual(['2026-01-02--new-title--meeting-a.md'])
    expect(
      await lstat(join(renamedRepository, '+/_ACQUIRE/granola', oldPath as string)).catch(() => undefined)
    ).toBeUndefined()

    for (const kind of ['directory', 'file']) {
      const collision = await sandbox()
      const collisionRepository = await collision.root.mkdir('target')
      await setupReceivers(collision, [
        {
          key: 'target',
          repository: 'https://github.com/example/target',
          path: collisionRepository,
          unfoldered: true
        }
      ])
      collision.setRunner(
        granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Old title' }] }).runner
      )
      expect((await collision.run(command(collisionRepository))).exitCode).toBe(0)
      const collisionPath = join(collisionRepository, '+/_ACQUIRE/granola/2026-01-02--new-title--meeting-a.md')
      if (kind === 'directory') await mkdir(collisionPath)
      else await writeFile(collisionPath, '# Occupied\n')
      collision.setRunner(
        granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'New title' }] }).runner
      )
      const result = await collision.run(command(collisionRepository))
      expect(result.output).toContain(kind === 'directory' ? 'is unsafe' : 'already exists with different content')
    }
  })
  test.each([
    {
      name: 'missing meeting document',
      expected: 'must be a physical file',
      mutate: async (documentPath: string) => rm(documentPath)
    },
    {
      name: 'symbolic meeting document',
      expected: 'must be a physical file',
      mutate: async (documentPath: string, repository: string) => {
        await rm(documentPath)
        await symlink(repository, documentPath)
      }
    },
    {
      name: 'changed meeting document',
      expected: 'checksum differs from ledger',
      mutate: async (documentPath: string) => writeFile(documentPath, '# Changed\n')
    }
  ])('refuses $name when reconciling', async ({ expected, mutate }) => {
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
    const fixture = { meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }
    box.setRunner(granolaFixtureRunner(fixture).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const [document] = await packageDirectories(repository)
    expect(document).toBeDefined()
    await mutate(join(repository, '+/_ACQUIRE/granola', document as string), repository)

    const reconciled = await box.run(command(repository))

    expect(reconciled.exitCode).toBe(1)
    expect(reconciled.output).toContain(expected)
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

  test('resumes verified packages after interruption and refuses corrupted staged evidence', async () => {
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
    const meetings = Array.from({ length: 11 }, (_, index) => ({
      id: `meeting-${String(index).padStart(2, '0')}`,
      date: '2026-01-01',
      title: `Meeting ${index}`
    }))
    const source = granolaFixtureRunner({ meetings, failDetailOnce: 'meeting-10' })
    box.setRunner(source.runner)
    const interrupted = await box.run(command(repository))
    expect(interrupted.exitCode).toBe(1)
    expect(await packageDirectories(repository)).toHaveLength(10)
    expect(await lstat(join(repository, '+/_ACQUIRE/granola/ledger.json')).catch(() => undefined)).toBeUndefined()

    const resumed = await box.run(command(repository))
    expect(resumed.exitCode, resumed.output).toBe(0)
    expect(await packageDirectories(repository)).toHaveLength(11)
    const ledger = JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { path: string }>
    }
    const corrupted = ledger.meetings['meeting-00']?.path
    expect(corrupted).toBeDefined()
    await box.root.write(`target/+/_ACQUIRE/granola/${corrupted}`, '# Corrupt\n')
    const refused = await box.run(command(repository))
    expect(refused.exitCode).toBe(1)
    expect(refused.output).toContain('checksum differs from ledger')
  })
})
