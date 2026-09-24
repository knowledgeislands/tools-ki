import { createHash } from 'node:crypto'
import { lstat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'
import { sandbox } from './_cli_helper.ts'

const now = Date.parse('2026-09-15T08:00:00Z')
const expiry = '2026-09-15T12:00:00Z'
const baseline = '1'.repeat(40)
const firstCommit = '2'.repeat(40)
const secondCommit = '3'.repeat(40)
const evidenceCommit = '4'.repeat(40)

const configuration = [
  '[repo]',
  'harnesses = ["knowledgeislands/ki-agentic-harness"]',
  '',
  '[skills.ki-repo]',
  'repository = "https://github.com/knowledgeislands/example"',
  'repo_code = "EXAMPLE"',
  '',
  '[skills.ki-work]',
  'adapter = "roadmap"',
  ''
].join('\n')

const item = (
  id: string,
  status: 'ready' | 'in-progress' | 'awaiting-review' | 'done' = 'ready',
  blockedBy: readonly string[] = []
): string =>
  [
    '---',
    `id: ${id}`,
    `title: ${id === 'EXAMPLE-001' ? 'First item' : 'Second item'}`,
    'theme: cli',
    'horizon: next',
    `status: ${status}`,
    'blocks: []',
    `blocked_by: [${blockedBy.join(', ')}]`,
    `baseline_ref: ${status === 'ready' ? 'null' : baseline}`,
    'created_at: 2026-09-15T07:00:00Z',
    'updated_at: 2026-09-15T07:00:00Z',
    '---',
    '',
    `# ${id}`,
    '',
    '## Goal',
    '',
    'Deliver the item.',
    '',
    '## Context',
    '',
    'The batch fixture needs canonical work.',
    '',
    '## Boundary',
    '',
    'No external work.',
    '',
    '## Discussion',
    '',
    'The fixture is intentionally concise.',
    ''
  ].join('\n')

const setup = async () => {
  const box = await sandbox()
  await box.project.write('repository/.ki.toml', configuration)
  await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001'))
  await box.project.write(
    'repository/docs/roadmap/EXAMPLE-002-second.md',
    item('EXAMPLE-002', 'ready', ['EXAMPLE-001'])
  )
  box.setRunner(async (command, arguments_) => ({
    exitCode: command === 'git' && arguments_.includes('cat-file') ? 0 : 1,
    output: ''
  }))
  box.cd('repository')
  return box
}

const prepare = (items = 'EXAMPLE-001 EXAMPLE-002', extra = ''): string =>
  `ki batch prepare ${items
    .split(' ')
    .map((id) => `--item ${id}`)
    .join(
      ' '
    )} --approved --authority-mode reviewed-items --expires-at ${expiry} --completion-target awaiting-review ${extra}`

const batchPath = '+/_BATCHES/EXAMPLE-BATCH-001.md'

const rehashBatch = (contents: string): string => {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents)
  if (!match?.[1]) throw new Error('test batch fixture lacks frontmatter')
  const parsed = parse(match[1]) as Record<string, unknown>
  const protectedFields = Object.fromEntries(
    Object.entries(parsed)
      .filter(([field]) => field !== 'approved_payload_sha256')
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
  )
  const body = contents.slice(match[0].length)
  const sections = body.split(/^## Run ledger[ \t]*$/m)
  const protectedBody = sections[0] ?? ''
  const normalizedBody =
    sections.length === 2 && protectedBody.endsWith('\n\n') ? protectedBody.slice(0, -1) : protectedBody
  const payload = createHash('sha256')
    .update(JSON.stringify({ frontmatter: protectedFields, body: normalizedBody }))
    .digest('hex')
  return contents
    .replace(/^approved_payload_sha256: .*$/m, `approved_payload_sha256: ${payload}`)
    .replace(/^(<!-- ki-batch-run: [A-Z][A-Z0-9-]*-RUN-\d{3} )[a-f0-9]{64}( -->)$/gm, `$1${payload}$2`)
}

describe('[ki batch]', () => {
  test('prepares, validates, starts, records, and closes one exact batch without changing work items', async () => {
    const box = await setup()
    const firstBefore = await box.project.read('repository/docs/roadmap/EXAMPLE-001-first.md')
    const prepared = await box.run(prepare(), { now: () => now })
    expect(prepared.exitCode, prepared.output).toBe(0)
    expect(prepared.stdout).toContain('Batch prepared: EXAMPLE-BATCH-001')
    expect(prepared.stdout).toContain('Write: written locally')
    expect(prepared.stdout).toContain('Authority: structural evidence only')
    const initial = await box.project.read(`repository/${batchPath}`)
    const payload = /approved_payload_sha256: ([a-f0-9]{64})/.exec(initial)?.[1]
    expect(payload).toBe('512f0b5937c2899262a6bac5a5bc637b5a08b6b4f84d48835e3aa5f812dc80c0')
    expect(initial).toContain('policy: safe-local-v1')
    expect(initial).not.toContain('run_id:')
    expect(await box.project.read('repository/docs/roadmap/EXAMPLE-001-first.md')).toBe(firstBefore)

    const valid = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
    expect(valid.exitCode, valid.output).toBe(0)
    expect(valid.stdout).toContain('Write: none')
    expect((await box.run(`ki batch validate ${batchPath}`, { now: () => now })).exitCode).toBe(0)
    const started = await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })
    expect(started.exitCode, started.output).toBe(0)
    expect(await box.project.read(`repository/${batchPath}`)).toContain(
      `<!-- ki-batch-run: EXAMPLE-BATCH-001-RUN-001 ${payload} -->`
    )

    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001', 'awaiting-review'))
    await box.project.write(
      'repository/docs/roadmap/EXAMPLE-002-second.md',
      item('EXAMPLE-002', 'awaiting-review', ['EXAMPLE-001'])
    )
    const firstResult = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result awaiting-review --baseline ${baseline} --result-commit ${firstCommit}`,
      { now: () => now }
    )
    const secondResult = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-002 --result awaiting-review --baseline ${baseline} --result-commit ${secondCommit} --exception none`,
      { now: () => now }
    )
    expect(firstResult.exitCode, firstResult.output).toBe(0)
    expect(secondResult.exitCode, secondResult.output).toBe(0)

    box.setRunner(async (command, arguments_) => ({
      exitCode:
        command === 'git' && arguments_.includes('cat-file') && arguments_.includes(`${evidenceCommit}^{commit}`)
          ? 0
          : 1,
      output: ''
    }))
    const closed = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(closed.exitCode, closed.output).toBe(0)
    expect(closed.stdout).toContain('Close: recorded')
    const final = await box.project.read(`repository/${batchPath}`)
    expect(final).toContain(`<!-- ki-batch-close: EXAMPLE-BATCH-001 awaiting-review ${evidenceCommit} -->`)
    expect(/approved_payload_sha256: ([a-f0-9]{64})/.exec(final)?.[1]).toBe(payload)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
    expect(
      (
        await box.run(
          `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
          { now: () => now }
        )
      ).stdout
    ).toContain('Write: none')

    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001'))
    await box.project.write('repository/docs/roadmap/EXAMPLE-002-second.md', item('EXAMPLE-002'))
    const second = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(second.stdout).toContain('Batch prepared: EXAMPLE-BATCH-002')
  })

  test('validates retained records for integrity without upgrading them', async () => {
    const box = await setup()
    const payload = '59fcd16bf54043632c682656fab32b94dcada2f80d590aa45a002d3dbc4134d3'
    const retained = [
      '---',
      'id: EXAMPLE-BATCH-009',
      'repository: https://github.com/knowledgeislands/example',
      'approved: true',
      'approved_at: 2026-09-15T08:00:00Z',
      'authority_mode: reviewed-items',
      `approved_payload_sha256: ${payload}`,
      'run_id: EXAMPLE-BATCH-009-RUN-001',
      'timebox_ends_at: 2026-09-15T12:00:00Z',
      'item_ids: [EXAMPLE-001]',
      'completion_target: awaiting-review',
      'mandatory_stops: [push-or-release]',
      'closure_item_ids: []',
      '---',
      '# EXAMPLE-BATCH-009 — Retained',
      '',
      '## Run ledger',
      '',
      `<!-- ki-batch-run: EXAMPLE-BATCH-009-RUN-001 ${payload} -->`,
      ''
    ].join('\n')
    await box.project.write('repository/+/_BATCHES/EXAMPLE-BATCH-009.md', retained)

    const valid = await box.run('ki batch validate EXAMPLE-BATCH-009', { now: () => now })
    expect(valid.exitCode, valid.output).toBe(0)
    expect(valid.stdout).toContain('Contract: retained-legacy')
    expect((await box.run('ki batch run EXAMPLE-BATCH-009', { now: () => now })).stderr).toContain(
      'retained legacy batch records are read-only'
    )

    const cases: readonly [string, string, string][] = [
      [
        'empty mandatory stops',
        rehashBatch(retained.replace('mandatory_stops: [push-or-release]', 'mandatory_stops: []')),
        'mandatory_stops must be a non-empty string array'
      ],
      [
        'invalid closure identifier',
        rehashBatch(retained.replace('closure_item_ids: []', 'closure_item_ids: [invalid]')),
        'closure_item_ids must be an identifier array'
      ],
      [
        'duplicate closure identifier',
        rehashBatch(retained.replace('closure_item_ids: []', 'closure_item_ids: [EXAMPLE-001, EXAMPLE-001]')),
        'repeats a closure item identifier'
      ],
      [
        'closure outside selected set',
        rehashBatch(retained.replace('closure_item_ids: []', 'closure_item_ids: [EXAMPLE-002]')),
        'closure_item_ids names an item outside item_ids'
      ],
      [
        'incomplete done closure',
        rehashBatch(retained.replace('completion_target: awaiting-review', 'completion_target: done')),
        'done retained record must close every named item'
      ],
      [
        'invalid run identity',
        rehashBatch(retained.replace('run_id: EXAMPLE-BATCH-009-RUN-001', 'run_id: invalid')),
        'invalid retained run identity'
      ],
      ['missing run binding', retained.replace(/^<!-- ki-batch-run:.*-->$/m, 'missing'), 'lacks an approval binding'],
      [
        'mismatched run binding',
        retained.replace('EXAMPLE-BATCH-009-RUN-001 59fcd', 'EXAMPLE-BATCH-009-RUN-002 59fcd'),
        'binds another approval payload or run'
      ]
    ]
    for (const [name, contents, expected] of cases) {
      await box.project.write('repository/+/_BATCHES/EXAMPLE-BATCH-009.md', contents)
      const result = await box.run('ki batch validate EXAMPLE-BATCH-009', { now: () => now })
      expect(result.stderr, name).toContain(expected)
    }

    const withoutLedger = rehashBatch(retained.slice(0, retained.indexOf('## Run ledger')))
    await box.project.write('repository/+/_BATCHES/EXAMPLE-BATCH-009.md', withoutLedger)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-009', { now: () => now })).exitCode).toBe(0)

    const completed = rehashBatch(
      retained
        .replace('completion_target: awaiting-review', 'completion_target: done')
        .replace('closure_item_ids: []', 'closure_item_ids: [EXAMPLE-001]')
    )
    await box.project.write('repository/+/_BATCHES/EXAMPLE-BATCH-009.md', completed)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-009', { now: () => now })).exitCode).toBe(0)

    const retainedOutcome = rehashBatch(
      retained
        .replace('authority_mode: reviewed-items', 'authority_mode: outcome\nauthority_evidence: approved outcome')
        .replaceAll('EXAMPLE-BATCH-009', 'EXAMPLE-BATCH-010')
    )
    await box.project.write('repository/+/_BATCHES/EXAMPLE-BATCH-010.md', retainedOutcome)
    const validRetainedOutcome = await box.run('ki batch validate EXAMPLE-BATCH-010', { now: () => now })
    expect(validRetainedOutcome.exitCode, validRetainedOutcome.output).toBe(0)
  })

  test('rejects malformed protected fields in current records', async () => {
    const box = await setup()
    expect((await box.run(prepare('EXAMPLE-001'), { now: () => now })).exitCode).toBe(0)
    const original = await box.project.read(`repository/${batchPath}`)

    await box.project.write(
      `repository/${batchPath}`,
      rehashBatch(original.replace('id: EXAMPLE-BATCH-001', 'id: EXAMPLE-BATCH-002'))
    )
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'has an invalid identity or filename'
    )

    const cases: readonly [string, (contents: string) => string, string][] = [
      [
        'non-object YAML',
        (contents) => contents.replace(/^---\n[\s\S]*?\n---/u, '---\n[]\n---'),
        'invalid frontmatter'
      ],
      ['invalid YAML', (contents) => contents.replace('id: EXAMPLE-BATCH-001', 'id: ['), 'invalid frontmatter'],
      [
        'false approval',
        (contents) => rehashBatch(contents.replace('approved: true', 'approved: false')),
        'not explicitly approved'
      ],
      [
        'invalid authority mode',
        (contents) => rehashBatch(contents.replace('authority_mode: reviewed-items', 'authority_mode: delegated')),
        'invalid authority mode'
      ],
      [
        'outcome without evidence',
        (contents) => rehashBatch(contents.replace('authority_mode: reviewed-items', 'authority_mode: outcome')),
        'outcome authority lacks current human evidence'
      ],
      [
        'reviewed items with outcome evidence',
        (contents) =>
          rehashBatch(
            contents.replace('authority_mode: reviewed-items', 'authority_mode: reviewed-items\nauthority_evidence: no')
          ),
        'must not claim outcome evidence'
      ],
      [
        'invalid approval timestamp',
        (contents) => rehashBatch(contents.replace('approved_at: 2026-09-15T08:00:00Z', 'approved_at: tomorrow')),
        'approved_at must be a canonical UTC timestamp'
      ],
      [
        'empty item set',
        (contents) => rehashBatch(contents.replace('item_ids: [EXAMPLE-001]', 'item_ids: []')),
        'item_ids must be a non-empty'
      ],
      [
        'duplicate item set',
        (contents) => rehashBatch(contents.replace('item_ids: [EXAMPLE-001]', 'item_ids: [EXAMPLE-001, EXAMPLE-001]')),
        'repeats an item identifier'
      ],
      [
        'invalid completion target',
        (contents) => rehashBatch(contents.replace('completion_target: awaiting-review', 'completion_target: parked')),
        'invalid completion target'
      ],
      [
        'invalid payload hash',
        (contents) => contents.replace(/^approved_payload_sha256: .*$/m, 'approved_payload_sha256: invalid'),
        'invalid approved payload hash'
      ],
      [
        'invalid policy',
        (contents) => rehashBatch(contents.replace('policy: safe-local-v1', 'policy: unsafe')),
        'invalid policy'
      ]
    ]

    for (const [name, mutate, expected] of cases) {
      await box.project.write(`repository/${batchPath}`, mutate(original))
      const result = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
      expect(result.stderr, name).toContain(expected)
    }

    await box.project.write(`repository/${batchPath}`, original.replace('# EXAMPLE-BATCH-001', '# OTHER-BATCH-001'))
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'body must contain only its matching identity heading'
    )
    await box.project.write(`repository/${batchPath}`, `${original}\n## Run ledger\n\n## Run ledger\n`)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'contains more than one run ledger'
    )
    const compactBody = rehashBatch(original.replace('# EXAMPLE-BATCH-001\n', '# EXAMPLE-BATCH-001'))
    await box.project.write(`repository/${batchPath}`, compactBody)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
  })

  test('requires explicit legitimate authority inputs and Ready exact-set work', async () => {
    const box = await setup()
    const missingApproval = await box.run(
      `ki batch prepare --item EXAMPLE-001 --authority-mode reviewed-items --expires-at ${expiry} --completion-target awaiting-review`,
      { now: () => now }
    )
    expect(missingApproval.exitCode).toBe(2)
    expect(missingApproval.stderr).toContain("required option '--approved' not specified")

    const missingEvidence = await box.run(
      `ki batch prepare --item EXAMPLE-001 --approved --authority-mode outcome --expires-at ${expiry} --completion-target done`,
      { now: () => now }
    )
    expect(missingEvidence.stderr).toContain('outcome authority requires --authority-evidence')
    const inventedEvidence = await box.run(prepare('EXAMPLE-001', '--authority-evidence invented'), {
      now: () => now
    })
    expect(inventedEvidence.stderr).toContain('reviewed-items authority must not use --authority-evidence')
    const repeated = await box.run(prepare('EXAMPLE-001 EXAMPLE-001'), { now: () => now })
    expect(repeated.stderr).toContain('repeats an item identifier')
    const past = await box.run(
      'ki batch prepare --item EXAMPLE-001 --approved --authority-mode reviewed-items --expires-at 2026-09-15T07:00:00Z --completion-target awaiting-review',
      { now: () => now }
    )
    expect(past.stderr).toContain('--expires-at must be in the future')
    const malformed = await box.run(
      'ki batch prepare --item EXAMPLE-001 --approved --authority-mode reviewed-items --expires-at tomorrow --completion-target awaiting-review',
      { now: () => now }
    )
    expect(malformed.stderr).toContain('--expires-at must be a canonical UTC timestamp')

    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001', 'in-progress'))
    const notReady = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(notReady.stderr).toContain('batch item EXAMPLE-001 is not ready')
    const missing = await box.run(prepare('EXAMPLE-099'), { now: () => now })
    expect(missing.stderr).toContain('batch item EXAMPLE-099 is not a canonical work record')
  })

  test('validates repository identity, item presence, and outcome-authority preparation', async () => {
    const box = await setup()
    const noItems = await box.run(
      `ki batch prepare --approved --authority-mode reviewed-items --expires-at ${expiry} --completion-target awaiting-review`,
      { now: () => now }
    )
    expect(noItems.stderr).toContain('requires at least one item identifier')

    const outcome = await box.run(
      `ki batch prepare --item EXAMPLE-001 --approved --authority-mode outcome --authority-evidence approved-now --expires-at ${expiry} --completion-target awaiting-review`,
      { now: () => now }
    )
    expect(outcome.exitCode, outcome.output).toBe(0)
    expect(await box.project.read(`repository/${batchPath}`)).toContain('authority_evidence: "approved-now"')

    await box.project.write(
      'repository/docs/roadmap/EXAMPLE-002-second.md',
      item('EXAMPLE-002', 'ready', ['EXAMPLE-099'])
    )
    const blocked = await box.run(prepare('EXAMPLE-002'), { now: () => now })
    expect(blocked.stderr).toContain('unsatisfied dependency EXAMPLE-099')

    await box.project.write(
      'repository/.ki.toml',
      configuration.replace('adapter = "roadmap"', 'adapter = "github-issues"')
    )
    const remote = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(remote.stderr).toContain('requires a locally executable roadmap or kb-streams adapter')

    await box.project.write(
      'repository/.ki.toml',
      configuration.replace('adapter = "roadmap"', 'adapter = "kb-streams"')
    )
    const wrongLocalAdapter = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(wrongLocalAdapter.stderr).toContain('cannot use kb-streams for this repository kind')

    await box.project.write(
      'repository/.ki.toml',
      configuration.replace('repo_code = "EXAMPLE"', 'repo_code = "EXAMPLE"\nrepo_type = "kb"')
    )
    const wrongKnowledgeBaseAdapter = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(wrongKnowledgeBaseAdapter.stderr).toContain('cannot use roadmap for this repository kind')

    await box.project.write('repository/.ki.toml', configuration.replace('repo_code = "EXAMPLE"', 'repo_code = "bad"'))
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'repo_code must be a stable uppercase identifier'
    )

    await box.project.write(
      'repository/.ki.toml',
      configuration.replace('repo_code = "EXAMPLE"', 'repo_code = "5GE-P2"')
    )
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).not.toContain(
      'repo_code must be a stable uppercase identifier'
    )
  })

  test('rejects dependency order, altered authority payloads, unsupported fields, and marker mismatches', async () => {
    const box = await setup()
    const reversed = await box.run(prepare('EXAMPLE-002 EXAMPLE-001'), { now: () => now })
    expect(reversed.stderr).toContain('must follow its in-batch dependency EXAMPLE-001')
    expect((await box.run(prepare(), { now: () => now })).exitCode).toBe(0)
    const original = await box.project.read(`repository/${batchPath}`)

    await box.project.write(
      `repository/${batchPath}`,
      original.replace('completion_target: awaiting-review', 'completion_target: done')
    )
    const altered = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
    expect(altered.stderr).toContain('payload no longer matches its approval')
    await box.project.write(`repository/${batchPath}`, original.replace('policy: safe-local-v1', 'retired_field: true'))
    const unsupported = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
    expect(unsupported.stderr).toContain('has unsupported fields')
    await box.project.write(`repository/${batchPath}`, original)
    expect((await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
    const started = await box.project.read(`repository/${batchPath}`)
    await box.project.write(
      `repository/${batchPath}`,
      started.replace('EXAMPLE-BATCH-001-RUN-001', 'EXAMPLE-BATCH-001-RUN-002')
    )
    const mismatched = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
    expect(mismatched.stderr).toContain('run ledger binds another approval payload or run')
  })

  test('rejects malformed run ledgers and duplicate results', async () => {
    const box = await setup()
    expect((await box.run(prepare('EXAMPLE-001'), { now: () => now })).exitCode).toBe(0)
    expect((await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
    const started = await box.project.read(`repository/${batchPath}`)
    const header = '| Item | Result | Baseline | Result commit | Exception |\n| --- | --- | --- | --- | --- |'

    const compactBody = rehashBatch(
      started.replace('# EXAMPLE-BATCH-001\n\n## Run ledger', '# EXAMPLE-BATCH-001\n## Run ledger')
    )
    await box.project.write(`repository/${batchPath}`, compactBody)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)

    const cases: readonly [string, string, string][] = [
      ['empty ledger', `${started.trimEnd().replace(/<!-- ki-batch-run:.*-->$/m, '')}\n`, 'lacks an approval binding'],
      ['missing binding', started.replace(/^<!-- ki-batch-run:.*-->$/m, 'missing'), 'lacks an approval binding'],
      ['malformed table', `${started.trimEnd()}\n\n| wrong |`, 'run ledger table is malformed'],
      ['malformed row', `${started.trimEnd()}\n\n${header}\n| wrong |`, 'run ledger row is malformed'],
      [
        'foreign close',
        `${started.trimEnd()}\n\n<!-- ki-batch-close: OTHER-BATCH-001 awaiting-review ${evidenceCommit} -->\n`,
        'close evidence names another batch'
      ],
      [
        'foreign item result',
        `${started.trimEnd()}\n\n${header}\n| EXAMPLE-099 | stopped | — | — | None |\n`,
        'run ledger names an item outside item_ids'
      ],
      [
        'completion without result commit',
        `${started.trimEnd()}\n\n${header}\n| EXAMPLE-001 | awaiting-review | \`${baseline}\` | — | None |\n`,
        'completion result lacks a result commit'
      ],
      [
        'close target mismatch',
        `${started.trimEnd()}\n\n<!-- ki-batch-close: EXAMPLE-BATCH-001 done ${evidenceCommit} -->\n`,
        'close evidence does not match the approved completion target'
      ]
    ]
    for (const [name, contents, expected] of cases) {
      await box.project.write(`repository/${batchPath}`, contents)
      const result = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
      expect(result.stderr, name).toContain(expected)
    }

    await box.project.write(
      `repository/${batchPath}`,
      `${started.trimEnd()}\n\n<!-- ki-batch-close: EXAMPLE-BATCH-001 awaiting-review ${evidenceCommit} -->\n`
    )
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'close evidence requires one awaiting-review result for every named item'
    )

    await box.project.write(`repository/${batchPath}`, started)
    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001', 'awaiting-review'))
    expect(
      (
        await box.run(
          `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result awaiting-review --baseline ${baseline} --result-commit ${firstCommit}`,
          { now: () => now }
        )
      ).exitCode
    ).toBe(0)
    const oneResult = await box.project.read(`repository/${batchPath}`)
    const row = oneResult.trimEnd().split('\n').at(-1) as string
    await box.project.write(`repository/${batchPath}`, `${oneResult.trimEnd()}\n${row}\n`)
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'run ledger repeats an item result'
    )
  })

  test('requires a physical batch directory and existing record', async () => {
    const missing = await setup()
    expect((await missing.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      '+/_BATCHES must be a physical directory'
    )

    await missing.project.write('repository/+/_BATCHES', 'not a directory')
    expect((await missing.run(prepare('EXAMPLE-001'), { now: () => now })).stderr).toContain(
      '+/_BATCHES must be a physical directory'
    )

    const linked = await setup()
    await linked.project.mkdir('repository/batches')
    await linked.project.mkdir('repository/+')
    await symlink(join(linked.project.path, 'repository/batches'), join(linked.project.path, 'repository/+/_BATCHES'))
    expect((await linked.run(prepare('EXAMPLE-001'), { now: () => now })).stderr).toContain(
      '+/_BATCHES must be a physical directory'
    )

    const absent = await setup()
    expect((await absent.run(prepare('EXAMPLE-001'), { now: () => now })).exitCode).toBe(0)
    expect((await absent.run('ki batch validate +/_BATCHES/EXAMPLE-BATCH-001.md', { now: () => now })).exitCode).toBe(0)
    expect((await absent.run('ki batch validate EXAMPLE-BATCH-999', { now: () => now })).stderr).toContain(
      'batch record must be an existing regular file'
    )
  })

  test('rejects non-canonical, symbolic, expired, malformed, and cross-repository records', async () => {
    const box = await setup()
    expect((await box.run(prepare('EXAMPLE-001'), { now: () => now })).exitCode).toBe(0)
    const outside = await box.run('ki batch validate ../outside.md', { now: () => now })
    expect(outside.stderr).toContain('must be a canonical file directly beneath +/_BATCHES')
    const absoluteOutside = await box.run(`ki batch validate ${join(box.project.path, 'outside.md')}`, {
      now: () => now
    })
    expect(absoluteOutside.stderr).toContain('must be a canonical file directly beneath +/_BATCHES')
    const expired = await box.run('ki batch validate EXAMPLE-BATCH-001', {
      now: () => Date.parse('2026-09-15T12:00:00Z')
    })
    expect(expired.stderr).toContain('batch record has expired')

    const original = await box.project.read(`repository/${batchPath}`)
    await box.project.write(
      `repository/${batchPath}`,
      original.replace(
        'repository: https://github.com/knowledgeislands/example',
        'repository: https://github.com/knowledgeislands/other'
      )
    )
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'names another repository'
    )
    await box.project.write(`repository/${batchPath}`, 'not frontmatter\n')
    expect((await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })).stderr).toContain(
      'has invalid frontmatter'
    )
    await box.project.write(`repository/${batchPath}`, original)
    await symlink(
      join(box.project.path, 'repository', batchPath),
      join(box.project.path, 'repository', '+/_BATCHES/link.md')
    )
    expect((await box.run('ki batch validate link.md', { now: () => now })).stderr).toContain(
      'must be an existing regular file'
    )
  })

  test('requires explicit coherent run results and all-item close evidence', async () => {
    const box = await setup()
    expect((await box.run(prepare(), { now: () => now })).exitCode).toBe(0)
    const partial = await box.run('ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001', { now: () => now })
    expect(partial.stderr).toContain('requires --item, --result, and --baseline together')
    const badBaseline = await box.run(
      'ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result parked --baseline short',
      { now: () => now }
    )
    expect(badBaseline.stderr).toContain('--baseline must be a full commit or —')
    const missingCommit = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result awaiting-review --baseline ${baseline}`,
      { now: () => now }
    )
    expect(missingCommit.stderr).toContain('awaiting-review result requires --result-commit')
    const badResultCommit = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result parked --baseline ${baseline} --result-commit short`,
      { now: () => now }
    )
    expect(badResultCommit.stderr).toContain('--result-commit must be a full commit')
    const unsafeException = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result parked --baseline ${baseline} --exception bad|value`,
      { now: () => now }
    )
    expect(unsafeException.stderr).toContain('--exception must be one plain table-safe line')
    const unknown = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-099 --result parked --baseline ${baseline}`,
      { now: () => now }
    )
    expect(unknown.stderr).toContain('unapproved item EXAMPLE-099')
    const unstartedClose = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(unstartedClose.stderr).toContain('batch run must be started before close')
    const badEvidence = await box.run(
      'ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit short',
      { now: () => now }
    )
    expect(badEvidence.stderr).toContain('--evidence-commit must be a full commit')
    expect((await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
    const wrongReviewStatus = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-002 --result awaiting-review --baseline ${baseline} --result-commit ${secondCommit}`,
      { now: () => now }
    )
    expect(wrongReviewStatus.stderr).toContain('batch item EXAMPLE-002 is not awaiting review')
    const wrongDoneStatus = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-002 --result done --baseline ${baseline} --result-commit ${secondCommit}`,
      { now: () => now }
    )
    expect(wrongDoneStatus.stderr).toContain('batch item EXAMPLE-002 is not done')

    box.setRunner(async () => ({ exitCode: 1, output: 'missing' }))
    const unresolvedBaseline = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result parked --baseline ${baseline}`,
      { now: () => now }
    )
    expect(unresolvedBaseline.stderr).toContain('--baseline does not resolve in the repository')
    box.setRunner(async () => ({ exitCode: 0, output: '' }))

    expect(
      (
        await box.run('ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result parked --baseline —', {
          now: () => now
        })
      ).exitCode
    ).toBe(0)
    const duplicate = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result stopped --baseline ${baseline}`,
      { now: () => now }
    )
    expect(duplicate.stderr).toContain('already records item EXAMPLE-001')
    const alreadyStarted = await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })
    expect(alreadyStarted.stderr).toContain('already started')
    const premature = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(premature.stderr).toContain('requires one awaiting-review ledger result for every named item')
    const wrongTarget = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target done --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(wrongTarget.stderr).toContain('--completion-target does not match batch authority')
  })

  test('leaves a failed evidence resolution open and rejects mutation after close', async () => {
    const box = await setup()
    expect((await box.run(prepare('EXAMPLE-001'), { now: () => now })).exitCode).toBe(0)
    expect((await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001', 'awaiting-review'))
    expect(
      (
        await box.run(
          `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result awaiting-review --baseline ${baseline} --result-commit ${firstCommit}`,
          { now: () => now }
        )
      ).exitCode
    ).toBe(0)
    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001'))
    const wrongItemStatus = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(wrongItemStatus.stderr).toContain('batch item EXAMPLE-001 is not awaiting-review')
    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001', 'awaiting-review'))
    box.setRunner(async () => ({ exitCode: 1, output: 'missing' }))
    const missingEvidence = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(missingEvidence.stderr).toContain('--evidence-commit does not resolve')
    expect(await box.project.read(`repository/${batchPath}`)).not.toContain('ki-batch-close')

    box.setRunner(async () => ({ exitCode: 0, output: '' }))
    expect(
      (
        await box.run(
          `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`,
          { now: () => now }
        )
      ).exitCode
    ).toBe(0)

    box.setRunner(async () => ({ exitCode: 1, output: 'missing' }))
    const invalidatedClose = await box.run('ki batch validate EXAMPLE-BATCH-001', { now: () => now })
    expect(invalidatedClose.stderr).toContain('batch close evidence commit does not resolve in the repository')

    const afterClose = await box.run(
      `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result stopped --baseline ${baseline}`,
      { now: () => now }
    )
    expect(afterClose.stderr).toContain('already closed')
    const differentClose = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${'5'.repeat(40)}`,
      { now: () => now }
    )
    expect(differentClose.stderr).toContain('already closed with different evidence')
  })

  test('records an explicit done-target batch without performing acceptance', async () => {
    const box = await setup()
    const prepared = await box.run(
      `ki batch prepare --item EXAMPLE-001 --approved --authority-mode reviewed-items --expires-at ${expiry} --completion-target done`,
      { now: () => now }
    )
    expect(prepared.exitCode, prepared.output).toBe(0)
    expect((await box.run('ki batch run EXAMPLE-BATCH-001', { now: () => now })).exitCode).toBe(0)
    await box.project.write('repository/docs/roadmap/EXAMPLE-001-first.md', item('EXAMPLE-001', 'done'))
    expect(
      (
        await box.run(
          `ki batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result done --baseline ${baseline} --result-commit ${firstCommit}`,
          { now: () => now }
        )
      ).exitCode
    ).toBe(0)
    box.setRunner(async () => ({ exitCode: 0, output: '' }))
    const closed = await box.run(
      `ki batch close EXAMPLE-BATCH-001 --completion-target done --evidence-commit ${evidenceCommit}`,
      { now: () => now }
    )
    expect(closed.exitCode, closed.output).toBe(0)
    expect(closed.stdout).toContain('Close: recorded')
  })

  test('does not overwrite an existing allocation or accept a non-file batch slot', async () => {
    const box = await setup()
    await box.project.write('repository/+/_BATCHES/OTHER-BATCH-999.md', 'other repository\n')
    await box.project.write('repository/+/_BATCHES/EXAMPLE-BATCH-004.md', 'occupied\n')
    const prepared = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(prepared.stdout).toContain('EXAMPLE-BATCH-005')
    await box.project.mkdir('repository/+/_BATCHES/EXAMPLE-BATCH-006.md')
    const refused = await box.run(prepare('EXAMPLE-001'), { now: () => now })
    expect(refused.stderr).toContain('EXAMPLE-BATCH-006.md must be a regular file')
    expect((await lstat(join(box.project.path, 'repository/+/_BATCHES/EXAMPLE-BATCH-004.md'))).isFile()).toBe(true)
  })
})
