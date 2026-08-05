import { realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const item = (overrides: Record<string, string> = {}): string => {
  const fields = {
    id: 'KI-TOOL-CLI-003',
    title: 'Inspect governed work',
    theme: 'cli',
    horizon: 'next',
    status: 'open',
    blocks: '[]',
    'blocked-by': '[]',
    'baseline-ref': 'null',
    ...overrides
  }
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n## Context\n\nTest item.\n\n## Boundary\n\nNone.\n\n## Discussion\n\n### Test\n\nTest.\n`
}

describe('[ki repo roadmap]', () => {
  test('lists and filters grouped governed work items without JSON output', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '# repo\n')
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())
    await box.project.write(
      'repo/docs/roadmap/KI-TOOL-CLI-010-cleanup.md',
      item({
        id: 'KI-TOOL-CLI-010',
        title: 'Cleanup',
        horizon: 'future',
        status: 'acceptance',
        candidate: 'true',
        'baseline-ref': 'a'.repeat(40)
      })
    )
    const root = await realpath(`${box.project.path}/repo`)
    await box.config.write('ki/agoras/inventory.ki-agora', `name = "Inventory"\ntool = "zed"\n\n[projects]\nrepo = ${JSON.stringify(root)}\n`)

    const text = await box.run('ki repo --repo repo roadmap list --horizon next --status open')
    const accepted = await box.run('ki repo --repo repo roadmap list --status acceptance')
    const empty = await box.run('ki repo --repo repo roadmap list --horizon blocking')
    const agora = await box.run('ki repo --agora inventory roadmap list --status acceptance')
    const format = await box.run('ki repo --repo repo roadmap list --format json')

    expect(text).toEqual({
      exitCode: 0,
      output: `╭─ KI REPO ROADMAP\n│  📁 repo\n│     ${root}\n├─ roadmap (1)\n│  ╰─ next (1)\n│     ╰─ KI-TOOL-CLI-003 [open] Inspect governed work\n├─ trades (0)\n│  ╰─ ❌ unavailable: ki environment is not bootstrapped; run \`ki bootstrap\` first\n╰─ summary: ITEMS=1 HORIZONS=1 TRADES=unavailable\n`
    })
    expect(accepted.output).toContain('KI-TOOL-CLI-010 [acceptance] Cleanup')
    expect(accepted.output).not.toContain('KI-TOOL-CLI-003')
    expect(agora.output).toContain('KI-TOOL-CLI-010 [acceptance] Cleanup')
    expect(empty.output).toContain('│  ╰─ items: none')
    expect(format.exitCode).toBe(2)
    expect(format.output).toContain("unknown option '--format' for 'ki repo roadmap list'")
  })

  test('isolates missing, malformed, invalid-status, and unsafe roadmap entries', async () => {
    const box = await sandbox()
    await box.project.write('valid/.ki-config.toml', '# valid\n')
    await box.project.write('valid/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item({ blocks: '[KI-TOOL-CLI-010]', 'transferred-from': 'example/source' }))
    await box.project.write('missing/.ki-config.toml', '# missing\n')
    await box.project.write('invalid-status/.ki-config.toml', '# invalid-status\n')
    await box.project.write('invalid-status/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item({ status: 'closed' }))
    await box.project.write('unsafe/.ki-config.toml', '# unsafe\n')
    await box.project.write('unsafe/docs/roadmap/target.md', item())
    await symlink(`${box.project.path}/unsafe/docs/roadmap/target.md`, `${box.project.path}/unsafe/docs/roadmap/KI-TOOL-CLI-003-inspect.md`)
    const valid = await realpath(`${box.project.path}/valid`)
    const missing = await realpath(`${box.project.path}/missing`)
    const invalidStatus = await realpath(`${box.project.path}/invalid-status`)
    const unsafe = await realpath(`${box.project.path}/unsafe`)

    const result = await box.run(['ki', 'repo', '--repo', valid, '--repo', missing, '--repo', invalidStatus, '--repo', unsafe, 'roadmap', 'list'])
    const retiredFormat = await box.run('ki repo --repo valid roadmap list --format yaml')

    expect(result.output).toContain(`│     ${valid}\n├─ roadmap (1)\n│  ╰─ next (1)\n│     ╰─ KI-TOOL-CLI-003 [open] Inspect governed work`)
    expect(result.output).toContain(`│  ╰─ ❌ repository ${missing} has no physical docs/roadmap directory`)
    expect(result.output).toContain(`│  ╰─ ❌ work item KI-TOOL-CLI-003-inspect.md has an invalid lifecycle status`)
    expect(result.output).toContain(`│  ╰─ ❌ work item KI-TOOL-CLI-003-inspect.md must be a regular file`)
    expect(retiredFormat.exitCode).toBe(2)
    expect(retiredFormat.output).toContain("unknown option '--format' for 'ki repo roadmap list'")
  })

  test('orders non-empty text output by horizon, lifecycle, then identifier', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '# repo\n')
    const items = [
      ['KI-TOOL-CLI-006', 'Blocking open', 'blocking', 'open'],
      ['KI-TOOL-CLI-005', 'Blocking done', 'blocking', 'done'],
      ['KI-TOOL-CLI-014', 'Next open', 'next', 'open'],
      ['KI-TOOL-CLI-013', 'Next ready', 'next', 'ready'],
      ['KI-TOOL-CLI-012', 'Next in progress', 'next', 'in-progress'],
      ['KI-TOOL-CLI-011', 'Next acceptance', 'next', 'acceptance'],
      ['KI-TOOL-CLI-010', 'Next done later', 'next', 'done'],
      ['KI-TOOL-CLI-009', 'Next done first', 'next', 'done'],
      ['KI-TOOL-CLI-015', 'Soon', 'soon', 'open'],
      ['KI-TOOL-CLI-016', 'Waiting', 'waiting-for', 'open'],
      ['KI-TOOL-CLI-017', 'Parked', 'parked', 'open'],
      ['KI-TOOL-CLI-018', 'Future', 'future', 'open']
    ] as const
    for (const [id, title, horizon, status] of items) {
      await box.project.write(`repo/docs/roadmap/${id}-item.md`, item({ id, title, horizon, status, ...(horizon === 'future' ? { candidate: 'true' } : {}) }))
    }

    const result = await box.run('ki repo --repo repo roadmap list')

    const expectedOrder = [
      '│  ├─ blocking',
      '│  │  ├─ KI-TOOL-CLI-005 [done] Blocking done',
      '│  │  ╰─ KI-TOOL-CLI-006 [open] Blocking open',
      '│  ├─ next',
      '│  │  ├─ KI-TOOL-CLI-009 [done] Next done first',
      '│  │  ├─ KI-TOOL-CLI-010 [done] Next done later',
      '│  │  ├─ KI-TOOL-CLI-011 [acceptance] Next acceptance',
      '│  │  ├─ KI-TOOL-CLI-012 [in-progress] Next in progress',
      '│  │  ├─ KI-TOOL-CLI-013 [ready] Next ready',
      '│  │  ╰─ KI-TOOL-CLI-014 [open] Next open',
      '│  ├─ soon',
      '│  ├─ waiting-for',
      '│  ├─ parked',
      '│  ╰─ future',
      '│     ╰─ KI-TOOL-CLI-018 [open] Future'
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
    const configuration = (repository: string, exportsTo: readonly string[], importsFrom: readonly string[]): string =>
      [
        '["knowledgeislands/ki-agentic-harness:ki-repo"]',
        `repository = ${JSON.stringify(repository)}`,
        '',
        '["knowledgeislands/ki-agentic-harness:ki-trades".exports_to]',
        `work = [${exportsTo.map((route) => JSON.stringify(route)).join(', ')}]`,
        'knowledge = []',
        '',
        '["knowledgeislands/ki-agentic-harness:ki-trades".imports_from]',
        `work = [${importsFrom.map((route) => JSON.stringify(route)).join(', ')}]`,
        'knowledge = []',
        ''
      ].join('\n')
    const record = (status = ''): string =>
      `---\nid: ${id}\ntitle: Trade-aware planning\ncreated_at: 2026-08-05T12:00:00Z\nsender: example/source\nreceiver: example/receiver\nkind: work\nsource_ref: KI-TOOL-CLI-012${status}\n---\n# ${id}: Trade-aware planning\n\n## Context\n\nTrade context.\n\n## Submission\n\nShow trades with roadmap work.\n\n## Constraints\n\nRemain read-only.\n`
    await box.project.write('source/.ki-config.toml', configuration(sourceHome, [receiverHome], []))
    await box.project.write('receiver/.ki-config.toml', configuration(receiverHome, [], [sourceHome]))
    await box.project.write('source/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item())
    await box.project.write(`source/-/_TRADES/example/receiver/${id}.md`, record())
    await box.project.write(`receiver/+/_TRADES/example/source/${id}.md`, record('\nstatus: received'))
    await box.config.write(
      'ki/config.toml',
      `schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n\n[repositories]\npaths = [${JSON.stringify(source)}, ${JSON.stringify(receiver)}]\n`
    )

    const result = await box.run('ki repo --repo source --repo receiver roadmap list')

    expect(result.output).toContain(`│  ╰─ export (1)\n│     ├─ work (1)\n│     │  ╰─ ${id} [sent] Trade-aware planning`)
    expect(result.output).toContain(`│  ├─ import (1)\n│  │  ├─ work (1)\n│  │  │  ╰─ ${id} [received] Trade-aware planning`)
    expect(result.output).toContain('TRADES=1 IMPORTS=0 EXPORTS=1')
    expect(result.output).toContain('TRADES=1 IMPORTS=1 EXPORTS=0')
  })

  test('rejects every malformed canonical frontmatter shape', async () => {
    const box = await sandbox()
    const cases = [
      ['absent.md', 'no frontmatter\n', 'must declare canonical frontmatter'],
      ['invalid.md', '---\nwrong\n---\n', 'frontmatter must contain simple key-value fields'],
      ['missing.md', '---\nid: KI-TOOL-CLI-003\n---\n', 'must declare title'],
      ['extra.md', item({ extra: 'field' }), 'has unsupported or repeated field extra'],
      ['id.md', item({ id: 'wrong' }), 'must use a matching work-item identifier'],
      ['KI-TOOL-CLI-003-invalid.md', item({ theme: 'Wrong' }), 'has invalid title, theme, or horizon'],
      ['KI-TOOL-CLI-003-baseline.md', item({ 'baseline-ref': 'wrong' }), 'baseline-ref must be null or a full commit ID'],
      ['KI-TOOL-CLI-003-future.md', item({ horizon: 'future' }), 'must use candidate: true only for future items'],
      ['KI-TOOL-CLI-003-candidate.md', item({ candidate: 'true' }), 'must use candidate: true only for future items'],
      ['KI-TOOL-CLI-003-list.md', item({ blocks: '[wrong]' }), 'blocks must be an identifier array']
    ] as const
    for (const [index, [name, contents, message]] of cases.entries()) {
      const repository = `repo-${index}`
      await box.project.write(`${repository}/.ki-config.toml`, '# repo\n')
      await box.project.write(`${repository}/docs/roadmap/${name}`, contents)
      const result = await box.run(`ki repo --repo ${repository} roadmap list`)
      expect(result.output).toContain(message)
    }
  })

  test('accepts quoted scalar frontmatter values', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki-config.toml', '# repo\n')
    await box.project.write('repo/docs/roadmap/KI-TOOL-CLI-003-inspect.md', item({ id: "'KI-TOOL-CLI-003'", title: '"Inspect governed work"', theme: "'cli'" }))

    const result = await box.run('ki repo --repo repo roadmap list')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('KI-TOOL-CLI-003 [open] Inspect governed work')
  })

  test('rejects the retired plan namespace', async () => {
    const box = await sandbox()

    expect((await box.run('ki repo plan list')).exitCode).toBe(2)
  })
})
