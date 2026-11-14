import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki backpack missing and ki backpack outdated]', () => {
  test('reports an empty desired set and no installed backpacks without network access', async () => {
    const box = await sandbox()

    const missing = await box.run('ki backpack missing')
    const outdated = await box.run('ki backpack outdated')

    expect(missing).toEqual({
      exitCode: 0,
      output: '╭─ KI BACKPACK MISSING\n├─ capabilities (0)\n│  ╰─ none\n╰─ summary: MISSING=0\n'
    })
    expect(outdated).toEqual({
      exitCode: 0,
      output: '╭─ KI BACKPACK OUTDATED\n├─ evidence gaps (0)\n│  ╰─ none\n╰─ summary: EVIDENCE_GAPS=0\n'
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
        '[backpacks]',
        'ids = []',
        '',
        '[skills.ki-user]',
        'backpack = "example/backpack"',
        '',
        '[skills.ki-other]',
        'backpack = "example/backpack"',
        ''
      ].join('\n')
    )
    await box.project.write('.ki.toml', '[ki-repository\n')
    const configuration = await box.config.read('ki/config.toml')

    const result = await box.run('ki backpack missing')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI BACKPACK MISSING\n├─ capabilities (2)\n│  ├─ user skill example/backpack:ki-other\n│  ╰─ user skill example/backpack:ki-user\n╰─ summary: MISSING=2\n'
    })
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
  })

  test('reports unavailable release evidence rather than claiming unrecorded backpacks are current', async () => {
    const box = await sandbox()
    await box.setupCanonicalBackpack()
    await box.setupExampleBackpack({ name: 'example-skill', prefix: 'example' })

    const result = await box.run('ki backpack outdated')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI BACKPACK OUTDATED\n├─ evidence gaps (2)\n│  ├─ example/backpack: no configured immutable release\n│  ╰─ knowledgeislands/ki-agent-backpack: installed release provenance is not recorded\n╰─ summary: EVIDENCE_GAPS=2\n'
    })
  })

  test('rejects malformed user configuration before reporting status', async () => {
    const box = await sandbox()
    await box.config.write('ki/config.toml', '[agents\n')

    const result = await box.run('ki backpack missing')

    expect(result).toEqual({
      exitCode: 1,
      output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n'
    })
  })
})
