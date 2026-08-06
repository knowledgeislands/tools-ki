import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki manage list]', () => {
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

    const result = await box.run('ki manage list')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE\n├─ harnesses (1)\n│  ╰─ example/harness (1)\n│     ╰─ skill ki-example\n├─ user skills (2)\n│  ├─ example/harness:ki-a\n│  ╰─ example/harness:ki-example\n├─ repositories (0)\n│  ╰─ none\n╰─ summary: HARNESSES=1 CAPABILITIES=1 USER_SKILLS=2 REPOSITORIES=0\n'
    })
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
  })

  test('renders explicit empty sections', async () => {
    const box = await sandbox()

    const result = await box.run('ki manage list')

    expect(result).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE\n├─ harnesses (0)\n│  ╰─ none\n├─ user skills (0)\n│  ╰─ none\n├─ repositories (0)\n│  ╰─ none\n╰─ summary: HARNESSES=0 CAPABILITIES=0 USER_SKILLS=0 REPOSITORIES=0\n'
    })
  })

  test('renders every installed harness in its capability section', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.data.write(
      'ki/harnesses/other/harness/skills/ki-other/SKILL.md',
      '---\nname: ki-other\nki-depends-on: []\n---\n'
    )

    const result = await box.run('ki manage list')

    expect(result.output).toContain(
      '│  ├─ example/harness (1)\n│  │  ╰─ skill ki-example\n│  ╰─ other/harness (1)\n│     ╰─ skill ki-other'
    )
  })

  test('rejects arguments and invalid user configuration without inspecting repository declarations', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '[ki-example\n')
    const grammar = await box.run('ki manage list unexpected')
    const invalidDeclaration = await box.run('ki manage list')
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    await box.config.write('ki/config.toml', '[agents\n')
    const invalidConfiguration = await box.run('ki manage list')

    expect(grammar).toEqual({
      exitCode: 2,
      output:
        "error: too many arguments for 'list'. Expected 0 arguments but got 1: unexpected.\n\nUsage: ki manage list [options]\n\nlist installed harness capabilities and declared skills\n\nOptions:\n  -h, --help  display help for command\n"
    })
    expect(invalidDeclaration).toEqual({
      exitCode: 0,
      output:
        '╭─ KI MANAGE\n├─ harnesses (0)\n│  ╰─ none\n├─ user skills (0)\n│  ╰─ none\n├─ repositories (0)\n│  ╰─ none\n╰─ summary: HARNESSES=0 CAPABILITIES=0 USER_SKILLS=0 REPOSITORIES=0\n'
    })
    expect(invalidConfiguration).toEqual({
      exitCode: 1,
      output: 'ki: error: ki configuration is invalid: configuration must be valid TOML\n'
    })
  })
})
