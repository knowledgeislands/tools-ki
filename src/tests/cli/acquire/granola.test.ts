import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
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
    '[skills.ki-acquire-granola]',
    ...(receiver.folderIds ? [`folder_ids = ${JSON.stringify(receiver.folderIds)}`] : []),
    ...(receiver.duplicateFolderIds ? [`duplicate_folder_ids = ${JSON.stringify(receiver.duplicateFolderIds)}`] : []),
    ...(receiver.unfoldered === undefined ? [] : [`unfoldered = ${receiver.unfoldered}`]),
    ...(receiver.residual === undefined ? [] : [`residual = ${receiver.residual}`]),
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
      'ki-acquire-actions: [import, status, reconcile, reset]',
      'ki-acquire-repository-properties: [folder_ids, duplicate_folder_ids, unfoldered, residual]',
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

const firstRecord = (value: unknown): JsonRecord => Object.values(value as JsonRecord)[0] as JsonRecord

const checkpointMeeting = (checkpoint: JsonRecord): JsonRecord => firstRecord(checkpoint['meetings'])

const checkpointDisposition = (checkpoint: JsonRecord): JsonRecord =>
  checkpointMeeting(checkpoint)['disposition'] as JsonRecord

const checkpointCorruptions: readonly {
  readonly name: string
  readonly mutate: (checkpoint: JsonRecord) => void
}[] = [
  {
    name: 'schema',
    mutate: (value) => {
      value['schema'] = 4
    }
  },
  {
    name: 'adapter',
    mutate: (value) => {
      value['adapter'] = 'other'
    }
  },
  {
    name: 'provider',
    mutate: (value) => {
      value['provider'] = 'other'
    }
  },
  {
    name: 'generation',
    mutate: (value) => {
      value['generation'] = null
    }
  },
  {
    name: 'repository',
    mutate: (value) => {
      value['repository'] = null
    }
  },
  {
    name: 'account',
    mutate: (value) => {
      value['account_sha256'] = null
    }
  },
  {
    name: 'source schema',
    mutate: (value) => {
      value['source_schema_sha256'] = null
    }
  },
  {
    name: 'identity',
    mutate: (value) => {
      value['identity_checkpoint_sha256'] = null
    }
  },
  {
    name: 'interval',
    mutate: (value) => {
      value['interval'] = null
    }
  },
  {
    name: 'exhaustive',
    mutate: (value) => {
      value['exhaustive'] = false
    }
  },
  {
    name: 'windows',
    mutate: (value) => {
      value['windows'] = null
    }
  },
  {
    name: 'meetings',
    mutate: (value) => {
      value['meetings'] = null
    }
  },
  {
    name: 'updated timestamp',
    mutate: (value) => {
      value['updated_at'] = null
    }
  },
  {
    name: 'meeting path',
    mutate: (value) => {
      checkpointMeeting(value)['path'] = null
    }
  },
  {
    name: 'meeting document hash',
    mutate: (value) => {
      checkpointMeeting(value)['document_sha256'] = null
    }
  },
  {
    name: 'meeting detail hash',
    mutate: (value) => {
      checkpointMeeting(value)['detail_sha256'] = null
    }
  },
  {
    name: 'transcript state',
    mutate: (value) => {
      checkpointMeeting(value)['transcript_state'] = 'unknown'
    }
  },
  {
    name: 'transcript retry count',
    mutate: (value) => {
      checkpointMeeting(value)['transcript_retry_count'] = 'one'
    }
  },
  {
    name: 'meeting versions',
    mutate: (value) => {
      checkpointMeeting(value)['versions'] = null
    }
  },
  {
    name: 'meeting folders',
    mutate: (value) => {
      checkpointMeeting(value)['folder_ids'] = null
    }
  },
  {
    name: 'meeting unfoldered evidence',
    mutate: (value) => {
      checkpointMeeting(value)['inferred_unfoldered'] = null
    }
  },
  {
    name: 'meeting acquired timestamp',
    mutate: (value) => {
      checkpointMeeting(value)['acquired_at'] = null
    }
  },
  {
    name: 'meeting disposition',
    mutate: (value) => {
      checkpointMeeting(value)['disposition'] = null
    }
  },
  {
    name: 'disposition state',
    mutate: (value) => {
      checkpointDisposition(value)['state'] = 'unknown'
    }
  },
  {
    name: 'disposition document hash',
    mutate: (value) => {
      checkpointDisposition(value)['document_sha256'] = null
    }
  },
  {
    name: 'disposition timestamp',
    mutate: (value) => {
      checkpointDisposition(value)['disposed_at'] = null
    }
  },
  {
    name: 'disposition source version',
    mutate: (value) => {
      checkpointDisposition(value)['source_version_sha256'] = null
    }
  },
  {
    name: 'component document mismatch',
    mutate: (value) => {
      checkpointDisposition(value)['document_sha256'] = 'different'
    }
  },
  {
    name: 'available transcript missing hash',
    mutate: (value) => {
      checkpointMeeting(value)['transcript_sha256'] = undefined
    }
  },
  {
    name: 'available transcript retry count',
    mutate: (value) => {
      checkpointMeeting(value)['transcript_retry_count'] = 1
    }
  },
  {
    name: 'invalid optional disposition field',
    mutate: (value) => {
      checkpointDisposition(value)['canonical_destination'] = 1
    }
  }
]

const journalComponent = (journal: JsonRecord): JsonRecord => firstRecord(journal['components'])

const journalFailureRecord = (journal: JsonRecord): JsonRecord => (journal['failures'] as JsonRecord[])[0] as JsonRecord

const journalCorruptions: readonly {
  readonly name: string
  readonly mutate: (journal: JsonRecord) => void
}[] = [
  {
    name: 'schema',
    mutate: (value) => {
      value['schema'] = 2
    }
  },
  {
    name: 'phase',
    mutate: (value) => {
      value['phase'] = 'complete'
    }
  },
  {
    name: 'adapter',
    mutate: (value) => {
      value['adapter'] = 'other'
    }
  },
  {
    name: 'run identity',
    mutate: (value) => {
      value['run_id'] = null
    }
  },
  {
    name: 'repository',
    mutate: (value) => {
      value['repository'] = null
    }
  },
  {
    name: 'account',
    mutate: (value) => {
      value['account_sha256'] = null
    }
  },
  {
    name: 'source schema',
    mutate: (value) => {
      value['source_schema_sha256'] = null
    }
  },
  {
    name: 'interval',
    mutate: (value) => {
      value['discovery_interval'] = null
    }
  },
  {
    name: 'identity',
    mutate: (value) => {
      value['identity_checkpoint_sha256'] = null
    }
  },
  {
    name: 'selected identities',
    mutate: (value) => {
      value['selected_identities'] = null
    }
  },
  {
    name: 'selected identity value',
    mutate: (value) => {
      value['selected_identities'] = [1]
    }
  },
  {
    name: 'components',
    mutate: (value) => {
      value['components'] = null
    }
  },
  {
    name: 'remaining identities',
    mutate: (value) => {
      value['remaining_identities'] = null
    }
  },
  {
    name: 'failures',
    mutate: (value) => {
      value['failures'] = null
    }
  },
  {
    name: 'retry state',
    mutate: (value) => {
      value['retry_state'] = null
    }
  },
  {
    name: 'created timestamp',
    mutate: (value) => {
      value['created_at'] = null
    }
  },
  {
    name: 'updated timestamp',
    mutate: (value) => {
      value['updated_at'] = null
    }
  },
  {
    name: 'component detail hash',
    mutate: (value) => {
      journalComponent(value)['detail_sha256'] = null
    }
  },
  {
    name: 'component transcript state',
    mutate: (value) => {
      journalComponent(value)['transcript_state'] = 'unknown'
    }
  },
  {
    name: 'component path',
    mutate: (value) => {
      journalComponent(value)['staged_document_path'] = null
    }
  },
  {
    name: 'component document hash',
    mutate: (value) => {
      journalComponent(value)['staged_document_sha256'] = null
    }
  },
  {
    name: 'component timestamp',
    mutate: (value) => {
      journalComponent(value)['verified_at'] = null
    }
  },
  {
    name: 'component checkpoint',
    mutate: (value) => {
      journalComponent(value)['checkpoint'] = null
    }
  },
  {
    name: 'failure record',
    mutate: (value) => {
      ;(value['failures'] as unknown[])[0] = null
    }
  },
  {
    name: 'failure source',
    mutate: (value) => {
      journalFailureRecord(value)['source_id'] = null
    }
  },
  {
    name: 'failure message',
    mutate: (value) => {
      journalFailureRecord(value)['message'] = null
    }
  },
  {
    name: 'failure attempts',
    mutate: (value) => {
      journalFailureRecord(value)['attempts'] = null
    }
  },
  {
    name: 'failure timestamp',
    mutate: (value) => {
      journalFailureRecord(value)['observed_at'] = null
    }
  },
  {
    name: 'retry count',
    mutate: (value) => {
      value['retry_state'] = { 'meeting-00': 'one' }
    }
  },
  {
    name: 'component and checkpoint mismatch',
    mutate: (value) => {
      journalComponent(value)['detail_sha256'] = 'different'
    }
  },
  {
    name: 'duplicate selected identity',
    mutate: (value) => {
      value['selected_identities'] = ['meeting-00', 'meeting-00']
    }
  },
  {
    name: 'remaining identity outside selection',
    mutate: (value) => {
      value['remaining_identities'] = ['other']
    }
  },
  {
    name: 'component remains pending',
    mutate: (value) => {
      value['remaining_identities'] = ['meeting-00']
    }
  },
  {
    name: 'retry identity outside selection',
    mutate: (value) => {
      value['retry_state'] = { other: 1 }
    }
  },
  {
    name: 'failure identity outside selection',
    mutate: (value) => {
      journalFailureRecord(value)['source_id'] = 'other'
    }
  },
  {
    name: 'selected identity unaccounted',
    mutate: (value) => {
      value['components'] = {}
    }
  }
]

const packageDirectories = async (repository: string): Promise<readonly string[]> =>
  (await readdir(join(repository, '+/_ACQUIRE/granola'), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort()

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

describe('[ki acquire import --adapter granola]', () => {
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
    const repeated = await box.run(command(repository, '--refresh-transcripts'), {
      now: () => Date.parse('2026-01-05T12:00:00Z')
    })
    expect(repeated.output).toContain('Meetings: 0 new, 0 amended, 2 unchanged')
    expect(repeated.output).toContain('Checkpoint: unchanged')
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
    expect(omitted.output).toContain('Transcripts: 1 provider reads, 1 omissions')
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
    expect(result.output).toContain('1 omissions')
    expect(detailCalls).toEqual([['meeting-a', 'meeting-b'], ['meeting-b']])
  })

  test.each([
    { name: 'non-JSON', content: 'not-json', expected: 'checkpoint is not valid JSON' },
    { name: 'non-object', content: '[]', expected: 'checkpoint malformed' },
    { name: 'wrong top-level shape', content: '{"schema":2}', expected: 'checkpoint malformed' },
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
      expected: 'checkpoint malformed'
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

  test.each(checkpointCorruptions)('rejects corrupt current checkpoint $name', async ({ mutate }) => {
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
    const path = join(repository, '+/_ACQUIRE/granola/ledger.json')
    const checkpoint = JSON.parse(await readFile(path, 'utf8')) as JsonRecord
    mutate(checkpoint)
    await writeFile(path, `${JSON.stringify(checkpoint)}\n`)
    const status = await box.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository])
    expect(status.exitCode).toBe(1)
    expect(status.output).toContain('checkpoint')
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
    expect(refused.output).toContain('disposed document checksum differs')
  })

  test('separates mutable detail from cached transcripts and supports explicit refresh', async () => {
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

    const changedSource = granolaFixtureRunner({
      meetings: [{ ...original, detail: { summary: 'Changed notes' } }]
    })
    box.setRunner(changedSource.runner)
    const changed = await box.run(command(repository))
    expect(changed.exitCode, changed.output).toBe(0)
    expect(changed.output).toContain('Meetings: 0 new, 1 amended, 0 unchanged')
    expect(changedSource.calls.filter((call) => call.tool === 'get_meeting_transcript')).toHaveLength(0)
    const ledger = JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { detail_sha256: string; transcript_sha256: string; transcript_state: string }>
    }
    expect(ledger.meetings['meeting-a']?.detail_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(ledger.meetings['meeting-a']?.transcript_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(ledger.meetings['meeting-a']?.transcript_state).toBe('available')

    const refreshSource = granolaFixtureRunner({ meetings: [{ ...original, detail: { summary: 'Changed notes' } }] })
    box.setRunner(refreshSource.runner)
    const refreshed = await box.run(command(repository, '--refresh-transcripts'))
    expect(refreshed.exitCode, refreshed.output).toBe(0)
    expect(refreshSource.calls.filter((call) => call.tool === 'get_meeting_transcript')).toHaveLength(1)
    expect(refreshSource.calls.every((call) => !/(archive|delete|move|tag|update)/i.test(call.tool))).toBe(true)
  })

  test('retries unavailable transcripts to availability and then records bounded durable omission', async () => {
    const availableBox = await sandbox()
    const availableRepository = await availableBox.root.mkdir('target')
    await setupReceivers(availableBox, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: availableRepository,
        unfoldered: true
      }
    ])
    const unavailable: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting',
      transcript: null
    }
    availableBox.setRunner(granolaFixtureRunner({ meetings: [unavailable] }).runner)
    expect((await availableBox.run(command(availableRepository))).exitCode).toBe(0)
    const recoveredSource = granolaFixtureRunner({
      meetings: [{ ...unavailable, transcript: { transcript: 'Now available' } }]
    })
    availableBox.setRunner(recoveredSource.runner)
    expect((await availableBox.run(command(availableRepository))).exitCode).toBe(0)
    const recoveredLedger = JSON.parse(await availableBox.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { transcript_state: string }>
    }
    expect(recoveredLedger.meetings['meeting-a']?.transcript_state).toBe('available')

    const omittedBox = await sandbox()
    const omittedRepository = await omittedBox.root.mkdir('target')
    await setupReceivers(omittedBox, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: omittedRepository,
        unfoldered: true
      }
    ])
    for (let attempt = 0; attempt < 3; attempt += 1) {
      omittedBox.setRunner(granolaFixtureRunner({ meetings: [unavailable] }).runner)
      expect((await omittedBox.run(command(omittedRepository))).exitCode).toBe(0)
    }
    const bounded = granolaFixtureRunner({ meetings: [unavailable] })
    omittedBox.setRunner(bounded.runner)
    expect((await omittedBox.run(command(omittedRepository))).exitCode).toBe(0)
    expect(bounded.calls.filter((call) => call.tool === 'get_meeting_transcript')).toHaveLength(0)
    const omittedLedger = JSON.parse(await omittedBox.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { transcript_state: string; transcript_retry_count: number }>
    }
    expect(omittedLedger.meetings['meeting-a']).toMatchObject({
      transcript_state: 'durable-omission',
      transcript_retry_count: 3
    })
  })

  test('rejects corrupt and incompatible journals without advancing checkpoint', async () => {
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
    await writeFile(join(repository, '+/_ACQUIRE/granola/journal.json'), 'not-json')
    box.setRunner(
      granolaFixtureRunner({ meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }] }).runner
    )
    const corrupt = await box.run(command(repository))
    expect(corrupt.exitCode).toBe(1)
    expect(corrupt.output).toContain('journal is not valid JSON')
    expect(await lstat(join(repository, '+/_ACQUIRE/granola/ledger.json')).catch(() => undefined)).toBeUndefined()

    await rm(join(repository, '+/_ACQUIRE/granola/journal.json'))
    const meetings = Array.from({ length: 11 }, (_, index) => ({
      id: `meeting-${String(index).padStart(2, '0')}`,
      date: '2026-01-02',
      title: `Meeting ${index}`
    }))
    box.setRunner(granolaFixtureRunner({ meetings, failDetailOnce: 'meeting-10' }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(1)
    box.setRunner(granolaFixtureRunner({ meetings }).runner)
    const incompatible = await box.run([
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
      '2026-01-03'
    ])
    expect(incompatible.exitCode).toBe(1)
    expect(incompatible.output).toContain('journal is stale or incompatible')
    expect(await lstat(join(repository, '+/_ACQUIRE/granola/ledger.json')).catch(() => undefined)).toBeUndefined()
  })

  test.each(journalCorruptions)('rejects corrupt journal $name', async ({ mutate }) => {
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
      date: '2026-01-02',
      title: `Meeting ${index}`
    }))
    box.setRunner(granolaFixtureRunner({ meetings, failDetailOnce: 'meeting-10' }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(1)
    const path = join(repository, '+/_ACQUIRE/granola/journal.json')
    const journal = JSON.parse(await readFile(path, 'utf8')) as JsonRecord
    mutate(journal)
    await writeFile(path, `${JSON.stringify(journal)}\n`)
    const status = await box.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository])
    expect(status.exitCode).toBe(1)
    expect(status.output).toContain('journal')
  })

  test('previews and confirms scoped reset without provider access', async () => {
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
      meetings: [{ id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }]
    })
    box.setRunner(source.runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const calls = source.calls.length
    const reset = ['ki', 'acquire', 'reset', '--adapter', 'granola', '--repo', repository]
    const plan = await box.run(reset)
    expect(plan.exitCode).toBe(0)
    expect(plan.output).toContain('No changes made; repeat with --confirm.')
    expect((await lstat(join(repository, '+/_ACQUIRE/granola/ledger.json'))).isFile()).toBe(true)
    const applied = await box.run([...reset, '--confirm'])
    expect(applied.exitCode, applied.output).toBe(0)
    expect(applied.output).toContain('Provider data will not be changed.')
    expect(await lstat(join(repository, '+/_ACQUIRE/granola/ledger.json')).catch(() => undefined)).toBeUndefined()
    expect(source.calls).toHaveLength(calls)
  })

  test('reports status, reconciles checkpoints, and exposes in-progress recovery state', async () => {
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
    const statusCommand = ['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository]
    const absent = await box.run(statusCommand)
    expect(absent.exitCode, absent.output).toBe(0)
    expect(absent.output).toContain('Checkpoint: absent')
    expect(absent.output).toContain('Disposition: none')
    expect(absent.output).toContain('Journal: absent')
    const missingReconcile = await box.run(['ki', 'acquire', 'reconcile', '--adapter', 'granola', '--repo', repository])
    expect(missingReconcile.exitCode).toBe(1)
    expect(missingReconcile.output).toContain('checkpoint is absent')

    const meetings = Array.from({ length: 11 }, (_, index) => ({
      id: `meeting-${String(index).padStart(2, '0')}`,
      date: '2026-01-02',
      title: `Meeting ${index}`
    }))
    box.setRunner(granolaFixtureRunner({ meetings, failDetailOnce: 'meeting-10' }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(1)
    const interrupted = await box.run(statusCommand)
    expect(interrupted.output).toContain('Journal: in-progress · 1 remaining, 1 failures')

    box.setRunner(granolaFixtureRunner({ meetings }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const current = await box.run(statusCommand)
    expect(current.output).toContain('Checkpoint: current · ')
    expect(current.output).toContain('Disposition: staged=11')
    const reconciled = await box.run(['ki', 'acquire', 'reconcile', '--adapter', 'granola', '--repo', repository])
    expect(reconciled.exitCode, reconciled.output).toBe(0)
    expect(reconciled.output).toContain('Meetings: 11')
  })

  test('migrates the committed schema-two checkpoint used by completed receivers', async () => {
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
    const meeting: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting',
      transcript: { transcript: 'Speaker: historical' }
    }
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const path = join(repository, '+/_ACQUIRE/granola/ledger.json')
    const current = JSON.parse(await readFile(path, 'utf8')) as {
      account_sha256: string
      source_schema_sha256: string
      identity_checkpoint_sha256: string
      interval: { since: string; until: string }
      windows: unknown[]
      updated_at: string
      meetings: Record<
        string,
        {
          path: string
          document_sha256: string
          detail_sha256: string
          versions: string[]
          folder_ids: string[]
          inferred_unfoldered: boolean
          acquired_at: string
        }
      >
    }
    const historical = current.meetings['meeting-a']
    await writeFile(
      path,
      `${JSON.stringify(
        {
          schema: 2,
          provider: 'granola',
          account_sha256: current.account_sha256,
          source_schema_sha256: current.source_schema_sha256,
          identity_checkpoint_sha256: current.identity_checkpoint_sha256,
          interval: current.interval,
          exhaustive: true,
          windows: current.windows,
          meetings: {
            'meeting-a': {
              path: historical?.path,
              latest_content_sha256: historical?.document_sha256,
              latest_source_sha256: historical?.detail_sha256,
              versions: historical?.versions,
              folder_ids: historical?.folder_ids,
              inferred_unfoldered: historical?.inferred_unfoldered,
              acquired_at: historical?.acquired_at
            }
          },
          updated_at: current.updated_at
        },
        null,
        2
      )}\n`
    )
    const status = await box.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository])
    expect(status.exitCode, status.output).toBe(0)
    expect(status.output).toContain('Checkpoint: legacy')
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    expect((JSON.parse(await readFile(path, 'utf8')) as { schema: number }).schema).toBe(3)

    const malformed = { schema: 2, provider: 'granola', meetings: { bad: null } }
    await writeFile(path, `${JSON.stringify(malformed)}\n`)
    box.setRunner(granolaFixtureRunner({ meetings: [] }).runner)
    expect((await box.run(command(repository))).output).toContain('legacy checkpoint malformed')
  })

  test('applies source, component, and rebuild reset scopes with validation', async () => {
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
    const meeting: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting',
      transcript: { transcript: 'Speaker: hello' }
    }
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const reset = ['ki', 'acquire', 'reset', '--adapter', 'granola', '--repo', repository]
    expect((await box.run([...reset, '--component', 'transcript'])).output).toContain('--component requires --source')
    expect((await box.run([...reset, '--component', 'unknown', '--source', 'meeting-a'])).output).toContain(
      '--component must be detail or transcript'
    )
    expect((await box.run([...reset, '--rebuild', '--source', 'meeting-a'])).output).toContain(
      '--rebuild cannot be combined'
    )
    expect((await box.run([...reset, '--source', 'missing', '--confirm'])).output).toContain('has no source missing')

    const transcript = await box.run([...reset, '--source', 'meeting-a', '--component', 'transcript', '--confirm'])
    expect(transcript.exitCode, transcript.output).toBe(0)
    const transcriptLedger = JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { transcript_state: string; transcript_sha256?: string }>
    }
    expect(transcriptLedger.meetings['meeting-a']).toMatchObject({ transcript_state: 'retrying' })
    expect(transcriptLedger.meetings['meeting-a']?.transcript_sha256).toBeUndefined()

    expect((await box.run([...reset, '--source', 'meeting-a', '--component', 'detail', '--confirm'])).exitCode).toBe(0)
    const detailLedger = JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, { detail_sha256: string }>
    }
    expect(detailLedger.meetings['meeting-a']?.detail_sha256).toBe('')

    expect((await box.run([...reset, '--source', 'meeting-a', '--confirm'])).exitCode).toBe(0)
    const sourceLedger = JSON.parse(await box.root.read('target/+/_ACQUIRE/granola/ledger.json')) as {
      meetings: Record<string, unknown>
    }
    expect(sourceLedger.meetings['meeting-a']).toBeUndefined()

    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const rebuilt = await box.run([...reset, '--rebuild', '--confirm'])
    expect(rebuilt.exitCode, rebuilt.output).toBe(0)
    expect(rebuilt.output).toContain('complete rebuild')
    expect(await lstat(join(repository, '+/_ACQUIRE/granola')).catch(() => undefined)).toBeUndefined()
  })

  test('accepts harvested local dispositions and stages changed-source amendments for review', async () => {
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
    const meeting: GranolaMeetingFixture = {
      id: 'meeting-a',
      date: '2026-01-02',
      title: 'Meeting',
      detail: { summary: 'Original' },
      transcript: { transcript: 'Speaker: retained' }
    }
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)
    const ledgerPath = join(repository, '+/_ACQUIRE/granola/ledger.json')
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) as {
      meetings: Record<
        string,
        {
          path: string
          document_sha256: string
          detail_sha256: string
          disposition: Record<string, unknown>
        }
      >
    }
    const current = ledger.meetings['meeting-a']
    expect(current).toBeDefined()
    const destination = 'harvested/meeting-a.md'
    await mkdir(join(repository, '+/_ACQUIRE/granola/harvested'), { recursive: true })
    await rename(
      join(repository, '+/_ACQUIRE/granola', current?.path ?? ''),
      join(repository, '+/_ACQUIRE/granola', destination)
    )
    if (current) {
      current.disposition = {
        state: 'harvested-locally',
        canonical_destination: destination,
        document_sha256: current.document_sha256,
        disposed_at: '2026-01-04T00:00:00.000Z',
        source_version_sha256: current.detail_sha256
      }
    }
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`)

    const unchangedSource = granolaFixtureRunner({ meetings: [meeting] })
    box.setRunner(unchangedSource.runner)
    const unchanged = await box.run(command(repository))
    expect(unchanged.exitCode, unchanged.output).toBe(0)
    expect(unchanged.output).toContain('Meetings: 0 new, 0 amended, 1 unchanged')
    expect(await packageDirectories(repository)).toHaveLength(0)
    expect(unchangedSource.calls.filter((call) => call.tool === 'get_meeting_transcript')).toHaveLength(0)

    const changedSource = granolaFixtureRunner({
      meetings: [{ ...meeting, detail: { summary: 'Changed after harvest' } }]
    })
    box.setRunner(changedSource.runner)
    const changed = await box.run(command(repository))
    expect(changed.exitCode, changed.output).toBe(0)
    expect(await packageDirectories(repository)).toHaveLength(1)
    const amended = JSON.parse(await readFile(ledgerPath, 'utf8')) as {
      meetings: Record<string, { disposition: { state: string } }>
    }
    expect(amended.meetings['meeting-a']?.disposition.state).toBe('awaiting-review')
  })

  test('guards checkpoint journal document and cached transcript recovery evidence', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('target')
    await setupReceivers(box, [
      { key: 'target', repository: 'https://github.com/example/target', path: repository, unfoldered: true }
    ])
    const meeting: GranolaMeetingFixture = { id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }
    box.setRunner(granolaFixtureRunner({ meetings: [meeting] }).runner)
    expect((await box.run(command(repository))).exitCode).toBe(0)

    const base = join(repository, '+/_ACQUIRE/granola')
    const ledgerPath = join(base, 'ledger.json')
    const originalLedger = await readFile(ledgerPath, 'utf8')
    const ledger = JSON.parse(originalLedger) as JsonRecord
    const current = checkpointMeeting(ledger)
    const documentPath = join(base, String(current['path']))
    const originalDocument = await readFile(documentPath, 'utf8')
    const reconcile = ['ki', 'acquire', 'reconcile', '--adapter', 'granola', '--repo', repository]

    const wrongRepository = JSON.parse(originalLedger) as JsonRecord
    wrongRepository['repository'] = 'https://github.com/example/other'
    await writeFile(ledgerPath, `${JSON.stringify(wrongRepository)}\n`)
    expect((await box.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository])).output).toContain(
      'repository binding differs'
    )

    const multipleDispositions = JSON.parse(originalLedger) as JsonRecord
    const retainedMeeting = structuredClone(checkpointMeeting(multipleDispositions))
    ;(retainedMeeting['disposition'] as JsonRecord)['state'] = 'retained'
    ;(multipleDispositions['meetings'] as JsonRecord)['meeting-b'] = retainedMeeting
    await writeFile(ledgerPath, `${JSON.stringify(multipleDispositions)}\n`)
    expect((await box.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository])).output).toContain(
      'retained=1, staged=1'
    )

    await writeFile(ledgerPath, originalLedger)
    current['path'] = '../unsafe.md'
    await writeFile(ledgerPath, `${JSON.stringify(ledger)}\n`)
    expect((await box.run(reconcile)).output).toContain('unsafe document path')

    await writeFile(ledgerPath, originalLedger)
    await rm(documentPath)
    await symlink(join(repository, '.ki.toml'), documentPath)
    expect((await box.run(reconcile)).output).toContain('is unsafe')

    await rm(documentPath)
    expect((await box.run(reconcile)).output).toContain('staged document is missing')

    const awaiting = JSON.parse(originalLedger) as JsonRecord
    checkpointDisposition(awaiting)['state'] = 'awaiting-review'
    await writeFile(ledgerPath, `${JSON.stringify(awaiting)}\n`)
    expect((await box.run(reconcile)).output).toContain('staged document is missing')

    await writeFile(documentPath, `${originalDocument}\nchanged`)
    expect((await box.run(reconcile)).output).toContain('checksum differs')

    const retained = JSON.parse(originalLedger) as JsonRecord
    checkpointDisposition(retained)['state'] = 'retained'
    await writeFile(ledgerPath, `${JSON.stringify(retained)}\n`)
    await rm(documentPath)
    expect((await box.run(reconcile)).exitCode).toBe(0)
    expect((await box.run(command(repository))).output).toContain('cached transcript differs from checkpoint')

    const retainedReset = await box.run([
      'ki',
      'acquire',
      'reset',
      '--adapter',
      'granola',
      '--repo',
      repository,
      '--source',
      'meeting-a',
      '--confirm'
    ])
    expect(retainedReset.exitCode, retainedReset.output).toBe(0)

    for (const replacement of [null, '', '_Transcript source unavailable._']) {
      const altered =
        replacement === null
          ? originalDocument.replace('## Transcript', '## Conversation')
          : originalDocument.replace(/## Transcript\n\n[\s\S]*$/, `## Transcript\n\n${replacement}`)
      const alteredLedger = JSON.parse(originalLedger) as JsonRecord
      const alteredMeeting = checkpointMeeting(alteredLedger)
      const alteredHash = sha256(altered)
      alteredMeeting['document_sha256'] = alteredHash
      checkpointDisposition(alteredLedger)['document_sha256'] = alteredHash
      await writeFile(ledgerPath, `${JSON.stringify(alteredLedger)}\n`)
      await writeFile(documentPath, altered)
      expect((await box.run(command(repository))).output).toContain('cached transcript differs from checkpoint')
    }

    await rm(ledgerPath)
    await mkdir(ledgerPath)
    expect((await box.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', repository])).output).toContain(
      'checkpoint must be physical file'
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
    expect((await orphan.run(command(orphanRepository))).output).toContain('belongs to another source identity')

    await rm(orphanPath)
    await mkdir(orphanPath)
    expect((await orphan.run(command(orphanRepository))).output).toContain('meeting document')
    await rm(orphanPath, { recursive: true })
    expect((await orphan.run(command(orphanRepository))).exitCode).toBe(0)
    orphan.setRunner(granolaFixtureRunner({ meetings: [{ ...meeting, title: 'Renamed' }] }).runner)
    expect((await orphan.run(command(orphanRepository))).exitCode).toBe(0)
    expect(await packageDirectories(orphanRepository)).toEqual(['2026-01-02--renamed--meeting-a.md'])

    orphan.setRunner(
      granolaFixtureRunner({ meetings: [{ ...meeting, title: 'Renamed' }], account: { id: 'other' } }).runner
    )
    expect((await orphan.run(command(orphanRepository))).output).toContain('account differs')

    const refresh = granolaFixtureRunner({ meetings: [{ ...meeting, title: 'Renamed', transcript: null }] })
    orphan.setRunner(refresh.runner)
    const refreshed = await orphan.run([...command(orphanRepository), '--refresh-transcripts'])
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
    expect(imported.output).toContain('1 omissions')

    await rm(join(unavailableRepository, '+/_ACQUIRE/granola/ledger.json'))
    await mkdir(join(unavailableRepository, '+/_ACQUIRE/granola/journal.json'))
    expect(
      (await unavailable.run(['ki', 'acquire', 'status', '--adapter', 'granola', '--repo', unavailableRepository]))
        .output
    ).toContain('journal must be physical file')
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
        '[skills.ki-repo]',
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

  test('records non-Error detail and transcript failures in resumable journals', async () => {
    const detailBox = await sandbox()
    const detailRepository = await detailBox.root.mkdir('target')
    await setupReceivers(detailBox, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: detailRepository,
        unfoldered: true
      }
    ])
    const meeting: GranolaMeetingFixture = { id: 'meeting-a', date: '2026-01-02', title: 'Meeting' }
    const detailSource = granolaFixtureRunner({ meetings: [meeting] })
    detailBox.setRunner(async (executable, arguments_, environment) => {
      if (arguments_[1] === 'granola.get_meetings') throw 'detail failure'
      return detailSource.runner(executable, arguments_, environment)
    })
    await expect(detailBox.run(command(detailRepository))).rejects.toBe('detail failure')

    const transcriptBox = await sandbox()
    const transcriptRepository = await transcriptBox.root.mkdir('target')
    await setupReceivers(transcriptBox, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: transcriptRepository,
        unfoldered: true
      }
    ])
    const transcriptSource = granolaFixtureRunner({ meetings: [meeting] })
    transcriptBox.setRunner(async (executable, arguments_, environment) => {
      if (arguments_[1] === 'granola.get_meeting_transcript') throw 'transcript failure'
      return transcriptSource.runner(executable, arguments_, environment)
    })
    await expect(transcriptBox.run(command(transcriptRepository))).rejects.toBe('transcript failure')

    for (const path of [detailRepository, transcriptRepository]) {
      const journal = JSON.parse(await readFile(join(path, '+/_ACQUIRE/granola/journal.json'), 'utf8')) as {
        failures: readonly { message: string }[]
      }
      expect(journal.failures[0]?.message).toContain('failure')
    }
  })

  test('recovers folder-only discovery and a journal whose verified staged document disappeared', async () => {
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
    expect((await folderBox.run(command(folderRepository))).exitCode).toBe(0)

    const resumeBox = await sandbox()
    const resumeRepository = await resumeBox.root.mkdir('target')
    await setupReceivers(resumeBox, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: resumeRepository,
        unfoldered: true
      }
    ])
    const meetings = Array.from({ length: 11 }, (_, index) => ({
      id: `meeting-${String(index).padStart(2, '0')}`,
      date: '2026-01-02',
      title: `Meeting ${index}`
    }))
    resumeBox.setRunner(granolaFixtureRunner({ meetings, failDetailOnce: 'meeting-10' }).runner)
    expect((await resumeBox.run(command(resumeRepository))).exitCode).toBe(1)
    const journalPath = join(resumeRepository, '+/_ACQUIRE/granola/journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as JsonRecord
    const component = journalComponent(journal)
    await rm(join(resumeRepository, '+/_ACQUIRE/granola', String(component['staged_document_path'])))
    resumeBox.setRunner(granolaFixtureRunner({ meetings }).runner)
    const resumed = await resumeBox.run(command(resumeRepository))
    expect(resumed.exitCode, resumed.output).toBe(0)
    expect(resumed.output).toContain('9 resumed')

    const empty = await sandbox()
    const emptyRepository = await empty.root.mkdir('target')
    await setupReceivers(empty, [
      {
        key: 'target',
        repository: 'https://github.com/example/target',
        path: emptyRepository,
        unfoldered: true
      }
    ])
    const reset = await empty.run([
      'ki',
      'acquire',
      'reset',
      '--adapter',
      'granola',
      '--repo',
      emptyRepository,
      '--source',
      'meeting-a',
      '--confirm'
    ])
    expect(reset.output).toContain('checkpoint is absent')
  })
})
