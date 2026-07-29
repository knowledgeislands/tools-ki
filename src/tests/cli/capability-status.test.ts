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

    const result = await box.run('ki missing')

    expect(result).toEqual({
      exitCode: 0,
      output: 'ki missing\nMissing capabilities:\n  user skill example/harness:ki-other\n  user skill example/harness:ki-user\n'
    })
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
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
