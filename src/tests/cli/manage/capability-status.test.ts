import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki manage missing and ki manage outdated]', () => {
  test('reports an empty desired set and no installed harnesses without network access', async () => {
    const box = await sandbox()

    const missing = await box.run('ki manage missing')
    const outdated = await box.run('ki manage outdated')

    expect(missing).toEqual({
      exitCode: 0,
      output: '╭─ KI MANAGE MISSING\n├─ capabilities (0)\n│  ╰─ none\n╰─ summary: MISSING=0\n'
    })
    expect(outdated).toEqual({
      exitCode: 0,
      output: '╭─ KI MANAGE OUTDATED\n├─ evidence gaps (0)\n│  ╰─ none\n╰─ summary: EVIDENCE_GAPS=0\n'
    })
  })

  test('reports missing user skills without inspecting the current repository', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      [
        'schema = 1',
        '',
        '[agents]',
        'ids = []',
        '',
        '[harnesses]',
        'ids = []',
        '',
        '[skills.ki-user]',
        'harness = "example/harness"',
        '',
        '[skills.ki-other]',
        'harness = "example/harness"',
        ''
      ].join('\n')
    )
    await box.project.write('.ki-config.toml', '[ki-repository\n')
    const configuration = await box.config.read('ki/config.toml')

    const result = await box.run('ki manage missing')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE MISSING\n├─ capabilities (2)\n│  ├─ user skill example/harness:ki-other\n│  ╰─ user skill example/harness:ki-user\n╰─ summary: MISSING=2\n'
    })
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
  })

  test('reports unavailable release evidence rather than claiming unrecorded harnesses are current', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })

    const result = await box.run('ki manage outdated')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE OUTDATED\n├─ evidence gaps (2)\n│  ├─ example/harness: no configured immutable release\n│  ╰─ knowledgeislands/ki-agentic-harness: installed release provenance is not recorded\n╰─ summary: EVIDENCE_GAPS=2\n'
    })
  })

  test('rejects malformed user configuration before reporting status', async () => {
    const box = await sandbox()
    await box.config.write('ki/config.toml', '[agents\n')

    const result = await box.run('ki manage missing')

    expect(result).toEqual({
      exitCode: 1,
      output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n'
    })
  })
})
