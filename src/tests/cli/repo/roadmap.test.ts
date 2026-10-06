import { execFileSync } from 'node:child_process'
import { chmod, realpath, rm, symlink } from 'node:fs/promises'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { runCommand, sandbox } from '../_cli_helper.ts'
import { capitalHome, home, writeCapital } from '../_territory_helper.ts'

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

const item = (overrides: Record<string, string | undefined> = {}): string => {
  const fields = {
    id: 'KI-TOOL-CLI-003',
    title: 'Inspect governed work',
    theme: 'cli',
    horizon: 'next',
    status: 'draft',
    blocks: '[]',
    blocked_by: '[]',
    baseline_ref: 'null',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides
  }
  return `---\n${Object.entries(fields)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}:${value.startsWith('\n') ? value : ` ${value}`}`)
    .join('\n')}\n---\n\n## Context\n\nTest item.\n\n## Boundary\n\nNone.\n\n## Discussion\n\n### Test\n\nTest.\n`
}

const taskLinks = [
  '',
  '  paperclip:',
  '    - authority: http://127.0.0.1:3100',
  '      scope: 558dd49e-7615-409f-b7b2-7f19e22171d9',
  '      id: b76a4ec9-be48-4a3c-8568-7885b5e6789b',
  '      key: KIS-5',
  '      url: http://127.0.0.1:3100/KIS/issues/KIS-5',
  '      relation: implementation',
  '    - authority: http://127.0.0.1:3100',
  '      scope: 558dd49e-7615-409f-b7b2-7f19e22171d9',
  '      id: 7afd7214-386e-455f-83bd-6ac4c9f1bf7f',
  '      key: KIS-5',
  '      url: http://127.0.0.1:3100/KIS/issues/KIS-6',
  '      relation: evaluation',
  '  linear:',
  '    - authority: https://linear.app',
  '      scope: example',
  '      id: 12345678-1234-1234-1234-123456789abc',
  '      key: KIS-5',
  '      url: https://linear.app/example/issue/KIS-5',
  '      relation: related'
].join('\n')

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

[skills.ki-repo-kb]

[skills.ki-repo]
primary_shape = "ki-repo-kb"
repository = "https://github.com/example/knowledge"
capital = "https://github.com/example/capital"
repo_type = "kb"
store_roles = ["notes"]

[skills.ki-work]
adapter = "kb-streams"

[skills.ki-repo-kb-streams]

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
  test('rejects unknown list filters before reading repository inventory', async () => {
    const box = await sandbox()
    expect(await box.run('ki repo roadmap list --horizon bogus')).toEqual({
      exitCode: 2,
      output: 'ki: error: roadmap list --horizon must be one of now, next, soon, waiting-for, parked, future, triage\n'
    })
    expect(await box.run('ki repo roadmap list --status bogus')).toEqual({
      exitCode: 2,
      output: 'ki: error: roadmap list --status must be one of done, awaiting-review, in-progress, ready, draft\n'
    })
  })
  test('summarizes selected roadmaps without listing records or reading trades', async () => {
    const box = await sandbox()
    const configuration = knowledgeBaseConfiguration('\n[skills.ki-trades]\n')
    for (const repository of ['knowledge', 'delivery', 'empty', 'absent'])
      await box.project.write(`${repository}/.ki.toml`, configuration)
    await box.project.mkdir('empty/Streams/Roadmap')
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-now.md',
      item({ id: 'KBS-001', title: 'First item', horizon: 'now', status: 'ready' })
    )
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-002-next.md',
      item({ id: 'KBS-002', title: 'Second item', horizon: 'next', status: 'draft' })
    )
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-003-triage.md',
      item({ id: 'KBS-003', title: 'Third item', horizon: 'triage', status: 'draft' })
    )
    await box.project.write('knowledge/-/_TRADES/example/receiver/TRD-00000001.md', 'not a trade record\n')
    for (const [index, status] of ['in-progress', 'awaiting-review', 'done'].entries())
      await box.project.write(
        `delivery/Streams/Roadmap/KBS-00${index + 4}-item.md`,
        item({ id: `KBS-00${index + 4}`, horizon: 'next', status })
      )

    const result = await box.run('ki repo --repo knowledge --repo delivery --repo empty --repo absent roadmap summary')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI REPO ROADMAP SUMMARY')
    const lines = result.output.split('\n')
    expect(lines[0]).toMatch(/^╭─ KI REPO ROADMAP SUMMARY ─+╮$/)
    expect(lines[0]?.length).toBe(lines.find((line) => line.startsWith('╰'))?.length)
    expect(lines[1]?.startsWith('│ Repository ')).toBe(true)
    const rows = result.output
      .split('\n')
      .filter((line) => line.startsWith('│ '))
      .map((line) =>
        line
          .split('│')
          .slice(1, -1)
          .map((cell) => cell.trim())
      )
    expect(rows).toEqual([
      ['Repository', 'now', 'next', 'soon', 'waiting-for', 'parked', 'future', 'triage', 'Σ'],
      ['knowledge', 'r=1 Σ=1', 'd=1 Σ=1', '—', '—', '—', '—', 'd=1 Σ=1', 'd=2 r=1 Σ=3'],
      ['delivery', '—', 'ip=1 ar=1 x=1 Σ=3', '—', '—', '—', '—', '—', 'ip=1 ar=1 x=1 Σ=3'],
      ['empty', '—', '—', '—', '—', '—', '—', '—', '—'],
      ['absent', '—', '—', '—', '—', '—', '—', '—', '—'],
      ['Σ', 'r=1 Σ=1', 'd=1 ip=1 ar=1 x=1 Σ=4', '—', '—', '—', '—', 'd=1 Σ=1', 'd=2 r=1 ip=1 ar=1 x=1 Σ=6']
    ])
    expect(result.output).not.toContain('\nStatuses\n')
    expect(result.output).toContain('d=draft r=ready ip=in-progress ar=awaiting-review x=done; Σ=total')
    expect(result.output).toContain('— no items; ? unavailable')
    expect(result.output).toContain('No roadmap: absent')
    expect(result.output).not.toContain('KBS-001')
    expect(result.output).not.toContain('First item')
    expect(result.output).not.toContain('TRD-00000001')
  })

  test('summarizes valid items but diagnoses malformed roadmap records', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', knowledgeBaseConfiguration())
    await box.project.write('repo/Streams/Roadmap/KBS-001-valid.md', item({ id: 'KBS-001' }))
    await box.project.write('repo/Streams/Roadmap/KBS-002-invalid.md', item({ id: 'KBS-002', status: 'closed' }))

    const result = await box.run('ki repo --repo repo roadmap summary')

    expect(result.exitCode).toBe(1)
    expect(result.output).toMatch(/│ repo\s+│\s+— │\s+d=1 Σ=1 │/)
    expect(result.output).toMatch(/│\s+d=1 Σ=1 │\n/)
    expect(result.output).toContain('has an invalid lifecycle status')
    expect(result.output).toContain('counts include valid items only')
    expect(result.output).not.toContain('Inspect governed work')

    await box.project.write('misconfigured/.ki.toml', knowledgeBaseConfiguration().replace('kb-streams', 'roadmap'))
    const unavailable = await box.run('ki repo --repo misconfigured roadmap summary')
    expect(unavailable.exitCode).toBe(1)
    expect(unavailable.output).toContain('[skills.ki-work].adapter = "roadmap" does not apply to repo_type = "kb"')
    expect(unavailable.output).toMatch(/│ misconfigured\s+│\s+\? │/)
    expect(unavailable.output).not.toContain('No roadmap:')
  })

  test('distinguishes repositories with the same basename in the summary', async () => {
    const box = await sandbox()
    for (const repository of ['first/repo', 'second/repo'])
      await box.project.write(`${repository}/.ki.toml`, knowledgeBaseConfiguration())

    const result = await box.run('ki repo --repo first/repo --repo second/repo roadmap summary')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(await realpath(`${box.project.path}/first/repo`))
    expect(result.output).toContain(await realpath(`${box.project.path}/second/repo`))
  })

  test('lists flat Knowledge Base work items from the declared Streams roadmap and ignores its ledger', async () => {
    const box = await sandbox()
    await box.project.write('knowledge/.ki.toml', knowledgeBaseConfiguration())
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
      item({ id: 'KBS-002', title: 'Later proposal', horizon: 'future' })
    )
    const before = await box.project.read('knowledge/Streams/Roadmap/KBS-001-native-proposal.md')
    const ledger = await box.project.read('knowledge/Streams/Roadmap/_ISSUES.md')
    const index = await box.project.read('knowledge/Streams/Roadmap/Roadmap.md')

    const result = await box.run('ki repo --repo knowledge roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('├─ roadmap (2)')
    expect(result.output).toContain('KBS-001 [awaiting-review] Native proposal')
    expect(result.output).toContain('KBS-002 [draft] Later proposal')
    expect(result.output).toContain('╰─ summary: ITEMS=2 NOT_DONE=2 DONE=0 TRADES=0 IMPORTS=0 EXPORTS=0')
    expect(result.output).not.toContain('_ISSUES')
    expect(result.output).not.toContain('Roadmap.md')
    expect(await box.project.read('knowledge/Streams/Roadmap/KBS-001-native-proposal.md')).toBe(before)
    expect(await box.project.read('knowledge/Streams/Roadmap/_ISSUES.md')).toBe(ledger)
    expect(await box.project.read('knowledge/Streams/Roadmap/Roadmap.md')).toBe(index)
    await expect(box.project.read('knowledge/docs/roadmap')).rejects.toThrow()
  })

  test('projects adapter-owned KB metadata alongside a strict project roadmap in one selection', async () => {
    const box = await sandbox()
    await box.project.write('knowledge/.ki.toml', knowledgeBaseConfiguration())
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-native-proposal.md',
      item({ id: 'KBS-001', title: 'Native proposal', ...knowledgeBaseMetadata })
    )
    await box.project.write(
      'project/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('project/docs/roadmap/KI-TOOL-CLI-003-project-item.md', item())

    const result = await box.run(
      'ki repo --repo project --repo knowledge roadmap list --horizon next --status draft --no-icons'
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(result.output).toContain('KBS-001 [draft] Native proposal')
    expect(result.output).not.toContain('unsupported or repeated field note_type')
  })

  test('resolves roadmaps only from the declared work adapter and its adapter table', async () => {
    const box = await sandbox()
    const project =
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    await box.project.write('undeclared/.ki.toml', project)
    await box.project.write('undeclared/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    await box.project.write(
      'remote/.ki.toml',
      `${project}\n[skills.ki-work]\nadapter = "github-issues"\n\n[skills.ki-work-github-issues]\n`
    )
    await box.project.write('remote/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    await box.project.write('untabled/.ki.toml', `${project}\n[skills.ki-work]\nadapter = "roadmap"\n`)
    await box.project.write('unknown/.ki.toml', `${project}\n[skills.ki-work]\nadapter = "jira"\n`)
    await box.project.write(
      'inapplicable/.ki.toml',
      `${project}\n[skills.ki-work]\nadapter = "kb-streams"\n\n[skills.ki-repo-kb-streams]\n`
    )
    const undeclared = await realpath(`${box.project.path}/undeclared`)

    const listed = await box.run('ki repo --repo undeclared --repo remote roadmap list --no-icons')
    const pruned = await box.run('ki repo --repo undeclared --repo remote roadmap prune')
    const exact = await box.run('ki repo --repo undeclared roadmap prune KI-TOOL-CLI-003')
    const moved = await box.run('ki repo --repo remote roadmap promote KI-TOOL-CLI-003')
    const untabled = await box.run('ki repo --repo untabled roadmap list')
    const unknown = await box.run('ki repo --repo unknown roadmap prune')
    const inapplicable = await box.run('ki repo --repo inapplicable roadmap list')

    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain('no roadmap')
    expect(listed.output).not.toContain('KI-TOOL-CLI-003')
    expect(pruned).toEqual({ exitCode: 0, output: 'ki repo roadmap prune: no done work items\n' })
    expect(exact).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${undeclared} declares no local roadmap adapter\n`
    })
    expect(moved.exitCode).toBe(2)
    expect(moved.output).toContain('declares no local roadmap adapter')
    expect(untabled.exitCode).toBe(1)
    expect(untabled.output).toContain('[skills.ki-work].adapter = "roadmap" requires [skills.ki-work-roadmap]')
    expect(unknown.exitCode).toBe(2)
    expect(unknown.output).toContain('[skills.ki-work].adapter must be one of "roadmap", "kb-streams"')
    expect(inapplicable.exitCode).toBe(1)
    expect(inapplicable.output).toContain(
      '[skills.ki-work].adapter = "kb-streams" does not apply to repo_type = "project"'
    )
    await expect(box.project.read('undeclared/docs/roadmap/KI-TOOL-CLI-003-done.md')).resolves.toContain('status: done')
    await expect(box.project.read('remote/docs/roadmap/KI-TOOL-CLI-003-done.md')).resolves.toContain('status: done')
  })

  test('treats absent Knowledge Base roadmaps as empty but diagnoses malformed and misconfigured ones', async () => {
    const box = await sandbox()
    const configuration = knowledgeBaseConfiguration()
    await box.project.write('missing/.ki.toml', configuration)
    await box.project.write('missing/docs/roadmap/KI-TOOL-CLI-003-project-item.md', item())
    await box.project.write('malformed/.ki.toml', configuration)
    await box.project.write('malformed/Streams/Roadmap/KBS-001-valid.md', item({ id: 'KBS-001', title: 'Valid' }))
    await box.project.write('malformed/Streams/Roadmap/KBS-002-invalid.md', item({ id: 'KBS-002', status: 'closed' }))
    await box.project.write('misconfigured/.ki.toml', configuration.replace('kb-streams', 'roadmap'))
    await box.project.write('misconfigured/docs/roadmap/KI-TOOL-CLI-003-project-item.md', item())
    await box.project.write('repeated/.ki.toml', configuration)
    await box.project.write(
      'repeated/Streams/Roadmap/KBS-001-repeated.md',
      item({ id: 'KBS-001', ...knowledgeBaseMetadata }).replace(
        'title: Inspect governed work',
        'title: Inspect governed work\ntitle: Repeated title'
      )
    )
    await box.project.write('structured-common/.ki.toml', configuration)
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
    expect(misconfigured.output).toContain('[skills.ki-work].adapter = "roadmap" does not apply to repo_type = "kb"')
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
    await box.project.write('knowledge/.ki.toml', configuration)
    await box.project.write('broken/.ki.toml', configuration.replace('example/knowledge', 'example/broken'))
    await box.project.write('broken/Streams/Roadmap', 'not a directory\n')
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-001-native-proposal.md',
      item({ id: 'KBS-001', title: 'Native proposal', status: 'awaiting-review' })
    )
    await box.project.write('knowledge/-/_TRADES/example/receiver/TRD-00000001.md', 'not a trade record\n')
    const capital = await writeCapital(box, {
      members: [home('example/broken'), capitalHome, home('example/knowledge')]
    })
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        { key: 'knowledge', repository: 'https://github.com/example/knowledge', path: knowledge },
        { key: 'broken', repository: 'https://github.com/example/broken', path: broken },
        { key: 'capital', repository: capitalHome, path: capital }
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
    await box.project.write('knowledge/.ki.toml', knowledgeBaseConfiguration())
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
    expect(
      (
        await box.run('ki repo --repo knowledge roadmap promote KBS-001', {
          now: () => Date.parse('2026-09-02T00:00:00Z')
        })
      ).exitCode
    ).toBe(0)
    expect((await box.run('ki repo --repo knowledge roadmap prune --no-commit KBS-002')).exitCode).toBe(0)
    await expect(box.project.read('knowledge/Streams/Roadmap/KBS-001-next.md')).resolves.toBe(
      before
        .replace('horizon: next', 'horizon: now')
        .replace('updated_at: 2026-09-01T00:00:00Z', 'updated_at: 2026-09-02T00:00:00Z')
    )
    await expect(box.project.read('knowledge/Streams/Roadmap/KBS-002-done.md')).rejects.toThrow()
    await expect(box.project.read('knowledge/Streams/Roadmap/_ISSUES.md')).resolves.toBe('last_id: 2\n')
    await expect(box.project.read('knowledge/docs/roadmap')).rejects.toThrow()
  })

  test('lists and filters grouped governed work items without JSON output', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/repo"\n'
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item({ blocked_by: '[KI-OTHER-999]' }))
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-010-cleanup.md',
      item({
        id: 'KI-TOOL-CLI-010',
        title: 'Cleanup',
        horizon: 'future',
        status: 'awaiting-review',
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
    const invalidFormat = await box.run('ki repo --repo repo roadmap list --format yaml')

    expect(text).toEqual({
      exitCode: 0,
      output: `╭─ KI REPO ROADMAP\n│  ╰─ 📁 repo (${root})\n├─ roadmap (1)\n│  ╰─ next (1)\n│     ╰─ KI-TOOL-CLI-003 [draft] Inspect governed work\n├─ trades (0)\n│  ├─ import (0)\n│  ╰─ export (0)\n╰─ summary: ITEMS=1 NOT_DONE=1 DONE=0 TRADES=0 IMPORTS=0 EXPORTS=0\n`
    })
    expect(accepted.output).toContain('KI-TOOL-CLI-010 [awaiting-review] Cleanup')
    expect(accepted.output).toContain('summary: ITEMS=1 NOT_DONE=1 DONE=0')
    expect(done.output).toContain('summary: ITEMS=1 NOT_DONE=0 DONE=1')
    expect(accepted.output).not.toContain('KI-TOOL-CLI-003')
    expect(agora.output).toContain('KI-TOOL-CLI-010 [awaiting-review] Cleanup')
    expect(empty.output).toContain('├─ roadmap (0)\n├─ trades (0)')
    expect(empty.output).toContain('summary: ITEMS=0 NOT_DONE=0 DONE=0')
    expect(empty.output).not.toContain('items: none')
    expect(format.exitCode).toBe(0)
    expect(JSON.parse(format.output)).toEqual({
      schema: 'ki/roadmap/v1',
      repositories: [
        {
          identity: 'example/repo',
          repository: 'https://github.com/example/repo',
          roadmap: 'present',
          items: 3
        }
      ],
      items: expect.arrayContaining([
        {
          identity: 'example/repo',
          repository: 'https://github.com/example/repo',
          id: 'KI-TOOL-CLI-003',
          area: null,
          theme: 'cli',
          title: 'Inspect governed work',
          horizon: 'next',
          status: 'draft',
          blocks: [],
          blockedBy: ['KI-OTHER-999'],
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
          record: 'https://github.com/example/repo/blob/HEAD/docs/roadmap/KI-TOOL-CLI-003-inspect.md'
        }
      ])
    })
    expect(format.output).not.toContain(root)
    expect(invalidFormat).toEqual({
      exitCode: 2,
      output: 'ki: error: roadmap list --format must be text or json\n'
    })
  })

  test('ignores the canonical issue-allocation ledger when reading work items', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('repo/docs/roadmap/_ISSUES.md', 'last_id: 3\n')
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('roadmap (1)')
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
  })

  test('aggregates selected roadmaps while treating absent roots as empty', async () => {
    const box = await sandbox()
    await box.project.write(
      'first/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/first"\n'
    )
    await box.project.write('first/docs/roadmap/KI-TOOL-CLI-003-now.md', item({ horizon: 'now' }))
    await box.project.write(
      'second/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/second"\n'
    )
    await box.project.write(
      'second/docs/roadmap/KI-TOOL-CLI-004-next.md',
      item({ id: 'KI-TOOL-CLI-004', title: 'Next work' })
    )
    await box.project.write(
      'absent/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/absent"\n'
    )

    const result = await box.run('ki repo --repo first --repo second --repo absent roadmap list --aggregate --no-icons')
    const json = await box.run(
      'ki repo --repo first --repo second --repo absent roadmap list --aggregate --no-icons --format json --horizon next'
    )

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
    expect(result.output).toContain(
      'summary: REPOSITORIES=3 ROADMAPS=2 NO_ROADMAP=1 ITEMS=2 NOT_DONE=2 DONE=0 TRADES=0'
    )
    expect(json.exitCode).toBe(0)
    expect(JSON.parse(json.output)).toEqual({
      schema: 'ki/roadmap/v1',
      repositories: [
        {
          identity: 'example/first',
          repository: 'https://github.com/example/first',
          roadmap: 'present',
          items: 0
        },
        {
          identity: 'example/second',
          repository: 'https://github.com/example/second',
          roadmap: 'present',
          items: 1
        },
        {
          identity: 'example/absent',
          repository: 'https://github.com/example/absent',
          roadmap: 'absent',
          items: 0
        }
      ],
      items: [
        expect.objectContaining({
          identity: 'example/second',
          id: 'KI-TOOL-CLI-004',
          record: 'https://github.com/example/second/blob/HEAD/docs/roadmap/KI-TOOL-CLI-004-next.md'
        })
      ]
    })
    expect(json.output).not.toContain(box.project.path)
  })

  test('keeps malformed and unreadable roadmap roots as aggregate diagnostics', async () => {
    const box = await sandbox()
    await box.project.write(
      'file/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/file"\n'
    )
    await box.project.write('file/docs/roadmap', 'not a directory\n')
    await box.project.write('unreadable/.ki.toml', knowledgeBaseConfiguration())
    await box.project.write('unidentified/.ki.toml', 'not = [valid toml\n')
    const unreadable = await box.project.mkdir('unreadable')
    roadmapStatFailure.path = `${unreadable}/Streams/Roadmap`

    const result = await box.run('ki repo --repo file --repo unreadable roadmap list --aggregate --no-icons')
    const json = await box.run(
      'ki repo --repo file --repo unreadable --repo unidentified roadmap list --aggregate --format json'
    )

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('diagnostics (2)')
    expect(result.output).toContain('has no physical')
    expect(result.output).toContain('roadmap stat failure')
    expect(result.output).toContain('NO_ROADMAP=0')
    expect(json.exitCode).toBe(1)
    expect(JSON.parse(json.output)).toEqual({
      schema: 'ki/roadmap/v1',
      repositories: [
        {
          identity: 'example/file',
          repository: 'https://github.com/example/file',
          roadmap: 'unavailable',
          items: 0
        },
        {
          identity: 'example/knowledge',
          repository: 'https://github.com/example/knowledge',
          roadmap: 'unavailable',
          items: 0
        },
        {
          identity: null,
          repository: null,
          roadmap: 'unavailable',
          items: 0
        }
      ],
      items: []
    })
    expect(json.output).not.toContain(box.project.path)
    expect(json.output).not.toContain('roadmap stat failure')
  })

  test('isolates missing, malformed, invalid-status, and unsafe roadmap entries', async () => {
    const box = await sandbox()
    await box.project.write(
      'valid/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'valid/docs/roadmap/KI-TOOL-CLI-003-inspect.md',
      item({ blocks: '[KI-TOOL-CLI-010]', transferred_from: 'example/source' })
    )
    await box.project.write(
      'missing/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'invalid-status/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('invalid-status/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item({ status: 'closed' }))
    await box.project.write(
      'unsafe/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/unsafe"\n'
    )
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
    const json = await box.run(['ki', 'repo', '--repo', valid, '--repo', unsafe, 'roadmap', 'list', '--format', 'json'])
    const retiredFormat = await box.run('ki repo --repo valid roadmap list --format yaml')

    expect(result.output).toContain(
      `│  ╰─ 📁 valid (${valid})\n├─ roadmap (1)\n│  ╰─ next (1)\n│     ╰─ KI-TOOL-CLI-003 [draft] Inspect governed work`
    )
    expect(result.output).toContain(`│  ╰─ ○ no roadmap`)
    expect(result.output).not.toContain(`repository ${missing} has no physical docs/roadmap directory`)
    expect(result.output).toContain(`│  ╰─ ❌ work item KI-TOOL-CLI-003-inspect.md has an invalid lifecycle status`)
    expect(result.output).toContain(
      `├─ roadmap (0)\n│  ├─ ❌ work item KI-TOOL-CLI-003-inspect.md must be a regular file\n│  ╰─ ❌ work item target.md must use a matching work-item identifier`
    )
    expect(result.exitCode).toBe(1)
    expect(json.exitCode).toBe(1)
    expect(JSON.parse(json.output).repositories).toHaveLength(2)
    expect(retiredFormat.exitCode).toBe(2)
    expect(retiredFormat.output).toContain('roadmap list --format must be text or json')
  })

  test('accepts future work items without the retired candidate field', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-004-future.md',
      item({ id: 'KI-TOOL-CLI-004', horizon: 'future' })
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-005-candidate.md',
      item({ id: 'KI-TOOL-CLI-005', candidate: 'true' })
    )

    const result = await box.run('ki repo --repo repo roadmap list')
    const aggregate = await box.run('ki repo --repo repo roadmap list --aggregate --no-icons')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('roadmap (2)')
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(result.output).toContain('KI-TOOL-CLI-004 [draft] Inspect governed work')
    expect(result.output).toContain('KI-TOOL-CLI-005-candidate.md has unsupported or repeated field candidate')
    expect(result.output).toContain('summary: ITEMS=2 NOT_DONE=2 DONE=0')
    expect(aggregate.exitCode).toBe(1)
    expect(aggregate.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(aggregate.output).toContain('KI-TOOL-CLI-004 [draft] Inspect governed work')
    expect(aggregate.output).toContain(
      'repo: work item KI-TOOL-CLI-005-candidate.md has unsupported or repeated field candidate'
    )
  })

  test('orders non-empty text output by horizon, lifecycle, then identifier', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
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
      ['KI-TOOL-CLI-018', 'Future', 'future', 'draft'],
      ['KI-TOOL-CLI-019', 'Unadopted intake', 'triage', 'draft']
    ] as const
    for (const [id, title, horizon, status] of items) {
      await box.project.write(`repo/docs/roadmap/${id}-item.md`, item({ id, title, horizon, status }))
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
      '│  ├─ future',
      '│  │  ╰─ KI-TOOL-CLI-018 [draft] Future',
      '│  ╰─ triage',
      '│     ╰─ KI-TOOL-CLI-019 [draft] Unadopted intake'
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
    // Members carry only their Capital; the Capital's policy grants the source -> receiver channel.
    const configuration = (repository: string): string =>
      [
        '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"',
        `repository = ${JSON.stringify(repository)}`,
        `capital = ${JSON.stringify(capitalHome)}`,
        '',
        '[skills.ki-trades]',
        ''
      ].join('\n')
    const capital = await writeCapital(box, {
      channels: [{ from: [sourceHome], to: [receiverHome], kinds: ['work', 'knowledge'] }]
    })
    const record = (recordId: string, kind: 'work' | 'knowledge', status = ''): string =>
      `---\nid: ${recordId}\ntitle: Trade-aware planning\ncreated_at: 2026-08-05T12:00:00Z\nsender: example/source\nreceiver: example/receiver\nkind: ${kind}\nsource_ref: KI-TOOL-CLI-012\nobservation: decision\nphase: ${status ? 'received' : 'submitted'}${status}\n---\n# ${recordId}: Trade-aware planning\n\n## Context\n\nTrade context.\n\n## Submission\n\nShow trades with roadmap work.\n\n## Constraints\n\nRemain read-only.\n`
    await box.project.write('source/.ki.toml', configuration(sourceHome))
    await box.project.write('receiver/.ki.toml', configuration(receiverHome))
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
        { key: 'receiver', repository: 'https://github.com/example/receiver', path: receiver },
        { key: 'capital', repository: capitalHome, path: capital }
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
      ['KI-TOOL-CLI-003-candidate.md', item({ candidate: 'true' }), 'has unsupported or repeated field candidate'],
      [
        'KI-TOOL-CLI-003-housekeeping.md',
        item({ 'housekeeping-template': 'HK-001' }),
        'has unsupported or repeated field housekeeping-template'
      ],
      [
        'KI-TOOL-CLI-003-scheduled.md',
        item({ 'scheduled-for': '2026-08-09' }),
        'has unsupported or repeated field scheduled-for'
      ],
      ['KI-TOOL-CLI-003-list.md', item({ blocks: '[wrong]' }), 'blocks must be an identifier array']
    ] as const
    for (const [index, [name, contents, message]] of cases.entries()) {
      const repository = `repo-${index}`
      await box.project.write(
        `${repository}/.ki.toml`,
        '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
      )
      await box.project.write(`${repository}/docs/roadmap/${name}`, contents)
      const result = await box.run(`ki repo --repo ${repository} roadmap list`)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(message)
    }
  })

  test('accepts quoted scalar frontmatter values', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md',
      item({ id: "'KI-TOOL-CLI-003'", title: '"Inspect governed work"', theme: "'cli'" })
    )

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
  })

  test('accepts a repository code beginning with a digit and a serial beyond three places', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'repo/docs/roadmap/5GE-P2-HK-0017-inspect.md',
      item({ id: '5GE-P2-HK-0017', theme: 'housekeeping' })
    )

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('5GE-P2-HK-0017 [draft] Inspect governed work')
  })

  test('accepts contract-owned optional frontmatter fields', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md',
      item({
        area: 'CLI',
        waiting_on_trades: '[TRD-12345678]',
        intake_disposition: 'merged',
        intake_disposition_target: 'KI-TOOL-CLI-002',
        transferred_from: 'example/source',
        housekeeping_template: 'HK-001',
        scheduled_for: '2026-08-09'
      })
    )

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work')
    expect(result.output).not.toContain('has unsupported or repeated field area')
    expect(result.output).not.toContain('has unsupported or repeated field transferred_from')
    expect(result.output).not.toContain('has unsupported or repeated field housekeeping_template')
    expect(result.output).not.toContain('has unsupported or repeated field scheduled_for')
  })

  test('projects qualified task links across local adapters and preserves their bytes on horizon moves', async () => {
    const box = await sandbox()
    await box.project.write(
      'project/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\n'
    )
    await box.project.write('knowledge/.ki.toml', knowledgeBaseConfiguration())
    const linked = item({ task_links: taskLinks })
    const kbLinked = item({ id: 'KBS-001', task_links: taskLinks, ...knowledgeBaseMetadata })
    await box.project.write('project/docs/roadmap/KI-TOOL-CLI-003-linked.md', linked)
    await box.project.write('project/docs/roadmap/KI-TOOL-CLI-004-unlinked.md', item({ id: 'KI-TOOL-CLI-004' }))
    await box.project.write('knowledge/Streams/Roadmap/KBS-001-linked.md', kbLinked)

    const listed = await box.run('ki repo --repo project --repo knowledge roadmap list --format json')
    expect(listed.exitCode, listed.output).toBe(0)
    const report = JSON.parse(listed.output)
    expect(report.schema).toBe('ki/roadmap/v1')
    const linkedItems = report.items.filter((entry: { id: string }) => entry.id !== 'KI-TOOL-CLI-004')
    expect(linkedItems).toHaveLength(2)
    for (const entry of linkedItems) {
      expect(entry.taskLinks).toEqual({
        paperclip: [
          {
            authority: 'http://127.0.0.1:3100',
            scope: '558dd49e-7615-409f-b7b2-7f19e22171d9',
            id: 'b76a4ec9-be48-4a3c-8568-7885b5e6789b',
            key: 'KIS-5',
            url: 'http://127.0.0.1:3100/KIS/issues/KIS-5',
            relation: 'implementation'
          },
          expect.objectContaining({
            id: '7afd7214-386e-455f-83bd-6ac4c9f1bf7f',
            key: 'KIS-5',
            relation: 'evaluation'
          })
        ],
        linear: [expect.objectContaining({ key: 'KIS-5', relation: 'related' })]
      })
    }
    expect(report.items.find((entry: { id: string }) => entry.id === 'KI-TOOL-CLI-004')).not.toHaveProperty('taskLinks')
    expect(listed.output).not.toContain(box.project.path)

    const now = () => Date.parse('2026-09-02T00:00:00Z')
    expect((await box.run('ki repo --repo project roadmap promote KI-TOOL-CLI-003', { now })).exitCode).toBe(0)
    expect((await box.run('ki repo --repo knowledge roadmap promote KBS-001', { now })).exitCode).toBe(0)
    expect(await box.project.read('project/docs/roadmap/KI-TOOL-CLI-003-linked.md')).toBe(
      linked
        .replace('horizon: next', 'horizon: now')
        .replace('updated_at: 2026-09-01T00:00:00Z', 'updated_at: 2026-09-02T00:00:00Z')
    )
    expect(await box.project.read('knowledge/Streams/Roadmap/KBS-001-linked.md')).toBe(
      kbLinked
        .replace('horizon: next', 'horizon: now')
        .replace('updated_at: 2026-09-01T00:00:00Z', 'updated_at: 2026-09-02T00:00:00Z')
    )
  })

  test('lists compact task keys and expands nested task URLs in both roadmap views', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-linked.md', item({ task_links: taskLinks }))
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-004-unlinked.md', item({ id: 'KI-TOOL-CLI-004' }))

    for (const view of ['', '--aggregate --no-icons']) {
      const compact = await box.run(`ki repo --repo repo roadmap list ${view}`)
      expect(compact.exitCode).toBe(0)
      expect(compact.output).toContain('KI-TOOL-CLI-003 [draft] Inspect governed work · PC:KIS-5 +2\n')
      expect(compact.output).toContain('KI-TOOL-CLI-004 [draft] Inspect governed work\n')
      expect(compact.output.match(/Links: PC = Paperclip/g)).toHaveLength(1)
      expect(compact.output).not.toContain('http')
      expect(compact.output).not.toContain('\u001b')

      const expanded = await box.run(`ki repo --repo repo roadmap list ${view} --links all`)
      expect(expanded.exitCode).toBe(0)
      expect(expanded.output).toContain(
        '│     ├─ KI-TOOL-CLI-003 [draft] Inspect governed work\n' +
          '│     │  ├─ Paperclip KIS-5 · implementation\n' +
          '│     │  │  ├─ http://127.0.0.1:3100/KIS/issues/KIS-5\n'
      )
      expect(expanded.output).toContain('authority: http://127.0.0.1:3100')
      expect(expanded.output).toContain('scope: 558dd49e-7615-409f-b7b2-7f19e22171d9')
      expect(expanded.output).toContain('id: b76a4ec9-be48-4a3c-8568-7885b5e6789b')
      expect(expanded.output).toContain('id: 7afd7214-386e-455f-83bd-6ac4c9f1bf7f')
      expect(expanded.output).toContain('Paperclip KIS-5 · evaluation\n')
      expect(expanded.output).toContain('http://127.0.0.1:3100/KIS/issues/KIS-6\n')
      expect(expanded.output).toContain(
        '│     │  ├─ Linear KIS-5 · related\n' + '│     │  │  ╰─ https://linear.app/example/issue/KIS-5\n'
      )
      expect(expanded.output).not.toContain(' · PC:')
      expect(expanded.output).not.toContain('Links:')
    }

    const ordinary = await box.run('ki repo --repo repo roadmap list --format json')
    const expanded = await box.run('ki repo --repo repo roadmap list --links all --format json')
    expect(expanded).toEqual(ordinary)
    const filtered = await box.run('ki repo --repo repo roadmap list --status ready')
    expect(filtered.output).not.toContain('Links:')
    const invalid = await box.run('ki repo --repo repo roadmap list --links unknown')
    expect(invalid.exitCode).toBe(2)
    expect(invalid.output).toContain('--links')
    const help = await box.run('ki repo roadmap list --help')
    expect(help.output).toContain('--links <compact|all>')
  })

  test('counts distinct qualified tickets while retaining every relation and provider in expanded links', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    const record = 'repo/docs/roadmap/KI-TOOL-CLI-003-linked.md'
    const repeated = taskLinks.replace('7afd7214-386e-455f-83bd-6ac4c9f1bf7f', 'b76a4ec9-be48-4a3c-8568-7885b5e6789b')
    await box.project.write(record, item({ task_links: repeated }))
    expect((await box.run('ki repo --repo repo roadmap list')).output).toContain(' · PC:KIS-5 +1\n')
    const expanded = await box.run('ki repo --repo repo roadmap list --links all')
    expect(expanded.output).toContain('Paperclip KIS-5 · implementation')
    expect(expanded.output).toContain('Paperclip KIS-5 · evaluation')
    expect(expanded.output).not.toContain('authority:')

    // Without an implementation relation the same stable ordering applies regardless of source order.
    const noImplementation = repeated.replace('relation: implementation', 'relation: review')
    await box.project.write(record, item({ task_links: noImplementation }))
    const fallback = await box.run('ki repo --repo repo roadmap list')
    expect(fallback.output).toContain(' · LN:KIS-5 +1\n')
    expect(fallback.output).toContain('Links: LN = Linear')
    const reordered = noImplementation
      .replace('relation: review', 'relation: evaluation')
      .replace(/relation: evaluation(?=\n {2}linear:)/, 'relation: review')
    await box.project.write(record, item({ task_links: reordered }))
    expect(await box.run('ki repo --repo repo roadmap list')).toEqual(fallback)

    const single = taskLinks.slice(0, taskLinks.indexOf('    - authority:', taskLinks.indexOf('    - authority:') + 1))
    await box.project.write(record, item({ task_links: single.replace('paperclip:', 'constructor:') }))
    const custom = await box.run('ki repo --repo repo roadmap list')
    expect(custom.output).toContain(' · constructor:KIS-5\n')
    expect(custom.output).not.toContain('Links:')
    expect(custom.output).not.toContain('+1')
    expect((await box.run('ki repo --repo repo roadmap list --links all')).output).toContain(
      'constructor KIS-5 · implementation\n│           ╰─ http://127.0.0.1:3100/KIS/issues/KIS-5\n'
    )
  })

  test('qualifies task keys from different instances or scopes only in expanded output', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    const first = taskLinks.slice(0, taskLinks.indexOf('    - authority:', taskLinks.indexOf('    - authority:') + 1))
    const reference = first.slice(first.indexOf('    - authority:'))
    const links =
      first +
      reference.replaceAll('3100', '3200') +
      reference.replace('558dd49e-7615-409f-b7b2-7f19e22171d9', 'another-company')
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-linked.md', item({ task_links: links }))
    expect((await box.run('ki repo --repo repo roadmap list')).output).toContain(' · PC:KIS-5 +2\n')
    const expanded = await box.run('ki repo --repo repo roadmap list --links all')
    expect(expanded.output).toContain('authority: http://127.0.0.1:3200')
    expect(expanded.output).toContain('scope: another-company')
    expect(expanded.output).toContain('http://127.0.0.1:3200/KIS/issues/KIS-5')
  })

  test('mutes compact task suffixes only on colour-capable terminals', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-linked.md', item({ task_links: taskLinks }))
    box.setEnv({ TERM: 'xterm', NO_COLOR: undefined })
    const terminal = await box.run('ki repo --repo repo roadmap list', { interactive: true })
    expect(terminal.output).toContain('Inspect governed work\u001b[2m · PC:KIS-5 +2\u001b[22m\n')
    box.setEnv({ NO_COLOR: '1' })
    expect((await box.run('ki repo --repo repo roadmap list', { interactive: true })).output).not.toContain('\u001b')
    box.setEnv({ NO_COLOR: '', TERM: 'dumb' })
    expect((await box.run('ki repo --repo repo roadmap list', { interactive: true })).output).not.toContain('\u001b')
  })

  test('accepts each task-link relation but rejects malformed or duplicated qualified references', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    const record = 'repo/docs/roadmap/KI-TOOL-CLI-003-linked.md'
    for (const relation of ['evaluation', 'implementation', 'review', 'integration', 'coordination', 'related']) {
      await box.project.write(
        record,
        item({ task_links: taskLinks.replace('relation: implementation', `relation: ${relation}`) })
      )
      const result = await box.run('ki repo --repo repo roadmap list')
      expect(result.exitCode, `${relation}: ${result.output}`).toBe(0)
    }

    const duplicate = taskLinks.replace(
      '  linear:',
      [
        '    - authority: http://127.0.0.1:3100',
        '      scope: 558dd49e-7615-409f-b7b2-7f19e22171d9',
        '      id: b76a4ec9-be48-4a3c-8568-7885b5e6789b',
        '      key: KIS-6',
        '      url: http://127.0.0.1:3100/KIS/issues/KIS-6',
        '      relation: implementation',
        '  linear:'
      ].join('\n')
    )
    await box.project.write(
      record,
      item({
        task_links: taskLinks.replace(
          'id: 7afd7214-386e-455f-83bd-6ac4c9f1bf7f',
          'id: b76a4ec9-be48-4a3c-8568-7885b5e6789b'
        )
      })
    )
    expect((await box.run('ki repo --repo repo roadmap list')).exitCode).toBe(0)
    await box.project.write(
      record,
      item({
        task_links: duplicate
          .replace('key: KIS-6', 'key: KIS-5')
          .replace(
            '  paperclip:\n    - authority: http://127.0.0.1:3100',
            '  paperclip:\n    - authority: http://127.0.0.1:3200'
          )
      })
    )
    expect((await box.run('ki repo --repo repo roadmap list')).exitCode).toBe(0)
    const cases: readonly [string, string, string][] = [
      ['scalar field', '[]', 'must be a nested provider map'],
      ['empty map', '\n  {}', 'non-empty provider map'],
      ['empty references', '\n  paperclip: []', 'non-empty reference arrays'],
      ['null reference', '\n  paperclip:\n    - null', 'references must be field maps'],
      ['scalar reference', '\n  paperclip:\n    - text', 'references must be field maps'],
      ['array reference', '\n  paperclip:\n    - []', 'references must be field maps'],
      ['uppercase provider', taskLinks.replace('  paperclip:', '  Paperclip:'), 'lower-case names'],
      ['missing field', taskLinks.replace('      scope: 558dd49e-7615-409f-b7b2-7f19e22171d9\n', ''), 'contain only'],
      [
        'empty field',
        taskLinks.replace('      id: b76a4ec9-be48-4a3c-8568-7885b5e6789b', "      id: ''"),
        'non-empty strings'
      ],
      [
        'unknown field',
        taskLinks.replace('      relation: implementation', '      relation: implementation\n      status: done'),
        'contain only'
      ],
      ['unknown relation', taskLinks.replace('relation: implementation', 'relation: active'), 'unsupported relation'],
      ['duplicate identity', duplicate, 'repeats a qualified task relation'],
      ['duplicate provider', `${taskLinks}\n  paperclip: []`, 'provider map of task references'],
      ['malformed YAML', '\n  paperclip: [', 'provider map of task references']
    ]
    for (const [name, value, message] of cases) {
      await box.project.write(record, item({ task_links: value }))
      const result = await box.run('ki repo --repo repo roadmap list')
      expect(result.exitCode, name).toBe(1)
      expect(result.output, name).toContain(message)
    }
  })

  test('validates task links in a historical work-item snapshot through batch close', async () => {
    const box = await sandbox()
    await box.project.write(
      'repository/.ki.toml',
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
        '',
        '[skills.ki-repo]',
        'repo_type = "project"',
        'primary_shape = "ki-repo-project"',
        'repository = "https://github.com/example/repository"',
        'repo_code = "EXAMPLE"',
        ''
      ].join('\n')
    )
    const record = 'repository/docs/roadmap/EXAMPLE-001-linked.md'
    await box.project.write(record, item({ id: 'EXAMPLE-001', status: 'ready', task_links: taskLinks }))
    const baseline = '1'.repeat(40)
    const resultCommit = '2'.repeat(40)
    const evidenceCommit = '3'.repeat(40)
    let historical = item({ id: 'EXAMPLE-001', status: 'awaiting-review', task_links: taskLinks })
    box.setRunner(async (command, arguments_) => {
      if (command !== 'git') return { exitCode: 1, output: 'unexpected command' }
      if (arguments_[2] === 'cat-file' && arguments_[3] === '-e') return { exitCode: 0, output: '' }
      if (arguments_[2] === 'ls-tree' && arguments_.at(-1) === `${evidenceCommit}:docs/roadmap`)
        return { exitCode: 0, output: `100644 blob ${'a'.repeat(40)}\tEXAMPLE-001-linked.md\0` }
      if (arguments_[2] === 'cat-file' && arguments_[3] === 'blob') return { exitCode: 0, output: historical }
      return { exitCode: 1, output: 'unexpected git operation' }
    })
    box.cd('repository')
    const now = () => Date.parse('2026-09-15T08:00:00Z')
    const prepare = await box.run(
      'ki repo batch prepare --item EXAMPLE-001 --approved --authority-mode reviewed-items --expires-at 2026-09-15T12:00:00Z --completion-target awaiting-review',
      { now }
    )
    expect(prepare.exitCode, prepare.output).toBe(0)
    expect((await box.run('ki repo batch run EXAMPLE-BATCH-001', { now })).exitCode).toBe(0)
    await box.project.write(record, historical)
    const outcome = await box.run(
      `ki repo batch run EXAMPLE-BATCH-001 --item EXAMPLE-001 --result awaiting-review --baseline ${baseline} --result-commit ${resultCommit}`,
      { now }
    )
    expect(outcome.exitCode, outcome.output).toBe(0)

    const close = `ki repo batch close EXAMPLE-BATCH-001 --completion-target awaiting-review --evidence-commit ${evidenceCommit}`
    historical = historical.replace('relation: implementation', 'relation: active')
    const invalid = await box.run(close, { now })
    expect(invalid.exitCode).toBe(2)
    expect(invalid.output).toContain('task_links reference has an unsupported relation')
    historical = item({ id: 'EXAMPLE-001', status: 'awaiting-review', task_links: taskLinks })
    const valid = await box.run(close, { now })
    expect(valid.exitCode, valid.output).toBe(0)
  })

  test('prunes only completed items across selected repositories after every target is valid', async () => {
    const box = await sandbox()
    await box.project.write(
      'first/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write('first/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    await box.project.write('first/docs/roadmap/KI-TOOL-CLI-004-draft.md', item({ id: 'KI-TOOL-CLI-004' }))
    await box.project.write(
      'second/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'second/docs/roadmap/KI-TOOL-CLI-005-done.md',
      item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    )
    await box.project.write(
      'absent/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    const first = await realpath(`${box.project.path}/first`)
    const second = await realpath(`${box.project.path}/second`)
    const absent = await realpath(`${box.project.path}/absent`)

    const exact = await box.run('ki repo --repo first roadmap prune KI-TOOL-CLI-003 --no-commit')
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
    const pruned = await box.run([
      'ki',
      'repo',
      '--repo',
      first,
      '--repo',
      second,
      '--repo',
      absent,
      'roadmap',
      'prune',
      '--no-commit'
    ])
    const empty = await box.run('ki repo --repo first roadmap prune')
    const absentEmpty = await box.run(['ki', 'repo', '--repo', absent, 'roadmap', 'prune'])
    const absentExact = await box.run(['ki', 'repo', '--repo', absent, 'roadmap', 'prune', 'KI-TOOL-CLI-003'])

    expect(exact).toEqual({
      exitCode: 0,
      output: `pruned ${first}: KI-TOOL-CLI-003 [done] Inspect governed work\nki repo roadmap prune: removed 1 done work item(s) without committing\n`
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
      output: `pruned ${second}: KI-TOOL-CLI-005 [done] Inspect governed work\nki repo roadmap prune: removed 1 done work item(s) without committing\n`
    })
    await expect(box.project.read('first/docs/roadmap/KI-TOOL-CLI-003-done.md')).rejects.toThrow()
    await expect(box.project.read('second/docs/roadmap/KI-TOOL-CLI-005-done.md')).rejects.toThrow()
    await expect(box.project.read('first/docs/roadmap/KI-TOOL-CLI-004-draft.md')).resolves.toContain('status: draft')
    expect(empty).toEqual({ exitCode: 0, output: 'ki repo roadmap prune: no done work items\n' })
    expect(absentEmpty).toEqual({ exitCode: 0, output: 'ki repo roadmap prune: no done work items\n' })
    expect(absentExact).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${absent} has no physical docs/roadmap directory\n`
    })

    await box.project.write(
      'invalid/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
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
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-next.md',
      `${item({ title: 'Priority item' })}\ncandidate: body content remains.\n`
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-004-future.md',
      item({ id: 'KI-TOOL-CLI-004', title: 'Future item', horizon: 'future' })
    )
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-005-now.md', item({ id: 'KI-TOOL-CLI-005', horizon: 'now' }))
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-006-triage.md',
      item({ id: 'KI-TOOL-CLI-006', horizon: 'triage' })
    )
    await box.project.write(
      'other/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
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
    const triage = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-006')
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
    expect(demoted).toContain('horizon: future')
    expect(demoted).not.toContain('candidate: true')
    expect(demoted).toContain('## Discussion\n\n### Test\n\nTest.\n')
    expect(demoted).toContain('candidate: body content remains.')
    expect(unknown.output).toContain('roadmap promote horizon must be one of')
    expect(backwards.output).toContain('roadmap promote must move KI-TOOL-CLI-003 toward now')
    expect(same.output).toContain('roadmap demote must move KI-TOOL-CLI-004 toward future')
    expect(promoteLimit.output).toContain('work item KI-TOOL-CLI-005 is already at the promote limit')
    expect(demoteLimit.output).toContain('work item KI-TOOL-CLI-003 is already at the demote limit')
    expect(triage.output).toContain('work item KI-TOOL-CLI-006 at triage must be adopted through the planning workflow')
    expect(missing.output).toContain(`repository ${root} must contain exactly one work item KI-TOOL-CLI-999`)
    expect(multiple.output).toContain('ki repo roadmap promote requires exactly one repository target')
  })

  test('requires timestamp pairs, advances horizon-move timestamps, and reports statistics', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-003-timestamped.md',
      item({ created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' })
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-004-missing.md',
      item({ id: 'KI-TOOL-CLI-004', created_at: undefined, updated_at: undefined })
    )
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-005-invalid.md',
      item({ id: 'KI-TOOL-CLI-005', created_at: '2026-09-02T00:00:00Z', updated_at: undefined })
    )

    const list = await box.run('ki repo --repo repo roadmap list')
    await Promise.all([
      rm(`${box.project.path}/repo/docs/roadmap/KI-TOOL-CLI-004-missing.md`),
      rm(`${box.project.path}/repo/docs/roadmap/KI-TOOL-CLI-005-invalid.md`)
    ])
    const promoted = await box.run('ki repo --repo repo roadmap promote KI-TOOL-CLI-003', {
      now: () => Date.parse('2026-09-02T00:00:00Z')
    })
    const changed = await box.project.read('repo/docs/roadmap/KI-TOOL-CLI-003-timestamped.md')
    const stats = await box.run('ki repo --repo repo roadmap stats --stale-after 1s --format json', {
      now: () => Date.parse('2026-09-03T00:00:00Z')
    })
    const invalidDuration = await box.run('ki repo --repo repo roadmap stats --stale-after never')

    expect(list.exitCode).toBe(1)
    expect(list.output).toContain('must declare created_at')
    expect(list.output).toContain('must declare updated_at')
    expect(promoted).toEqual({ exitCode: 0, output: 'ki repo roadmap promote: KI-TOOL-CLI-003 next -> now\n' })
    expect(changed).toContain('updated_at: 2026-09-02T00:00:01Z')
    expect(stats.exitCode).toBe(0)
    expect(JSON.parse(stats.output)).toMatchObject({
      version: 1,
      generatedAt: '2026-09-03T00:00:00Z',
      staleAfterSeconds: 1,
      aggregate: {
        items: 1,
        stale: ['KI-TOOL-CLI-003']
      },
      results: [
        {
          statistics: {
            items: 1,
            stale: ['KI-TOOL-CLI-003']
          }
        }
      ]
    })
    expect(invalidDuration).toEqual({
      exitCode: 2,
      output: 'ki: error: stale-after must be a positive duration such as 7d\n'
    })
  })

  test('reports timestamp diagnostics and empty statistics without hiding selected repositories', async () => {
    const box = await sandbox()
    await box.project.write(
      'legacy/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'legacy/docs/roadmap/KI-TOOL-CLI-003-item.md',
      item({ created_at: undefined, updated_at: undefined })
    )
    await box.project.write(
      'future/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'future/docs/roadmap/KI-TOOL-CLI-004-item.md',
      item({
        id: 'KI-TOOL-CLI-004',
        created_at: '2026-09-04T00:00:00Z',
        updated_at: '2026-09-04T00:00:00Z'
      })
    )
    await box.project.write(
      'invalid/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'invalid/docs/roadmap/KI-TOOL-CLI-005-invalid.md',
      item({ id: 'KI-TOOL-CLI-005', created_at: 'not-a-timestamp', updated_at: '2026-09-01T00:00:00Z' })
    )
    await box.project.write(
      'invalid/docs/roadmap/KI-TOOL-CLI-006-reversed.md',
      item({ id: 'KI-TOOL-CLI-006', created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' })
    )
    await box.project.write(
      'invalid/docs/roadmap/KI-TOOL-CLI-009-calendar.md',
      item({ id: 'KI-TOOL-CLI-009', created_at: '2026-02-31T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' })
    )
    await box.project.write(
      'missing/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'paired/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'paired/docs/roadmap/KI-TOOL-CLI-007-item.md',
      item({ id: 'KI-TOOL-CLI-007', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' })
    )
    await box.project.write(
      'paired/docs/roadmap/KI-TOOL-CLI-008-item.md',
      item({ id: 'KI-TOOL-CLI-008', created_at: '2026-09-01T00:57:58Z', updated_at: '2026-09-01T00:57:58Z' })
    )
    await box.project.write(
      'current/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    await box.project.write(
      'current/docs/roadmap/KI-TOOL-CLI-010-item.md',
      item({ id: 'KI-TOOL-CLI-010', created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z' })
    )

    const listed = await box.run('ki repo --repo invalid roadmap list')
    const statistics = await box.run(
      'ki repo --repo legacy --repo future --repo invalid --repo missing roadmap stats',
      { now: () => Date.parse('2026-09-03T00:00:00Z') }
    )
    const paired = await box.run('ki repo --repo paired roadmap stats', {
      now: () => Date.parse('2026-09-03T00:00:00Z')
    })
    const stale = await box.run('ki repo --repo paired roadmap stats --stale-after 1d', {
      now: () => Date.parse('2026-09-03T00:00:00Z')
    })
    const fresh = await box.run('ki repo --repo paired roadmap stats --stale-after 7d', {
      now: () => Date.parse('2026-09-03T00:00:00Z')
    })
    const current = await box.run('ki repo --repo current roadmap stats', {
      now: () => Date.parse('2026-09-03T00:00:00Z')
    })
    const invalidFormat = await box.run('ki repo --repo legacy roadmap stats --format csv')

    expect(listed.exitCode).toBe(1)
    expect(listed.output).toContain('created_at must be a canonical UTC timestamp')
    expect(listed.output).toContain('created_at must not be later than updated_at')
    expect(statistics.exitCode).toBe(1)
    expect(statistics.output).toContain('legacy: ITEMS=0 NOT_DONE=0')
    expect(statistics.output).toContain('age: MEDIAN=n/a MAX=n/a')
    expect(statistics.output).toContain('future timestamps: KI-TOOL-CLI-004')
    expect(statistics.output).toContain('invalid: ITEMS=0 NOT_DONE=0')
    expect(statistics.output).toContain('missing: no roadmap')
    expect(statistics.output).toContain('aggregate: ITEMS=1 NOT_DONE=1')
    expect(paired.exitCode).toBe(0)
    expect(paired.output).toContain('age: MEDIAN=1d 23h 31m 1s MAX=2d')
    expect(paired.output).toContain('inactivity: MEDIAN=1d 23h 31m 1s MAX=2d')
    expect(stale.output).toContain('stale after 1d')
    expect(stale.output).toContain('stale (2): KI-TOOL-CLI-007, KI-TOOL-CLI-008')
    expect(fresh.output).toContain('stale after 7d')
    expect(fresh.output).toContain('stale (0): none')
    expect(current.output).toContain('age: MEDIAN=0s MAX=0s')
    expect(current.output).toContain('inactivity: MEDIAN=0s MAX=0s')
    expect(invalidFormat).toEqual({ exitCode: 2, output: 'ki: error: format must be text or json\n' })
  })

  test('rejects ambiguous roadmap identifiers before changing or pruning a work item', async () => {
    const box = await sandbox()
    await box.project.write(
      'repo/.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
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

describe('[ki repo roadmap prune] commits', () => {
  type Box = Awaited<ReturnType<typeof sandbox>>

  const declaration =
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'

  // The sandbox HOME hides the developer's global Git configuration; identity and PATH come from here only.
  const gitEnvironment = (box: Box): NodeJS.ProcessEnv => ({
    ...box.env,
    PATH: process.env['PATH'],
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com'
  })

  const git = (box: Box, repository: string, ...arguments_: string[]): string =>
    execFileSync('git', ['-C', `${box.project.path}/${repository}`, ...arguments_], {
      env: gitEnvironment(box),
      encoding: 'utf8'
    })

  const committedRepository = async (
    box: Box,
    repository: string,
    records: Readonly<Record<string, string>>
  ): Promise<string> => {
    await box.project.write(`${repository}/.ki.toml`, declaration)
    await box.project.write(`${repository}/README.md`, 'Readme.\n')
    for (const [file, contents] of Object.entries(records))
      await box.project.write(`${repository}/docs/roadmap/${file}`, contents)
    git(box, repository, 'init', '--quiet', '--initial-branch=main')
    git(box, repository, 'add', '--all')
    git(box, repository, 'commit', '--quiet', '-m', 'chore: seed roadmap')
    return realpath(`${box.project.path}/${repository}`)
  }

  const hook = async (box: Box, repository: string, name: string, script: string): Promise<void> => {
    await box.project.write(`${repository}/.git/hooks/${name}`, `#!/bin/sh\n${script}\n`)
    await chmod(`${box.project.path}/${repository}/.git/hooks/${name}`, 0o755)
  }

  const run = (box: Box, command: string) => {
    box.setEnv(gitEnvironment(box))
    return box.run(command, { runner: 'default' })
  }

  test('commits exactly the pruned records with the standardised message and runs commit hooks', async () => {
    const box = await sandbox()
    const root = await committedRepository(box, 'repo', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' }),
      'KI-TOOL-CLI-004-draft.md': item({ id: 'KI-TOOL-CLI-004' }),
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    })
    await hook(box, 'repo', 'pre-commit', 'touch .git/pre-commit-ran')
    await hook(box, 'repo', 'commit-msg', 'cp "$1" .git/commit-msg-seen')
    await box.project.write('repo/README.md', 'Unrelated unstaged change.\n')
    await box.project.write('repo/notes.txt', 'Unrelated untracked file.\n')

    const result = await run(box, 'ki repo --repo repo roadmap prune')
    const head = git(box, 'repo', 'rev-parse', 'HEAD').trim()

    expect(result).toEqual({
      exitCode: 0,
      output: [
        `pruned ${root}: KI-TOOL-CLI-003 [done] Inspect governed work`,
        `pruned ${root}: KI-TOOL-CLI-005 [done] Inspect governed work`,
        `committed ${root}: ${head.slice(0, 12)} chore(roadmap): prune 2 done work records`,
        'ki repo roadmap prune: removed 2 done work item(s)',
        ''
      ].join('\n')
    })
    expect(git(box, 'repo', 'log', '-1', '--format=%B')).toBe(
      'chore(roadmap): prune 2 done work records\n\n- KI-TOOL-CLI-003\n- KI-TOOL-CLI-005\n\n'
    )
    expect(git(box, 'repo', 'show', '--name-status', '--format=', 'HEAD')).toBe(
      'D\tdocs/roadmap/KI-TOOL-CLI-003-done.md\nD\tdocs/roadmap/KI-TOOL-CLI-005-done.md\n'
    )
    expect(git(box, 'repo', 'status', '--porcelain')).toBe(' M README.md\n?? notes.txt\n')
    await expect(box.project.read('repo/.git/pre-commit-ran')).resolves.toBe('')
    await expect(box.project.read('repo/.git/commit-msg-seen')).resolves.toContain('prune 2 done work records')
    await expect(box.project.read('repo/docs/roadmap/KI-TOOL-CLI-004-draft.md')).resolves.toContain('status: draft')
  })

  test('commits each selected repository separately and names one record in the singular', async () => {
    const box = await sandbox()
    const first = await committedRepository(box, 'first', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' })
    })
    const second = await committedRepository(box, 'second', {
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' }),
      'KI-TOOL-CLI-006-done.md': item({ id: 'KI-TOOL-CLI-006', status: 'done' })
    })

    const result = await run(box, 'ki repo --repo first --repo second roadmap prune')

    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain(`committed ${first}: `)
    expect(result.output).toContain(`committed ${second}: `)
    expect(git(box, 'first', 'log', '-1', '--format=%B')).toBe(
      'chore(roadmap): prune 1 done work record\n\n- KI-TOOL-CLI-003\n\n'
    )
    expect(git(box, 'second', 'log', '-1', '--format=%s')).toBe('chore(roadmap): prune 2 done work records\n')
    expect(git(box, 'first', 'status', '--porcelain')).toBe('')
    expect(git(box, 'second', 'status', '--porcelain')).toBe('')
  })

  test('refuses before deleting anything when a repository cannot take a clean prune commit', async () => {
    const box = await sandbox()
    await box.project.write('plain/.ki.toml', declaration)
    await box.project.write('plain/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    const plain = await realpath(`${box.project.path}/plain`)
    const clean = await committedRepository(box, 'clean', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' })
    })
    const staged = await committedRepository(box, 'staged', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' })
    })
    await box.project.write('staged/README.md', 'Unrelated staged change.\n')
    git(box, 'staged', 'add', 'README.md')
    const untracked = await committedRepository(box, 'untracked', {})
    await box.project.write('untracked/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    const modified = await committedRepository(box, 'modified', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'awaiting-review' })
    })
    await box.project.write('modified/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))

    const outside = await run(box, 'ki repo --repo plain roadmap prune')
    const withStaged = await run(box, 'ki repo --repo clean --repo staged roadmap prune')
    const withUntracked = await run(box, 'ki repo --repo untracked roadmap prune')
    const withModified = await run(box, 'ki repo --repo modified roadmap prune KI-TOOL-CLI-003')

    expect(outside).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${plain} is not a Git work tree; rerun with --no-commit to delete without committing\n`
    })
    expect(withStaged).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${staged} has staged changes (README.md); commit or unstage them before pruning, or rerun with --no-commit to delete without committing\n`
    })
    expect(withUntracked).toEqual({
      exitCode: 2,
      output: `ki: error: work item KI-TOOL-CLI-003 in ${untracked} is not committed; commit its done state before pruning, or rerun with --no-commit to delete without committing\n`
    })
    expect(withModified).toEqual({
      exitCode: 2,
      output: `ki: error: work item KI-TOOL-CLI-003 in ${modified} has uncommitted changes; commit its done state before pruning, or rerun with --no-commit to delete without committing\n`
    })
    for (const repository of ['plain', 'clean', 'staged', 'untracked', 'modified'])
      await expect(box.project.read(`${repository}/docs/roadmap/KI-TOOL-CLI-003-done.md`)).resolves.toContain(
        'status: done'
      )
    expect(git(box, 'clean', 'log', '--format=%s')).toBe('chore: seed roadmap\n')
    expect(git(box, 'staged', 'diff', '--cached', '--name-only')).toBe('README.md\n')
    expect(clean).toBeTruthy()

    const deleted = await run(box, 'ki repo --repo plain roadmap prune --no-commit')
    expect(deleted).toEqual({
      exitCode: 0,
      output: `pruned ${plain}: KI-TOOL-CLI-003 [done] Inspect governed work\nki repo roadmap prune: removed 1 done work item(s) without committing\n`
    })
    const unstaged = await run(box, 'ki repo --repo clean roadmap prune --no-commit')
    expect(unstaged.exitCode, unstaged.output).toBe(0)
    expect(git(box, 'clean', 'status', '--porcelain')).toBe(' D docs/roadmap/KI-TOOL-CLI-003-done.md\n')
    expect(git(box, 'clean', 'log', '--format=%s')).toBe('chore: seed roadmap\n')
  })

  test.each([
    {
      failing: 'diff --cached',
      matches: (arguments_: readonly string[]) => arguments_[2] === 'diff' && arguments_[3] === '--cached',
      result: { exitCode: 128, output: 'fatal: bad index\n' },
      message: (root: string) => `git diff --cached failed in ${root}\nfatal: bad index`
    },
    {
      failing: 'ls-files',
      matches: (arguments_: readonly string[]) => arguments_[2] === 'ls-files',
      result: { exitCode: 128, output: '' },
      message: (root: string) => `git ls-files failed in ${root}`
    },
    {
      failing: 'diff --name-only',
      matches: (arguments_: readonly string[]) => arguments_[2] === 'diff' && arguments_[3] === '--name-only',
      result: { exitCode: 128, output: 'fatal: diff\n' },
      message: (root: string) => `git diff failed in ${root}\nfatal: diff`
    },
    {
      failing: 'rm',
      matches: (arguments_: readonly string[]) => arguments_[2] === 'rm',
      result: { exitCode: 128, output: 'fatal: rm\n' },
      message: (root: string) => `git rm failed in ${root}\nfatal: rm`
    },
    {
      failing: 'commit and its restore',
      matches: (arguments_: readonly string[]) => arguments_[2] === 'commit' || arguments_[2] === 'checkout',
      result: { exitCode: 1, output: '' },
      message: (root: string) =>
        `git commit failed in ${root}; the record deletions remain staged; restore them with git checkout HEAD -- 'docs/roadmap/KI-TOOL-CLI-003-done.md'`
    },
    {
      failing: 'rev-parse HEAD',
      matches: (arguments_: readonly string[]) => arguments_[2] === 'rev-parse' && arguments_[3] === 'HEAD',
      result: { exitCode: 128, output: 'fatal: head\n' },
      message: (root: string) => `git rev-parse HEAD failed in ${root}\nfatal: head`
    }
  ])('reports a failing git $failing without claiming success', async ({ matches, result, message }) => {
    const box = await sandbox()
    const root = await committedRepository(box, 'repo', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' })
    })
    box.setEnv(gitEnvironment(box))
    box.setRunner(async (command, arguments_, environment, limits) =>
      matches(arguments_) ? result : runCommand(command, arguments_, environment, limits)
    )

    await expect(box.run('ki repo --repo repo roadmap prune')).resolves.toEqual({
      exitCode: 1,
      output: `ki: error: ${message(root)}\n`
    })
  })

  test('restores the records and names earlier commits when the runner throws during a commit', async () => {
    const box = await sandbox()
    const first = await committedRepository(box, 'first', { 'KI-TOOL-CLI-003-done.md': item({ status: 'done' }) })
    const second = await committedRepository(box, 'second', {
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    })
    box.setEnv(gitEnvironment(box))
    box.setRunner(async (command, arguments_, environment, limits) => {
      if (arguments_[1] === second && arguments_[2] === 'commit') throw new Error('spawn failed')
      return runCommand(command, arguments_, environment, limits)
    })

    const result = await box.run('ki repo --repo first --repo second roadmap prune')
    const firstHead = git(box, 'first', 'rev-parse', 'HEAD').trim()

    expect(result).toEqual({
      exitCode: 1,
      output: `ki: error: spawn failed\nalready committed: ${first} at ${firstHead}\n`
    })
    expect(git(box, 'first', 'log', '-1', '--format=%s')).toBe('chore(roadmap): prune 1 done work record\n')
    expect(git(box, 'second', 'status', '--porcelain')).toBe('')
    box.setRunner(async (command, arguments_, environment, limits) => {
      if (arguments_[2] === 'commit') throw new Error('spawn failed')
      return runCommand(command, arguments_, environment, limits)
    })
    await expect(box.run('ki repo --repo second roadmap prune')).rejects.toThrow('spawn failed')
    expect(git(box, 'second', 'status', '--porcelain')).toBe('')
  })

  test('refuses a change staged by an earlier repository hook and reports a commit a hook widened', async () => {
    const box = await sandbox()
    const first = await committedRepository(box, 'first', { 'KI-TOOL-CLI-003-done.md': item({ status: 'done' }) })
    const second = await committedRepository(box, 'second', {
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    })
    await hook(
      box,
      'first',
      'pre-commit',
      `echo late > ${box.project.path}/second/README.md\ngit -C ${box.project.path}/second add README.md`
    )

    const late = await run(box, 'ki repo --repo first --repo second roadmap prune')
    const firstHead = git(box, 'first', 'rev-parse', 'HEAD').trim()

    expect(late).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${second} has staged changes (README.md); commit or unstage them before pruning, or rerun with --no-commit to delete without committing\nalready committed: ${first} at ${firstHead}\n`
    })
    await expect(box.project.read('second/docs/roadmap/KI-TOOL-CLI-005-done.md')).resolves.toContain('status: done')

    git(box, 'second', 'reset', '--quiet', '--hard')
    await hook(box, 'second', 'pre-commit', 'echo widened > sibling.txt\ngit add sibling.txt')
    const widened = await run(box, 'ki repo --repo second roadmap prune')
    const secondHead = git(box, 'second', 'rev-parse', 'HEAD').trim()

    expect(widened).toEqual({
      exitCode: 1,
      output: `ki: error: prune commit ${secondHead} in ${second} also contains sibling.txt, which a commit hook staged; inspect it with git show ${secondHead.slice(0, 12)} and amend or revert it\n`
    })
    expect(git(box, 'second', 'show', '--name-status', '--format=', 'HEAD')).toBe(
      'D\tdocs/roadmap/KI-TOOL-CLI-005-done.md\nA\tsibling.txt\n'
    )
  })

  test('commits Knowledge Base records with spaced names and a repository nested in a larger work tree', async () => {
    const box = await sandbox()
    await box.project.write('knowledge/.ki.toml', knowledgeBaseConfiguration())
    await box.project.write(
      'knowledge/Streams/Roadmap/KBS-002-done record.md',
      item({ id: 'KBS-002', title: 'Done item', status: 'done' })
    )
    git(box, 'knowledge', 'init', '--quiet', '--initial-branch=main')
    git(box, 'knowledge', 'add', '--all')
    git(box, 'knowledge', 'commit', '--quiet', '-m', 'chore: seed roadmap')
    await box.project.write('mono/README.md', 'Monorepo.\n')
    await box.project.write('mono/tools/inner/.ki.toml', declaration)
    await box.project.write('mono/tools/inner/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    git(box, 'mono', 'init', '--quiet', '--initial-branch=main')
    git(box, 'mono', 'add', '--all')
    git(box, 'mono', 'commit', '--quiet', '-m', 'chore: seed roadmap')

    const kb = await run(box, 'ki repo --repo knowledge roadmap prune')
    const nested = await run(box, 'ki repo --repo mono/tools/inner roadmap prune')

    expect(kb.exitCode, kb.output).toBe(0)
    expect(nested.exitCode, nested.output).toBe(0)
    expect(git(box, 'knowledge', 'show', '--name-status', '--format=%B', 'HEAD')).toBe(
      'chore(roadmap): prune 1 done work record\n\n- KBS-002\n\n\nD\tStreams/Roadmap/KBS-002-done record.md\n'
    )
    expect(git(box, 'mono', 'show', '--name-status', '--format=', 'HEAD')).toBe(
      'D\ttools/inner/docs/roadmap/KI-TOOL-CLI-003-done.md\n'
    )
    expect(git(box, 'mono', 'status', '--porcelain')).toBe('')
  })

  test('previews a prune and its commit with --dry-run without changing either repository', async () => {
    const box = await sandbox()
    const root = await committedRepository(box, 'repo', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' }),
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    })
    await box.project.write('plain/.ki.toml', declaration)
    await box.project.write('plain/docs/roadmap/KI-TOOL-CLI-003-done.md', item({ status: 'done' }))
    const plain = await realpath(`${box.project.path}/plain`)

    const preview = await run(box, 'ki repo --repo repo roadmap prune --dry-run')
    const outside = await run(box, 'ki repo --repo plain roadmap prune --dry-run')
    const uncommitted = await run(box, 'ki repo --repo plain roadmap prune --dry-run --no-commit')

    expect(preview).toEqual({
      exitCode: 0,
      output: [
        `would prune ${root}: KI-TOOL-CLI-003 [done] Inspect governed work`,
        `would prune ${root}: KI-TOOL-CLI-005 [done] Inspect governed work`,
        `would commit ${root}: chore(roadmap): prune 2 done work records`,
        'ki repo roadmap prune: would remove 2 done work item(s)',
        ''
      ].join('\n')
    })
    expect(outside).toEqual({
      exitCode: 2,
      output: `ki: error: repository ${plain} is not a Git work tree; rerun with --no-commit to delete without committing\n`
    })
    expect(uncommitted).toEqual({
      exitCode: 0,
      output: `would prune ${plain}: KI-TOOL-CLI-003 [done] Inspect governed work\nki repo roadmap prune: would remove 1 done work item(s) without committing\n`
    })
    expect(git(box, 'repo', 'log', '--format=%s')).toBe('chore: seed roadmap\n')
    expect(git(box, 'repo', 'status', '--porcelain')).toBe('')
    await expect(box.project.read('plain/docs/roadmap/KI-TOOL-CLI-003-done.md')).resolves.toContain('status: done')
  })

  test('names no earlier commit when only a repository without done records preceded the rejected prune', async () => {
    const box = await sandbox()
    await committedRepository(box, 'open', { 'KI-TOOL-CLI-004-draft.md': item({ id: 'KI-TOOL-CLI-004' }) })
    const rejecting = await committedRepository(box, 'rejecting', {
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    })
    await hook(box, 'rejecting', 'pre-commit', 'exit 1')

    await expect(run(box, 'ki repo --repo open --repo rejecting roadmap prune')).resolves.toEqual({
      exitCode: 1,
      output: `ki: error: git commit failed in ${rejecting}; restored 1 work item record(s); nothing was pruned\n`
    })
    expect(git(box, 'open', 'log', '--format=%s')).toBe('chore: seed roadmap\n')
  })

  test('restores the records when a commit hook rejects the prune', async () => {
    const box = await sandbox()
    const first = await committedRepository(box, 'first', {
      'KI-TOOL-CLI-003-done.md': item({ status: 'done' })
    })
    const second = await committedRepository(box, 'second', {
      'KI-TOOL-CLI-005-done.md': item({ id: 'KI-TOOL-CLI-005', status: 'done' })
    })
    await hook(box, 'second', 'pre-commit', 'echo "hook refused" >&2\nexit 1')

    const result = await run(box, 'ki repo --repo first --repo second roadmap prune')
    const firstHead = git(box, 'first', 'rev-parse', 'HEAD').trim()

    expect(result).toEqual({
      exitCode: 1,
      output: `ki: error: git commit failed in ${second}; restored 1 work item record(s); nothing was pruned\nhook refused\nalready committed: ${first} at ${firstHead}\n`
    })
    expect(git(box, 'first', 'log', '-1', '--format=%s')).toBe('chore(roadmap): prune 1 done work record\n')
    expect(git(box, 'second', 'log', '--format=%s')).toBe('chore: seed roadmap\n')
    expect(git(box, 'second', 'status', '--porcelain')).toBe('')
    await expect(box.project.read('second/docs/roadmap/KI-TOOL-CLI-005-done.md')).resolves.toContain('status: done')
  })
})
