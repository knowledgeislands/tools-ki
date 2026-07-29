import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki list]', () => {
  test('lists installed capabilities and declared user skills without inspecting the current repository', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
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
        '[skills.ki-a]',
        'harness = "example/harness"',
        '',
        '[skills.ki-example]',
        'harness = "example/harness"',
        ''
      ].join('\n')
    )
    await box.project.write('.ki-config.toml', '[ki-example\n')
    const configuration = await box.config.read('ki/config.toml')

    const result = await box.run('ki list')

    expect(result).toEqual({
      exitCode: 0,
      output: 'ki list\nInstalled harnesses:\n  example/harness\n    skill ki-example\nUser skills:\n  example/harness:ki-a\n  example/harness:ki-example\n'
    })
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
  })

  test('renders explicit empty sections', async () => {
    const box = await sandbox()

    const result = await box.run('ki list')

    expect(result).toEqual({ exitCode: 0, output: 'ki list\nInstalled harnesses:\n  none\nUser skills:\n  none\n' })
  })

  test('rejects arguments and invalid user configuration without inspecting repository declarations', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example\n')
    const grammar = await box.run('ki list unexpected')
    const invalidDeclaration = await box.run('ki list')
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    await box.config.write('ki/config.toml', '[agents\n')
    const invalidConfiguration = await box.run('ki list')

    expect(grammar).toEqual({
      exitCode: 2,
      output:
        "error: too many arguments for 'list'. Expected 0 arguments but got 1.\n\nUsage: ki list [options]\n\nlist installed harness capabilities and declared skills\n\nOptions:\n  -h, --help  display help for command\n"
    })
    expect(invalidDeclaration).toEqual({ exitCode: 0, output: 'ki list\nInstalled harnesses:\n  none\nUser skills:\n  none\n' })
    expect(invalidConfiguration).toEqual({
      exitCode: 1,
      output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n'
    })
  })
})
