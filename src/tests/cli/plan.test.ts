import { realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

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

describe('[ki repo plan]', () => {
  test('lists and filters ordered governed work items in text and JSON', async () => {
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
    await box.project.write(
      '.ki-workspace.toml',
      'schema = 1\ndefault = "inventory"\n\n[groups.inventory]\n\n[groups.inventory.members.repo]\nkind = "repository"\n'
    )
    const root = await realpath(`${box.project.path}/repo`)

    const text = await box.run('ki repo --repo repo plan list --horizon next --status open')
    const json = await box.run('ki repo --repo repo plan list --format json')
    const accepted = await box.run('ki repo --repo repo plan list --status acceptance')
    const empty = await box.run('ki repo --repo repo plan list --horizon blocking')
    const workspace = await box.run('ki repo --workspace inventory plan list --status acceptance')

    expect(text).toEqual({
      exitCode: 0,
      output: `ki repo plan list\nRepository: ${root}\nItems:\n  KI-TOOL-CLI-003 [next/open] Inspect governed work\n`
    })
    expect(JSON.parse(json.output)).toEqual({
      repositories: [
        {
          repository: root,
          items: [
            {
              id: 'KI-TOOL-CLI-003',
              title: 'Inspect governed work',
              theme: 'cli',
              horizon: 'next',
              status: 'open',
              blocks: [],
              blockedBy: [],
              baselineRef: null
            },
            {
              id: 'KI-TOOL-CLI-010',
              title: 'Cleanup',
              theme: 'cli',
              horizon: 'future',
              status: 'acceptance',
              blocks: [],
              blockedBy: [],
              baselineRef: 'a'.repeat(40),
              candidate: true
            }
          ]
        }
      ]
    })
    expect(accepted.output).toContain('KI-TOOL-CLI-010 [future/acceptance] Cleanup')
    expect(accepted.output).not.toContain('KI-TOOL-CLI-003')
    expect(workspace.output).toContain('KI-TOOL-CLI-010 [future/acceptance] Cleanup')
    expect(empty.output).toContain('Items: none')
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

    const result = await box.run(['ki', 'repo', '--repo', valid, '--repo', missing, '--repo', invalidStatus, '--repo', unsafe, 'plan', 'list'])
    const invalidFormat = await box.run('ki repo --repo valid plan list --format yaml')

    expect(result.output).toContain(`Repository: ${valid}\nItems:\n  KI-TOOL-CLI-003 [next/open] Inspect governed work`)
    expect(result.output).toContain(`Repository: ${missing}\nDiagnostic: repository ${missing} has no physical docs/roadmap directory`)
    expect(result.output).toContain(`Repository: ${invalidStatus}\nDiagnostic: work item KI-TOOL-CLI-003-inspect.md has an invalid lifecycle status`)
    expect(result.output).toContain(`Repository: ${unsafe}\nDiagnostic: work item KI-TOOL-CLI-003-inspect.md must be a regular file`)
    expect(invalidFormat).toEqual({ exitCode: 2, output: 'ki: error: --format accepts text or json\n' })
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
      const result = await box.run(`ki repo --repo ${repository} plan list`)
      expect(result.output).toContain(message)
    }
  })
})
