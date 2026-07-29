import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki local utility commands]', () => {
  test('searches verified installed capabilities case-insensitively in deterministic order without repository discovery', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await box.setupExampleHarness()
    await box.project.write('.ki-config.toml', '[not valid TOML\n')
    const example = await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')

    const result = await box.run('ki search SKILL')

    expect(result).toEqual({
      exitCode: 0,
      output:
        'ki search SKILL\nMatching installed capabilities:\n  example/harness skill ki-example\n  knowledgeislands/ki-agentic-harness skill ki-bootstrap\n  knowledgeislands/ki-agentic-harness skill ki-delegate\n  knowledgeislands/ki-agentic-harness skill ki-next\n  knowledgeislands/ki-agentic-harness skill ki-plan\n  knowledgeislands/ki-agentic-harness skill ki-recap\n'
    })
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(example)
  })

  test('searches harness identifiers and reports an explicit successful empty result', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()

    const identifier = await box.run('ki search EXAMPLE/HARNESS')
    const absent = await box.run('ki search absent')

    expect(identifier).toEqual({
      exitCode: 0,
      output: 'ki search EXAMPLE/HARNESS\nMatching installed capabilities:\n  example/harness skill ki-example\n'
    })
    expect(absent).toEqual({ exitCode: 0, output: 'ki search absent\nNo matching installed capabilities.\n' })
  })

  test('rejects missing, empty, additional, and option search arguments', async () => {
    const box = await sandbox()
    const missing = await box.run('ki search')
    const empty = await box.run(['ki', 'search', ''])
    const extra = await box.run('ki search one two')
    const option = await box.run('ki search --all')

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

    const result = await box.run('ki cleanup')

    expect(result).toEqual({ exitCode: 0, output: 'ki cleanup\nNo eligible managed stale state.\n' })
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill)
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
    const manual = await box.run('ki docs manual')
    const roadmap = await box.run('ki docs roadmap')

    expect(overview).toEqual({ exitCode: 0, output: 'https://github.com/knowledgeislands/tools-ki\n' })
    expect(manual).toEqual({ exitCode: 0, output: 'https://github.com/knowledgeislands/tools-ki/blob/main/man/ki.1\n' })
    expect(roadmap).toEqual({ exitCode: 0, output: 'https://github.com/knowledgeislands/tools-ki/blob/main/ROADMAP.md\n' })
  })

  test('rejects unknown documentation topics, options, and additional arguments', async () => {
    const box = await sandbox()
    const unknown = await box.run('ki docs guide')
    const option = await box.run('ki docs --open')
    const extra = await box.run('ki docs manual extra')

    expect(unknown).toEqual({ exitCode: 2, output: 'ki: error: docs topic must be overview, manual, or roadmap\n' })
    expect(option.exitCode).toBe(2)
    expect(extra.exitCode).toBe(2)
  })
})
