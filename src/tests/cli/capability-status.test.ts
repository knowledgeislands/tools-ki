import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki missing and ki outdated]', () => {
  test('reports an empty desired set and no installed harnesses without network access', async () => {
    const box = await sandbox()

    const missing = await box.run('ki missing')
    const outdated = await box.run('ki outdated')

    expect(missing).toEqual({ exitCode: 0, output: 'ki missing\nNo missing capabilities.\n' })
    expect(outdated).toEqual({ exitCode: 0, output: 'ki outdated\nNo installed harnesses.\n' })
  })

  test('reports missing user and CWD-resolved repository skills without mutating configuration', async () => {
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
        ''
      ].join('\n')
    )
    await box.project.write('.ki-config.toml', '["example/harness:ki-repository"]\n')
    const configuration = await box.config.read('ki/config.toml')

    const result = await box.run('ki missing')

    expect(result).toEqual({
      exitCode: 0,
      output: 'ki missing\nMissing capabilities:\n  repository skill example/harness:ki-repository\n  user skill example/harness:ki-user\n'
    })
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
  })

  test('uses the declared repository provider even when another provides the same skill', async () => {
    const box = await sandbox()
    await box.config.write('ki/config.toml', 'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n')
    await box.setupExampleHarness()
    await box.data.write('ki/harnesses/example/harness/skills/ki-a/SKILL.md', '---\nname: ki-a\nki-depends-on: []\n---\n')
    await box.data.write('ki/harnesses/example/harness/skills/ki-only/SKILL.md', '---\nname: ki-only\nki-depends-on: []\n---\n')
    await box.data.write('ki/harnesses/other/harness/skills/ki-a/SKILL.md', '---\nname: ki-a\nki-depends-on: []\n---\n')
    await box.data.write('ki/harnesses/other/harness/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')
    await box.project.write(
      '.ki-config.toml',
      '["example/harness:ki-example"]\n\n["example/harness:ki-a"]\n\n["example/harness:ki-only"]\n'
    )

    const result = await box.run('ki missing')

    expect(result).toEqual({
      exitCode: 0,
      output: 'ki missing\nNo missing capabilities.\n'
    })
  })

  test('reports unavailable release evidence rather than claiming unrecorded harnesses are current', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await box.setupExampleHarness()

    const result = await box.run('ki outdated')

    expect(result).toEqual({
      exitCode: 0,
      output:
        'ki outdated\nNo comparable newer release evidence.\nUnavailable release evidence:\n  example/harness: no configured immutable release\n  knowledgeislands/ki-agentic-harness: installed release provenance is not recorded\n'
    })
  })

  test('rejects malformed user configuration before reporting status', async () => {
    const box = await sandbox()
    await box.config.write('ki/config.toml', '[agents\n')

    const result = await box.run('ki missing')

    expect(result).toEqual({ exitCode: 1, output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n' })
  })
})
