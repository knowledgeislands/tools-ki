import { realpath, symlink } from 'node:fs/promises'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// A normal CLI invocation cannot force a filesystem stat failure other than a
// missing path. This narrow boundary injection verifies that such a failure
// remains a diagnostic rather than being mistaken for an absent roadmap.
const roadmapStatFailure = vi.hoisted(() => ({ path: undefined as string | undefined }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    lstat: (...arguments_: Parameters<typeof original.lstat>) => {
      if (roadmapStatFailure.path === String(arguments_[0])) {
        const error = Object.assign(new Error('roadmap stat failure'), { code: 'EACCES' })
        return Promise.reject(error)
      }
      return original.lstat(...arguments_)
    }
  }
})

afterEach(() => {
  roadmapStatFailure.path = undefined
})

const item = (overrides: Record<string, string> = {}): string => {
  const fields = {
    id: 'KI-TOOL-CLI-003',
    title: 'Inspect governed work',
    theme: 'cli',
    horizon: 'next',
    status: 'draft',
    blocks: '[]',
    blocked_by: '[]',
    baseline_ref: 'null',
    ...overrides
  }
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}:${value.startsWith('\n') ? value : ` ${value}`}`)
    .join('\n')}\n---\n\n## Context\n\nTest item.\n\n## Boundary\n\nNone.\n\n## Discussion\n\n### Test\n\nTest.\n`
}

const localRegistry = (
  entries: readonly { readonly key: string; readonly repository: string; readonly path: string }[]
): string =>
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

const knowledgeBaseConfiguration = (extra = ''): string =>
  `[repo]
harnesses = ["example/harness"]

[skills.ki-repo]
repository = "https://github.com/example/knowledge"
repo_type = "kb"
store_roles = ["notes"]

[skills.ki-work]
adapter = "kb-streams"

[skills.ki-decision-records]
${extra}`

const knowledgeBaseMetadata = {
  note_type: 'roadmap',
  priority: '1',
  tags: '\n  - roadmap\n  - delivery',
  aliases: '\n  - Native proposal',
  author: 'Knowledge Islands',
  purpose: 'Track shared delivery',
  dependencies: '[KBS-099]'
}

describe('[ki repo roadmap]', () => {
  test('lists flat Knowledge Base work items from the declared Streams roadmap and ignores its ledger', async () => {
    const box = await sandbox()
    await box.project.write('knowledge/.ki-config.toml', knowledgeBaseConfiguration())
    await box.project.write('knowledge/Streams/Roadmap/_ISSUES.md', 'last_id: 2\n')
    await box.project.write(
      'knowledge/Streams/Roadmap/Roadmap.md',
      '---\nnote_type: stream-roadmap-index\ntitle: Roadmap\n---\n\n# Roadmap\n'
    )
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-native-proposal.md',
      item({ id: 'KBS-001', title: 'Native proposal', status: 'awaiting-review', ...knowledgeBaseMetadata })
    )
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-002-later-proposal.md',
      item({ id: 'KBS-002', title: 'Later proposal', horizon: 'future', candidate: 'true' })
    )
    const before = await box.project.read('knowledge/Streams/Roadmap/KBS-001-native-proposal.md')
    const ledger = await box.project.read('knowledge/Streams/Roadmap/_ISSUES.md')
    const index = await box.project.read('knowledge/Streams/Roadmap/Roadmap.md')

    const result = await box.run('ki repo --repo knowledge roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('├─ roadmap (2)')
    expect(result.output).toContain('KBS-001 [awaiting-review] Native proposal')
    expect(result.output).toContain('KBS-002 [draft] Later proposal')
    expect(result.output).toContain('╰─ summary: ITEMS=2 ACTIVE=2 DONE=0 TRADES=0 IMPORTS=0 EXPORTS=0')
    expect(result.output).not.toContain('_ISSUES')
    expect(result.output).not.toContain('Roadmap.md')
    expect(await box.project.read('knowledge/Streams/Roadmap/KBS-001-native-proposal.md')).toBe(before)
    expect(await box.project.read('knowledge/Streams/Roadmap/_ISSUES.md')).toBe(ledger)
    expect(await box.project.read('knowledge/Streams/Roadmap/Roadmap.md')).toBe(index)
    await expect(box.project.read('knowledge/docs/roadmap')).rejects.toThrow()
  })

  test('projects adapter-owned KB metadata alongside a strict project roadmap in one selection', async () => {
    const box = await sandbox()
    await box.project.write('knowledge/.ki-config.toml', knowledgeBaseConfiguration())
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-native-proposal.md',
      item({ id: 'KBS-001', title: 'Native proposal', ...knowledgeBaseMetadata })
    )
    await box.project.write('project/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('project/docs/roadmap/KI-TOOL-CLI-003-project-item.md', item())

    const result = await box.run(
      'ki repo --repo project --repo knowledge roadmap list --horizon next --status draft --no-icons'
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(result.output).toContain('KBS-001 [draft] Native proposal')
    expect(result.output).not.toContain('unsupported or repeated field note_type')
  })

  test('treats absent Knowledge Base roadmaps as empty but diagnoses malformed and misconfigured ones', async () => {
    const box = await sandbox()
    const configuration = knowledgeBaseConfiguration()
    await box.project.write('missing/.ki-config.toml', configuration)
    await box.project.write('missing/docs/roadmap/KI-TOOL-CLI-003-project-item.md', item())
    await box.project.write('malformed/.ki-config.toml', configuration)
    await box.project.write('malformed/Streams/Roadmap/KBS-001-valid.md', item({ id: 'KBS-001', title: 'Valid' }))
    await box.project.write('malformed/Streams/Roadmap/KBS-002-invalid.md', item({ id: 'KBS-002', status: 'closed' }))
    await box.project.write('misconfigured/.ki-config.toml', configuration.replace('kb-streams', 'roadmap'))
    await box.project.write('misconfigured/docs/roadmap/KI-TOOL-CLI-003-project-item.md', item())
    await box.project.write('repeated/.ki-config.toml', configuration)
    await box.project.write(
      'repeated/Streams/Roadmap/KBS-001-repeated.md',
      item({ id: 'KBS-001', ...knowledgeBaseMetadata }).replace(
        'title: Inspect governed work',
        'title: Inspect governed work\ntitle: Repeated title'
      )
    )
    await box.project.write('structured-common/.ki-config.toml', configuration)
    await box.project.write(
      'structured-common/Streams/Roadmap/KBS-001-structured-common.md',
      item({ id: 'KBS-001', ...knowledgeBaseMetadata }).replace(
        'title: Inspect governed work',
        'title:\n  - Invalid common structure'
      )
    )

    const missing = await box.run('ki repo --repo missing roadmap list')
    const malformed = await box.run('ki repo --repo malformed roadmap list')
    const misconfigured = await box.run('ki repo --repo misconfigured roadmap list')
    const repeated = await box.run('ki repo --repo repeated roadmap list')
    const structuredCommon = await box.run('ki repo --repo structured-common roadmap list')

    expect(missing.exitCode).toBe(0)
    expect(missing.output).toContain('○ no roadmap')
    expect(missing.output).not.toContain('KI-TOOL-CLI-003')
    expect(malformed.exitCode).toBe(1)
    expect(malformed.output).toContain('has an invalid lifecycle status')
    expect(misconfigured.exitCode).toBe(1)
    expect(misconfigured.output).toContain(
      'Knowledge Base roadmap operations require [skills.ki-work].adapter = "kb-streams"'
    )
    expect(repeated.exitCode).toBe(1)
    expect(repeated.output).toContain('has unsupported or repeated field title')
    expect(structuredCommon.exitCode).toBe(1)
    expect(structuredCommon.output).toContain('frontmatter must contain simple key-value fields')
    await expect(box.project.read('malformed/docs/roadmap')).rejects.toThrow()
  })

  test('reports unavailable trade inventory alongside an otherwise valid Knowledge Base roadmap', async () => {
    const box = await sandbox()
    const knowledge = await box.project.mkdir('knowledge')
    const broken = await box.project.mkdir('broken')
    const configuration = knowledgeBaseConfiguration('\n[skills.ki-trades]\n')
    await box.project.write('knowledge/.ki-config.toml', configuration)
    await box.project.write('broken/.ki-config.toml', configuration.replace('example/knowledge', 'example/broken'))
    await box.project.write('broken/Streams/Roadmap', 'not a directory\n')
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-native-proposal.md',
      item({ id: 'KBS-001', title: 'Native proposal', status: 'awaiting-review' })
    )
    await box.project.write('knowledge/-/_TRADES/example/receiver/TRD-00000001.md', 'not a trade record\n')
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        { key: 'knowledge', repository: 'https://github.com/example/knowledge', path: knowledge },
        { key: 'broken', repository: 'https://github.com/example/broken', path: broken }
      ])
    )

    const result = await box.run('ki repo --repo knowledge --repo broken roadmap list')
    const aggregate = await box.run('ki repo --repo knowledge --repo broken roadmap list --aggregate --no-icons')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('trades (0)')
    expect(result.output).toContain('❌ unavailable:')
    expect(result.output).toContain('TRADES=unavailable')
    expect(result.output).toContain('has no physical')
    expect(aggregate.exitCode).toBe(1)
    expect(aggregate.output).toContain('trades (0)')
    expect(aggregate.output).toContain('❌ unavailable:')
    expect(aggregate.output).toContain('TRADES=unavailable')
  })

  test('promotes and prunes flat Knowledge Base work items without changing the ledger', async () => {
    const box = await sandbox()
    await box.project.write('knowledge/.ki-config.toml', knowledgeBaseConfiguration())
    await box.project.write('knowledge/Streams/Roadmap/_ISSUES.md', 'last_id: 2\n')
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-next.md',
      item({ id: 'KBS-001', ...knowledgeBaseMetadata })
    )
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-002-done.md',
      item({ id: 'KBS-002', title: 'Done item', status: 'done' })
    )

    const before = await box.project.read('knowledge/Streams/Roadmap/KBS-001-next.md')
    expect((await box.run('ki repo --repo knowledge roadmap promote KBS-001')).exitCode).toBe(0)
    expect((await box.run('ki repo --repo knowledge roadmap prune KBS-002')).exitCode).toBe(0)
    await expect(box.project.read('knowledge/Streams/Roadmap/KBS-001-next.md')).resolves.toBe(
      before.replace('horizon: next', 'horizon: now')
    )
    await expect(box.project.read('knowledge/Streams/Roadmap/KBS-002-done.md')).rejects.toThrow()
    await expect(box.project.read('knowledge/Streams/Roadmap/_ISSUES.md')).resolves.toBe('last_id: 2\n')
    await expect(box.project.read('knowledge/docs/roadmap')).rejects.toThrow()
  })

  test('lists and filters grouped governed work items without JSON output', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/repo"\n'
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-010-cleanup.md',
      item({
        id: 'KI-TOOL-CLI-010',
        title: 'Cleanup',
        horizon: 'future',
        status: 'awaiting-review',
        candidate: 'true',
        baseline_ref: 'a'.repeat(40)
      })
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-011-done.md',
      item({ id: 'KI-TOOL-CLI-011', title: 'Done', status: 'done' })
    )
    const root = await realpath(`${box.project.path}/repo`)
    await box.state.write(
      'ki/registry.toml',
      localRegistry([{ key: 'repo', repository: 'https://github.com/example/repo', path: root }])
    )

    const text = await box.run('ki repo --repo repo roadmap list --horizon next --status draft')
    const accepted = await box.run('ki repo --repo repo roadmap list --status awaiting-review')
    const done = await box.run('ki repo --repo repo roadmap list --status done')
    const empty = await box.run('ki repo --repo repo roadmap list --horizon now')
    const agora = await box.run('ki repo --agora estate roadmap list --status awaiting-review')
    const format = await box.run('ki repo --repo repo roadmap list --format json')

    expect(text).toEqual({
      exitCode: 0,
      output: `╭─ KI REPO ROADMAP\n│  ╰─ 📁 repo (${root})\n├─ roadmap (1)\n│  ╰─ next (1)\n│     ╰─ KI-TOOL-CLI-003 [draft] Inspect governed work\n├─ trades (0)\n│  ├─ import (0)\n│  ╰─ export (0)\n╰─ summary: ITEMS=1 ACTIVE=1 DONE=0 TRADES=0 IMPORTS=0 EXPORTS=0\n`
    })
    expect(accepted.output).toContain('KI-TOOL-CLI-010 [awaiting-review] Cleanup')
    expect(accepted.output).toContain('summary: ITEMS=1 ACTIVE=1 DONE=0')
    expect(done.output).toContain('summary: ITEMS=1 ACTIVE=0 DONE=1')
    expect(accepted.output).not.toContain('KI-TOOL-CLI-003')
    expect(agora.output).toContain('KI-TOOL-CLI-010 [awaiting-review] Cleanup')
    expect(empty.output).toContain('├─ roadmap (0)\n├─ trades (0)')
    expect(empty.output).toContain('summary: ITEMS=0 ACTIVE=0 DONE=0')
    expect(empty.output).not.toContain('items: none')
    expect(format.exitCode).toBe(2)
    expect(format.output).toContain("unknown option '--format' for 'ki repo roadmap list'")
  })

  test('ignores the canonical issue-allocation ledger when reading work items', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('repo/docs/roadmap/_ISSUES.md', 'last_id: 3\n')
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('roadmap (1)')
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
  })

  test('aggregates selected roadmaps while treating absent roots as empty', async () => {
    const box = await sandbox()
    await box.project.write('first/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('first/docs/roadmap/KI-TOOL-CLI-003-now.md', item({ horizon: 'now' }))
    await box.project.write('second/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'second/docs/roadmap/KI-TOOL-CLI-004-next.md',
      item({ id: 'KI-TOOL-CLI-004', title: 'Next work' })
    )
    await box.project.write('absent/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')

    const result = await box.run('ki repo --repo first --repo second --repo absent roadmap list --aggregate --no-icons')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('╭─ KI AGGREGATE ROADMAP')
    expect(result.output).toContain('now (1)')
    expect(result.output).toContain('next (1)')
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(result.output).toContain('KI-TOOL-CLI-004 [draft] Next work')
    expect(result.output).not.toContain('📁 first (1)')
    expect(result.output).not.toContain('📁 second (1)')
    expect(result.output).toContain('no roadmap (1)')
    expect(result.output).toContain('📁 absent')
    expect(result.output).toContain('summary: REPOSITORIES=3 ROADMAPS=2 NO_ROADMAP=1 ITEMS=2 ACTIVE=2 DONE=0 TRADES=0')
  })

  test('keeps malformed and unreadable roadmap roots as aggregate diagnostics', async () => {
    const box = await sandbox()
    await box.project.write('file/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('file/docs/roadmap', 'not a directory\n')
    await box.project.write('unreadable/.ki-config.toml', knowledgeBaseConfiguration())
    const unreadable = await box.project.mkdir('unreadable')
    roadmapStatFailure.path = `${unreadable}/Streams/Roadmap`

    const result = await box.run('ki repo --repo file --repo unreadable roadmap list --aggregate --no-icons')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('diagnostics (2)')
    expect(result.output).toContain('has no physical')
    expect(result.output).toContain('roadmap stat failure')
    expect(result.output).toContain('NO_ROADMAP=0')
  })

  test('isolates missing, malformed, invalid-status, and unsafe roadmap entries', async () => {
    const box = await sandbox()
    await box.project.write('valid/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'valid/docs/roadmap/KI-TOOL-CLI-003-inspect.md',
      item({ blocks: '[KI-TOOL-CLI-010]', transferred_from: 'example/source' })
    )
    await box.project.write('missing/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('invalid-status/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('invalid-status/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item({ status: 'closed' }))
    await box.project.write('unsafe/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('unsafe/docs/roadmap/target.md', item())
    await symlink(
      `${box.project.path}/unsafe/docs/roadmap/target.md`,
      `${box.project.path}/unsafe/docs/roadmap/KI-TOOL-CLI-003-inspect.md`
    )
    const valid = await realpath(`${box.project.path}/valid`)
    const missing = await realpath(`${box.project.path}/missing`)
    const invalidStatus = await realpath(`${box.project.path}/invalid-status`)
    const unsafe = await realpath(`${box.project.path}/unsafe`)

    const result = await box.run([
      'ki',
      'repo',
      '--repo',
      valid,
      '--repo',
      missing,
      '--repo',
      invalidStatus,
      '--repo',
      unsafe,
      'roadmap',
      'list'
    ])
    const retiredFormat = await box.run('ki repo --repo valid roadmap list --format yaml')

    expect(result.output).toContain(
      `│  ╰─ 📁 valid (${valid})\n├─ roadmap (1)\n│  ╰─ next (1)\n│     ╰─ KI-TOOL-CLI-003 [draft] Inspect governed work`
    )
    expect(result.output).toContain(`│  ╰─ ○ no roadmap`)
    expect(result.output).not.toContain(`repository ${missing} has no physical docs/roadmap directory`)
    expect(result.output).toContain(`│  ╰─ ❌ work item KI-TOOL-CLI-003-inspect.md has an invalid lifecycle status`)
    expect(result.output).toContain(`│  ╰─ ❌ work item KI-TOOL-CLI-003-inspect.md must be a regular file`)
    expect(result.exitCode).toBe(1)
    expect(retiredFormat.exitCode).toBe(2)
    expect(retiredFormat.output).toContain("unknown option '--format' for 'ki repo roadmap list'")
  })

  test('orders non-empty text output by horizon, lifecycle, then identifier', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    const items = [
      ['KI-TOOL-CLI-006', 'Blocking draft', 'now', 'draft'],
      ['KI-TOOL-CLI-005', 'Blocking done', 'now', 'done'],
      ['KI-TOOL-CLI-014', 'Next draft', 'next', 'draft'],
      ['KI-TOOL-CLI-013', 'Next ready', 'next', 'ready'],
      ['KI-TOOL-CLI-012', 'Next in progress', 'next', 'in-progress'],
      ['KI-TOOL-CLI-011', 'Next awaiting-review', 'next', 'awaiting-review'],
      ['KI-TOOL-CLI-010', 'Next done later', 'next', 'done'],
      ['KI-TOOL-CLI-009', 'Next done first', 'next', 'done'],
      ['KI-TOOL-CLI-015', 'Soon', 'soon', 'draft'],
      ['KI-TOOL-CLI-016', 'Waiting', 'waiting-for', 'draft'],
      ['KI-TOOL-CLI-017', 'Parked', 'parked', 'draft'],
      ['KI-TOOL-CLI-018', 'Future', 'future', 'draft']
    ] as const
    for (const [id, title, horizon, status] of items) {
      await box.project.write(
        `repo/docs/roadmap/${id}-item.md`,
        item({ id, title, horizon, status, ...(horizon === 'future' ? { candidate: 'true' } : {}) })
      )
    }

    const result = await box.run('ki repo --repo repo roadmap list')

    const expectedOrder = [
      '│  ├─ now',
      '│  │  ├─ KI-TOOL-CLI-005 [done] Blocking done',
      '│  │  ╰─ KI-TOOL-CLI-006 [draft] Blocking draft',
      '│  ├─ next',
      '│  │  ├─ KI-TOOL-CLI-009 [done] Next done first',
      '│  │  ├─ KI-TOOL-CLI-010 [done] Next done later',
      '│  │  ├─ KI-TOOL-CLI-011 [awaiting-review] Next awaiting-review',
      '│  │  ├─ KI-TOOL-CLI-012 [in-progress] Next in progress',
      '│  │  ├─ KI-TOOL-CLI-013 [ready] Next ready',
      '│  │  ╰─ KI-TOOL-CLI-014 [draft] Next draft',
      '│  ├─ soon',
      '│  ├─ waiting-for',
      '│  ├─ parked',
      '│  ╰─ future',
      '│     ╰─ KI-TOOL-CLI-018 [draft] Future'
    ]
    let previous = -1
    for (const line of expectedOrder) {
      const index = result.output.indexOf(line)
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
  })

  test('includes registered inbound and outbound trade context for each selected repository', async () => {
    const box = await sandbox()
    const source = await box.project.mkdir('source')
    const receiver = await box.project.mkdir('receiver')
    const sourceHome = 'https://github.com/example/source'
    const receiverHome = 'https://github.com/example/receiver'
    const id = 'TRD-00000000'
    const peer = (route: string): string => route.slice('https://github.com/'.length)
    const configuration = (repository: string, exportsTo: readonly string[], importsFrom: readonly string[]): string =>
      [
        '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]',
        `repository = ${JSON.stringify(repository)}`,
        '',
        '[skills.ki-trades]',
        '',
        '[skills.ki-trades.routes]',
        ...exportsTo.map((route) => `${JSON.stringify(peer(route))} = { export = ["work", "knowledge"] }`),
        ...importsFrom.map((route) => `${JSON.stringify(peer(route))} = { import = ["work", "knowledge"] }`),
        ''
      ].join('\n')
    const record = (recordId: string, kind: 'work' | 'knowledge', status = ''): string =>
      `---\nid: ${recordId}\ntitle: Trade-aware planning\ncreated_at: 2026-08-05T12:00:00Z\nsender: example/source\nreceiver: example/receiver\nkind: ${kind}\nsource_ref: KI-TOOL-CLI-012\nobservation: decision\nphase: ${status ? 'received' : 'submitted'}${status}\n---\n# ${recordId}: Trade-aware planning\n\n## Context\n\nTrade context.\n\n## Submission\n\nShow trades with roadmap work.\n\n## Constraints\n\nRemain read-only.\n`
    await box.project.write('source/.ki-config.toml', configuration(sourceHome, [receiverHome], []))
    await box.project.write('receiver/.ki-config.toml', configuration(receiverHome, [], [sourceHome]))
    await box.project.write('source/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())
    await box.project.write('receiver/docs/roadmap/KI-TOOL-CLI-004-inspect.md', item({ id: 'KI-TOOL-CLI-004' }))
    await box.project.write(`source/-/_TRADES/example/receiver/${id}.md`, record(id, 'work'))
    await box.project.write(
      `receiver/+/_TRADES/example/source/${id}.md`,
      record(id, 'work', '\ndecision_status: unconsidered')
    )
    await box.project.write('source/-/_TRADES/example/receiver/TRD-00000002.md', record('TRD-00000002', 'work'))
    await box.project.write(
      'receiver/+/_TRADES/example/source/TRD-00000002.md',
      record('TRD-00000002', 'work', '\ndecision_status: unconsidered')
    )
    await box.project.write('source/-/_TRADES/example/receiver/TRD-00000001.md', record('TRD-00000001', 'knowledge'))
    await box.project.write(
      'receiver/+/_TRADES/example/source/TRD-00000001.md',
      record('TRD-00000001', 'knowledge', '\ndecision_status: unconsidered')
    )
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        { key: 'source', repository: 'https://github.com/example/source', path: source },
        { key: 'receiver', repository: 'https://github.com/example/receiver', path: receiver }
      ])
    )

    const result = await box.run('ki repo --repo source --repo receiver roadmap list')
    const plain = await box.run('ki repo --repo source roadmap list --no-icons')

    expect(result.output).toContain(
      `│  ╰─ export (3)\n│     ├─ ${id} [⚒ work] → [? decision] receiver [unconsidered] Trade-aware planning\n│     ├─ TRD-00000001 [ⓘ knowledge] → [? decision] receiver [unconsidered] Trade-aware planning\n│     ╰─ TRD-00000002 [⚒ work] → [? decision] receiver [unconsidered] Trade-aware planning`
    )
    expect(result.output).toContain(
      `│  ├─ import (3)\n│  │  ├─ ${id} [? decision] ← [⚒ work] source [unconsidered] Trade-aware planning\n│  │  ├─ TRD-00000001 [? decision] ← [ⓘ knowledge] source [unconsidered] Trade-aware planning\n│  │  ╰─ TRD-00000002 [? decision] ← [⚒ work] source [unconsidered] Trade-aware planning`
    )
    expect(plain.output).toContain(`${id} [work] → [decision] receiver [unconsidered] Trade-aware planning`)
    expect(result.output).toContain('TRADES=3 IMPORTS=0 EXPORTS=3')
    expect(result.output).toContain('TRADES=3 IMPORTS=3 EXPORTS=0')
    expect(result.exitCode).toBe(0)

    await box.project.write(
      `source/-/_TRADES/example/receiver/TRD-00000003.md`,
      record('TRD-00000003', 'work').replace('Trade context.', '')
    )

    const bodyIncomplete = await box.run('ki repo --repo source roadmap list')

    expect(bodyIncomplete.exitCode).toBe(1)
    expect(bodyIncomplete.output).toContain('TRD-00000003.md requires non-empty Context section')

    await box.project.write(`source/-/_TRADES/example/receiver/TRD-00000003.md`, record('TRD-00000003', 'work'))
    await box.project.write('source/docs/roadmap/malformed.md', 'not a governed work item\n')
    const malformedRoadmap = await box.run('ki repo --repo source roadmap list')

    expect(malformedRoadmap.exitCode).toBe(1)
    expect(malformedRoadmap.output).toContain('must declare canonical frontmatter')
    expect(malformedRoadmap.output).toContain('├─ trades (4)')
  })

  test('rejects every malformed canonical frontmatter shape', async () => {
    const box = await sandbox()
    const cases = [
      ['absent.md', 'no frontmatter\n', 'must declare canonical frontmatter'],
      ['invalid.md', '---\nwrong\n---\n', 'frontmatter must contain simple key-value fields'],
      ['missing.md', '---\nid: KI-TOOL-CLI-003\n---\n', 'must declare title'],
      ['extra.md', item({ extra: 'field' }), 'has unsupported or repeated field extra'],
      [
        'repeated.md',
        item().replace('title: Inspect governed work', 'title: Inspect governed work\ntitle: Repeated title'),
        'has unsupported or repeated field title'
      ],
      ['id.md', item({ id: 'wrong' }), 'must use a matching work-item identifier'],
      ['KI-TOOL-CLI-003-invalid.md', item({ theme: 'Wrong' }), 'has invalid title, theme, or horizon'],
      ['KI-TOOL-CLI-003-baseline.md', item({ baseline_ref: 'wrong' }), 'baseline_ref must be null or a full commit ID'],
      ['KI-TOOL-CLI-003-future.md', item({ horizon: 'future' }), 'must use candidate: true only for future items'],
      ['KI-TOOL-CLI-003-candidate.md', item({ candidate: 'true' }), 'must use candidate: true only for future items'],
      ['KI-TOOL-CLI-003-list.md', item({ blocks: '[wrong]' }), 'blocks must be an identifier array']
    ] as const
    for (const [index, [name, contents, message]] of cases.entries()) {
      const repository = `repo-${index}`
      await box.project.write(`${repository}/.ki-config.toml`, '[repo]\nharnesses = ["example/harness"]\n')
      await box.project.write(`${repository}/docs/roadmap/${name}`, contents)
      const result = await box.run(`ki repo --repo ${repository} roadmap list`)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(message)
    }
  })

  test('accepts quoted scalar frontmatter values', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md',
      item({ id: "'KI-TOOL-CLI-003'", title: '"Inspect governed work"', theme: "'cli'" })
    )

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
  })

  test('accepts contract-owned optional frontmatter fields', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md',
      item({
        area: 'CLI',
        transferred_from: 'example/source',
        'housekeeping-template': 'HK-001',
        'scheduled-for': '2026-08-09'
      })
    )

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(result.output).not.toContain('has unsupported or repeated field area')
    expect(result.output).not.toContain('has unsupported or repeated field transferred_from')
    expect(result.output).not.toContain('has unsupported or repeated field housekeeping-template')
  })

  test('prunes only completed items across selected repositories after every target is valid', async () => {
    const box = await sandbox()
    await box.project.write('first/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('first/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    await box.project.write('first/docs/roadmap/KI-TOOL-CLI-004-draft.md', item({ id: 'KI-TOOL-CLI-004' }))
    await box.project.write('second/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'second/docs/roadmap/KI-TOOL-CLI-005-done.md',
      item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    )
    const first = await realpath(`${box.project.path}/first`)
    const second = await realpath(`${box.project.path}/second`)

    const exact = await box.run('ki repo --repo first roadmap prune KI-TOOL-CLI-003')
    const notDone = await box.run('ki repo --repo first roadmap prune KI-TOOL-CLI-004')
    const missing = await box.run('ki repo --repo first roadmap prune KI-TOOL-CLI-999')
    const multiple = await box.run([
      'ki',
      'repo',
      '--repo',
      first,
      '--repo',
      second,
      'roadmap',
      'prune',
      'KI-TOOL-CLI-005'
    ])
    const pruned = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'roadmap', 'prune'])
    const empty = await box.run('ki repo --repo first roadmap prune')

    expect(exact).toEqual({
      exitCode: 0,
      output: `pruned ${first}: KI-TOOL-CLI-003 [done] Inspect governed work\nki repo roadmap prune: removed 1 done work item(s)\n`
    })
    expect(notDone).toEqual({
      exitCode: 2,
      output: 'ki: error: work item KI-TOOL-CLI-004 must be done before pruning\n'
    })
    expect(missing).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${first} must contain exactly one work item KI-TOOL-CLI-999\n`
    })
    expect(multiple).toEqual({
      exitCode: 2,
      output: 'ki: error: ki repo roadmap prune requires exactly one repository target\n'
    })
    expect(pruned).toEqual({
      exitCode: 0,
      output: `pruned ${second}: KI-TOOL-CLI-005 [done] Inspect governed work\nki repo roadmap prune: removed 1 done work item(s)\n`
    })
    await expect(box.project.read('first/docs/roadmap/KI-TOOL-CLI-003-done.md')).rejects.toThrow()
    await expect(box.project.read('second/docs/roadmap/KI-TOOL-CLI-005-done.md')).rejects.toThrow()
    await expect(box.project.read('first/docs/roadmap/KI-TOOL-CLI-004-draft.md')).resolves.toContain('status: draft')
    expect(empty).toEqual({ exitCode: 0, output: 'ki repo roadmap prune: no done work items\n' })

    await box.project.write('invalid/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'invalid/docs/roadmap/KI-TOOL-CLI-006-invalid.md',
      item({ id: 'KI-TOOL-CLI-006', status: 'closed' })
    )
    await box.project.write(
      'first/docs/roadmap/KI-TOOL-CLI-007-done.md',
      item({ id: 'KI-TOOL-CLI-007', status: 'done' })
    )
    const invalid = await realpath(`${box.project.path}/invalid`)

    const rejected = await box.run(['ki', 'repo', '--repo', first, '--repo', invalid, 'roadmap', 'prune'])

    expect(rejected.exitCode).toBe(2)
    expect(rejected.output).toContain('has an invalid lifecycle status')
    await expect(box.project.read('first/docs/roadmap/KI-TOOL-CLI-007-done.md')).resolves.toContain('status: done')
  })

  test('promotes and demotes one explicit item with directional horizon validation', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-next.md',
      `${item({ title: 'Priority item' })}\ncandidate: body content remains.\n`
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-004-future.md',
      item({ id: 'KI-TOOL-CLI-004', title: 'Future item', horizon: 'future', candidate: 'true' })
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-005-now.md', item({ id: 'KI-TOOL-CLI-005', horizon: 'now' }))
    await box.project.write('other/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('other/docs/roadmap/KI-TOOL-CLI-003-item.md', item())
    const root = await realpath(`${box.project.path}/repo`)
    const other = await realpath(`${box.project.path}/other`)

    const promote = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-003')
    const demoteDirect = await box.run('ki repo --repo repo roadmap demote KI-TOOL-CLI-003 future')
    const promoteDirect = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-004 next')
    const promoted = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-004-future.md')
    const demoted = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-003-next.md')
    const unknown = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-003 unknown')
    const backwards = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-003 future')
    const same = await box.run('ki repo --repo repo roadmap demote KI-TOOL-CLI-004 next')
    const promoteLimit = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-005')
    const demoteLimit = await box.run('ki repo --repo repo roadmap demote KI-TOOL-CLI-003')
    const missing = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-999')
    const multiple = await box.run([
      'ki',
      'repo',
      '--repo',
      root,
      '--repo',
      other,
      'roadmap',
      'promote',
      'KI-TOOL-CLI-003'
    ])

    expect(promote).toEqual({ exitCode: 0, output: 'ki repo roadmap promote: KI-TOOL-CLI-003 next -> now\n' })
    expect(demoteDirect).toEqual({ exitCode: 0, output: 'ki repo roadmap demote: KI-TOOL-CLI-003 now -> future\n' })
    expect(promoteDirect).toEqual({ exitCode: 0, output: 'ki repo roadmap promote: KI-TOOL-CLI-004 future -> next\n' })
    expect(promoted).toContain('horizon: next')
    expect(promoted).not.toContain('candidate: true')
    expect(demoted).toContain('horizon: future\ncandidate: true')
    expect(demoted).toContain('## Discussion\n\n### Test\n\nTest.\n')
    expect(demoted).toContain('candidate: body content remains.')
    expect(unknown.output).toContain('roadmap promote horizon must be one of')
    expect(backwards.output).toContain('roadmap promote must move KI-TOOL-CLI-003 toward now')
    expect(same.output).toContain('roadmap demote must move KI-TOOL-CLI-004 toward future')
    expect(promoteLimit.output).toContain('work item KI-TOOL-CLI-005 is already at the promote limit')
    expect(demoteLimit.output).toContain('work item KI-TOOL-CLI-003 is already at the demote limit')
    expect(missing.output).toContain(`repository ${root} must contain exactly one work item KI-TOOL-CLI-999`)
    expect(multiple.output).toContain('ki repo roadmap promote requires exactly one repository target')
  })

  test('rejects ambiguous roadmap identifiers before changing or pruning a work item', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-first.md', item())
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-second.md', item({ title: 'Duplicate item' }))

    const result = await box.run('ki repo --repo repo roadmap demote KI-TOOL-CLI-003')
    const prune = await box.run('ki repo --repo repo roadmap prune KI-TOOL-CLI-003')

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('must contain exactly one work item KI-TOOL-CLI-003')
    expect(prune.output).toContain('must contain exactly one work item KI-TOOL-CLI-003')
    await expect(box.project.read('repo/docs/roadmap/KI-TOOL-CLI-003-first.md')).resolves.toContain('horizon: next')
    await expect(box.project.read('repo/docs/roadmap/KI-TOOL-CLI-003-second.md')).resolves.toContain('horizon: next')
  })

  test('rejects the retired plan namespace', async () => {
    const box = await sandbox()

    expect((await box.run('ki repo plan list')).exitCode).toBe(2)
  })
})
