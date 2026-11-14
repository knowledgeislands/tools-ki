import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki local utility commands]', () => {
  test('searches verified installed capabilities case-insensitively in deterministic order without repository discovery', async () => {
    const box = await sandbox()
    await box.setupCanonicalBackpack()
    await box.setupExampleBackpack({ name: 'example-skill', prefix: 'example' })
    await box.project.write('.ki.toml', '[not valid TOML\n')
    const example = await box.data.read('ki/backpacks/example/backpack/skills/example-skill/SKILL.md')

    const result = await box.run('ki backpack search SKILL')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI BACKPACK SEARCH\n├─ query: SKILL\n├─ matches (9)\n│  ├─ example/backpack skill example-skill\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-accept\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-batch\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-bootstrap\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-implement\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-next\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-plan\n│  ├─ knowledgeislands/ki-agent-backpack skill ki-recap\n│  ╰─ knowledgeislands/ki-agent-backpack skill ki-work-design\n╰─ summary: MATCHES=9\n'
    })
    expect(await box.data.read('ki/backpacks/example/backpack/skills/example-skill/SKILL.md')).toBe(example)
  })

  test('searches backpack identifiers and reports an explicit successful empty result', async () => {
    const box = await sandbox()
    await box.setupExampleBackpack()

    const identifier = await box.run('ki backpack search EXAMPLE/BACKPACK')
    const absent = await box.run('ki backpack search absent')

    expect(identifier).toEqual({
      exitCode: 0,
      output:
        '╭─ KI BACKPACK SEARCH\n├─ query: EXAMPLE/BACKPACK\n├─ matches (1)\n│  ╰─ example/backpack skill ki-example\n╰─ summary: MATCHES=1\n'
    })
    expect(absent).toEqual({
      exitCode: 0,
      output: '╭─ KI BACKPACK SEARCH\n├─ query: absent\n├─ matches (0)\n│  ╰─ none\n╰─ summary: MATCHES=0\n'
    })
  })

  test('rejects missing, empty, additional, and option search arguments', async () => {
    const box = await sandbox()
    const missing = await box.run('ki backpack search')
    const empty = await box.run(['ki', 'backpack', 'search', ''])
    const extra = await box.run('ki backpack search one two')
    const option = await box.run('ki backpack search --all')

    expect(missing.exitCode).toBe(2)
    expect(empty).toEqual({ exitCode: 2, output: 'ki: error: search query must not be empty\n' })
    expect(extra.exitCode).toBe(2)
    expect(option.exitCode).toBe(2)
  })

  test('reports no eligible managed stale state without changing any installed backpack or unknown file', async () => {
    const box = await sandbox()
    await box.setupExampleBackpack()
    await box.data.write('ki/unknown-state', 'leave untouched\n')
    const skill = await box.data.read('ki/backpacks/example/backpack/skills/ki-example/SKILL.md')
    const unknown = await box.data.read('ki/unknown-state')

    const result = await box.run('ki cleanup')

    expect(result).toEqual({
      exitCode: 0,
      output: '╭─ KI CLEANUP\n├─ eligible (0)\n│  ╰─ none\n╰─ summary: ELIGIBLE=0\n'
    })
    expect(await box.data.read('ki/backpacks/example/backpack/skills/ki-example/SKILL.md')).toBe(skill)
    expect(await box.data.read('ki/unknown-state')).toBe(unknown)
  })

  test('rejects cleanup arguments and options', async () => {
    const box = await sandbox()
    const argument = await box.run('ki cleanup now')
    const option = await box.run('ki cleanup --all')

    expect(argument.exitCode).toBe(2)
    expect(option.exitCode).toBe(2)
  })

  test('prints canonical documentation URLs without launching or fetching content', async () => {
    const box = await sandbox()
    const overview = await box.run('ki docs')
    const explicitOverview = await box.run('ki docs overview')
    const site = await box.run('ki docs site')
    const manual = await box.run('ki docs manual')
    const roadmap = await box.run('ki docs roadmap')

    expect(overview).toEqual({
      exitCode: 0,
      output:
        'Overview: https://knowledgeislands.info/projects/ki/\nSite: https://knowledgeislands.info/\nManual: https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1\nRoadmap: https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md\n'
    })
    expect(explicitOverview).toEqual({ exitCode: 0, output: 'https://knowledgeislands.info/projects/ki/\n' })
    expect(site).toEqual({ exitCode: 0, output: 'https://knowledgeislands.info/\n' })
    expect(manual).toEqual({ exitCode: 0, output: 'https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1\n' })
    expect(roadmap).toEqual({
      exitCode: 0,
      output: 'https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md\n'
    })
  })

  test('rejects unknown documentation topics, options, and additional arguments', async () => {
    const box = await sandbox()
    const unknown = await box.run('ki docs guide')
    const option = await box.run('ki docs --open')
    const extra = await box.run('ki docs manual extra')

    expect(unknown).toEqual({
      exitCode: 2,
      output: 'ki: error: docs topic must be overview, site, manual, or roadmap\n'
    })
    expect(option.exitCode).toBe(2)
    expect(extra.exitCode).toBe(2)
  })
})
