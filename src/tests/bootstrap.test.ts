import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, installBootstrapHarness, runKi, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki bootstrap', () => {
  test('bootstraps without replacement and refreshes the detected installed inventory on request', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const configuration = join(root, 'config')
    const data = join(root, 'data')
    await mkdir(join(home, '.agents'), { recursive: true })
    await installBootstrapHarness(data)

    const bootstrapped = await runKi(['bootstrap'], { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data })
    const repeated = await runKi(['bootstrap'], { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data })
    const refreshed = await runKi(['bootstrap', '--refresh'], { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data })
    const checked = await runKi(['doctor'], { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data })

    expect(bootstrapped).toEqual({
      exitCode: 0,
      output:
        'created KI agent configuration for chatgpt-codex\n' +
        'canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c\n' +
        'ki-bootstrap for chatgpt-codex installed\n' +
        'ki-delegate for chatgpt-codex installed\n' +
        'ki-next for chatgpt-codex installed\n' +
        'ki-plan for chatgpt-codex installed\n' +
        'ki-recap for chatgpt-codex installed\n'
    })
    expect(repeated).toEqual({
      exitCode: 0,
      output:
        'canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c\n' +
        'ki-bootstrap for chatgpt-codex already installed\n' +
        'ki-delegate for chatgpt-codex already installed\n' +
        'ki-next for chatgpt-codex already installed\n' +
        'ki-plan for chatgpt-codex already installed\n' +
        'ki-recap for chatgpt-codex already installed\n'
    })
    expect(refreshed).toEqual({
      exitCode: 0,
      output:
        'refreshed KI agents: chatgpt-codex\n' +
        'canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c\n' +
        'refreshed KI configuration: 1 agents, 1 harnesses, 5 skills\n' +
        'ki-bootstrap for chatgpt-codex already installed\n' +
        'ki-delegate for chatgpt-codex already installed\n' +
        'ki-next for chatgpt-codex already installed\n' +
        'ki-plan for chatgpt-codex already installed\n' +
        'ki-recap for chatgpt-codex already installed\n'
    })
    expect(checked.output).toContain('✓ Configuration:')
    expect(checked.output).toContain('✓ Harness inventory: 1 installed')
    expect(checked.output).toContain('✓ Agent chatgpt-codex: ready')
    expect(checked.output).not.toContain('✗')
    expect(await readFile(join(configuration, 'ki', 'config.toml'), 'utf8')).toBe(
      `schema = 1

[agents]
ids = [
  "chatgpt-codex",
]

[harnesses]
ids = [
  "knowledgeislands/ki-agentic-harness",
]

[skills]

[skills.ki-bootstrap]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-delegate]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-next]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-plan]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-recap]
harness = "knowledgeislands/ki-agentic-harness"
`
    )
  })
})
