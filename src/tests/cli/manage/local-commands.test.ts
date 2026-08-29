import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki local utility commands]', () => {
  test('searches verified installed capabilities case-insensitively in deterministic order without repository discovery', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.project.write('.ki.toml', '[not valid TOML\n')
    const example = await box.data.read('ki/harnesses/example/harness/skills/example-skill/SKILL.md')

    const result = await box.run('ki manage search SKILL')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE SEARCH\n├─ query: SKILL\n├─ matches (8)\n│  ├─ example/harness skill example-skill\n│  ├─ knowledgeislands/ki-agentic-harness skill ki-accept\n│  ├─ knowledgeislands/ki-agentic-harness skill ki-batch\n│  ├─ knowledgeislands/ki-agentic-harness skill ki-bootstrap\n│  ├─ knowledgeislands/ki-agentic-harness skill ki-implement\n│  ├─ knowledgeislands/ki-agentic-harness skill ki-next\n│  ├─ knowledgeislands/ki-agentic-harness skill ki-plan\n│  ╰─ knowledgeislands/ki-agentic-harness skill ki-recap\n╰─ summary: MATCHES=8\n'
    })
    expect(await box.data.read('ki/harnesses/example/harness/skills/example-skill/SKILL.md')).toBe(example)
  })

  test('searches harness identifiers and reports an explicit successful empty result', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()

    const identifier = await box.run('ki manage search EXAMPLE/HARNESS')
    const absent = await box.run('ki manage search absent')

    expect(identifier).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE SEARCH\n├─ query: EXAMPLE/HARNESS\n├─ matches (1)\n│  ╰─ example/harness skill ki-example\n╰─ summary: MATCHES=1\n'
    })
    expect(absent).toEqual({
      exitCode: 0,
      output: '╭─ KI MANAGE SEARCH\n├─ query: absent\n├─ matches (0)\n│  ╰─ none\n╰─ summary: MATCHES=0\n'
    })
  })

  test('rejects missing, empty, additional, and option search arguments', async () => {
    const box = await sandbox()
    const missing = await box.run('ki manage search')
    const empty = await box.run(['ki', 'manage', 'search', ''])
    const extra = await box.run('ki manage search one two')
    const option = await box.run('ki manage search --all')

    expect(missing.exitCode).toBe(2)
    expect(empty).toEqual({ exitCode: 2, output: 'ki: error: search query must not be empty\n' })
    expect(extra.exitCode).toBe(2)
    expect(option.exitCode).toBe(2)
  })

  test('reports no eligible managed stale state without changing any installed harness or unknown file', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.data.write('ki/unknown-state', 'leave untouched\n')
    const skill = await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')
    const unknown = await box.data.read('ki/unknown-state')

    const result = await box.run('ki manage cleanup')

    expect(result).toEqual({
      exitCode: 0,
      output: '╭─ KI MANAGE CLEANUP\n├─ eligible (0)\n│  ╰─ none\n╰─ summary: ELIGIBLE=0\n'
    })
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill)
    expect(await box.data.read('ki/unknown-state')).toBe(unknown)
  })

  test('rejects cleanup arguments and options', async () => {
    const box = await sandbox()
    const argument = await box.run('ki manage cleanup now')
    const option = await box.run('ki manage cleanup --all')

    expect(argument.exitCode).toBe(2)
    expect(option.exitCode).toBe(2)
  })

  test('prints canonical documentation URLs without launching or fetching content', async () => {
    const box = await sandbox()
    const overview = await box.run('ki manage docs')
    const explicitOverview = await box.run('ki manage docs overview')
    const site = await box.run('ki manage docs site')
    const manual = await box.run('ki manage docs manual')
    const roadmap = await box.run('ki manage docs roadmap')

    expect(overview).toEqual({
      exitCode: 0,
      output:
        'Overview: https://knowledgeislands.info/tooling/cli/\nSite: https://knowledgeislands.info/\nManual: https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1\nRoadmap: https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md\n'
    })
    expect(explicitOverview).toEqual({ exitCode: 0, output: 'https://knowledgeislands.info/tooling/cli/\n' })
    expect(site).toEqual({ exitCode: 0, output: 'https://knowledgeislands.info/\n' })
    expect(manual).toEqual({ exitCode: 0, output: 'https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1\n' })
    expect(roadmap).toEqual({
      exitCode: 0,
      output: 'https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md\n'
    })
  })

  test('rejects unknown documentation topics, options, and additional arguments', async () => {
    const box = await sandbox()
    const unknown = await box.run('ki manage docs guide')
    const option = await box.run('ki manage docs --open')
    const extra = await box.run('ki manage docs manual extra')

    expect(unknown).toEqual({
      exitCode: 2,
      output: 'ki: error: docs topic must be overview, site, manual, or roadmap\n'
    })
    expect(option.exitCode).toBe(2)
    expect(extra.exitCode).toBe(2)
  })
})
