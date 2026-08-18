import { mkdir, realpath, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki bootstrap]', () => {
  test('bootstraps without replacement and refreshes the detected installed inventory on request', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.data.write(
      'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-authoring/SKILL.md',
      '---\nname: ki-authoring\nki-depends-on: []\n---\n'
    )

    const bootstrapped = await box.run('ki bootstrap')
    const repeated = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')
    const checked = await box.run('ki manage doctor')

    expect(bootstrapped).toEqual({
      exitCode: 0,
      output: `created KI agent configuration for chatgpt-codex
canonical harness already installed\tarchive 9d395e9b35748f7cbb26b93f96407ab407d166d2d4e2fbc8519781585ee2692c
ki-bootstrap for chatgpt-codex installed
ki-next for chatgpt-codex installed
ki-plan for chatgpt-codex installed
ki-implement for chatgpt-codex installed
ki-accept for chatgpt-codex installed
ki-batch for chatgpt-codex installed
ki-recap for chatgpt-codex installed
`
    })
    expect(repeated).toEqual({
      exitCode: 0,
      output: `canonical harness already installed\tarchive 9d395e9b35748f7cbb26b93f96407ab407d166d2d4e2fbc8519781585ee2692c
ki-bootstrap for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-implement for chatgpt-codex already installed
ki-accept for chatgpt-codex already installed
ki-batch for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
`
    })
    expect(refreshed).toEqual({
      exitCode: 0,
      output: `refreshed KI agents: chatgpt-codex
canonical harness already installed\tarchive 9d395e9b35748f7cbb26b93f96407ab407d166d2d4e2fbc8519781585ee2692c
refreshed ki configuration: 1 agents, 1 harnesses, 7 skills
ki-bootstrap for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-implement for chatgpt-codex already installed
ki-accept for chatgpt-codex already installed
ki-batch for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
`
    })
    expect(checked.output).toContain('✓ Configuration:')
    expect(checked.output).toContain('✓ Harness inventory: 1 installed')
    expect(checked.output).toContain('✓ Agent chatgpt-codex: ready')
    expect(checked.output).not.toContain('✗')
    const config = await box.config.read('ki/config.toml')
    expect(config).not.toContain('[skills.ki-authoring]')
    const expectedConfig = `schema = 1

[agents]
ids = [
  "chatgpt-codex",
]

[harnesses]
ids = [
  "knowledgeislands/ki-agentic-harness",
]

[skills]

[skills.ki-accept]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-batch]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-bootstrap]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-implement]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-next]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-plan]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-recap]
harness = "knowledgeislands/ki-agentic-harness"
`
    expect(config).toBe(expectedConfig)
  })

  test('replaces a legacy flat configuration with the current sectioned schema on refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    const legacyConfig = `schema = 1
agents = ["chatgpt-codex"]
harnesses = []
skills = []
`
    await box.config.write('ki/config.toml', legacyConfig)
    await box.setupCanonicalHarness()

    const refreshed = await box.run('ki bootstrap --refresh')
    const config = await box.config.read('ki/config.toml')
    const expectedAgentsSection = `[agents]
ids = [
  "chatgpt-codex",
]`

    expect(refreshed.exitCode).toBe(0)
    expect(config).toContain(expectedAgentsSection)
  })

  test('preserves registered local and repository settings while refreshing configuration', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    const repository = await realpath(box.project.path)
    const existing = await box.config.read('ki/config.toml')
    await box.config.write(
      'ki/config.toml',
      `${existing}\n[repositories]\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
    )
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
    )
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    expect(await box.config.read('ki/config.toml')).toContain('[repositories]')

    const migrated = await box.run('ki bootstrap --refresh')
    await box.config.write(
      'ki/config.toml',
      `${await box.config.read('ki/config.toml')}\n[repositories]\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
    )
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n\n[skills.ki-repo]\n'
    )
    box.setRunner(async (command, arguments_) =>
      command === 'git' && arguments_.join(' ') === `-C ${repository} remote get-url origin`
        ? { exitCode: 0, output: 'git@github.com:example/project.git\n' }
        : { exitCode: 1, output: '' }
    )
    const refreshed = await box.run('ki bootstrap --refresh')

    expect(migrated.output).toContain('migrated local KI repository registry: 1 repositories')
    expect(refreshed.exitCode).toBe(0)
    expect(await box.config.read('ki/config.toml')).toContain(
      `[local]\nharness = "knowledgeislands/ki-agentic-harness"\npath = ${JSON.stringify(harnessPath)}\n`
    )
    expect(await box.config.read('ki/config.toml')).not.toContain('[repositories]')
    expect(await box.state.read('ki/registry.toml')).toContain(`path = ${JSON.stringify(repository)}`)
    expect(await box.state.read('ki/registry.toml')).toContain('repository = "https://github.com/example/project"')
  })

  test('retains the retired path list when a legacy checkout has no canonical configuration or origin identity', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    const repository = await realpath(box.project.path)
    const existing = await box.config.read('ki/config.toml')
    await box.config.write(
      'ki/config.toml',
      `${existing}\n[repositories]\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
    )
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n')
    box.setRunner(async () => ({ exitCode: 1, output: 'no origin\n' }))

    const failed = await box.run('ki bootstrap --refresh')

    expect(failed).toEqual({
      exitCode: 1,
      output: `ki: error: legacy repository ${repository} has no canonical GitHub identity\n`
    })
    expect(await box.config.read('ki/config.toml')).toContain('[repositories]')
  })

  test('refuses to replace a foreign core-skill link during bootstrap but reconciles it on refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    const foreign = await box.root.mkdir('foreign-core-skill')
    const target = join(box.home.path, '.agents', 'skills', 'ki-bootstrap')
    await mkdir(join(box.home.path, '.agents', 'skills'), { recursive: true })
    await symlink(foreign, target, 'dir')

    const result = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')
    const source = join(
      box.data.path,
      'ki',
      'harnesses',
      'knowledgeislands',
      'ki-agentic-harness',
      'skills',
      'keystone',
      'ki-bootstrap'
    )
    await unlink(target)
    await symlink(join(box.root.path, 'missing-core-skill'), target, 'dir')
    const repairedDangling = await box.run('ki bootstrap --refresh')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('ki-bootstrap skill points elsewhere; pass --replace to re-point')
    expect(refreshed.exitCode).toBe(0)
    expect(repairedDangling.exitCode).toBe(0)
    expect(await realpath(target)).toBe(await realpath(source))
  })

  test('creates a complete refresh configuration when none exists and refuses a foreign core-skill directory', async () => {
    const fresh = await sandbox()
    await fresh.setupAgentHome('chatgpt-codex')
    const refreshed = await fresh.run('ki bootstrap --refresh')

    const foreign = await sandbox()
    await foreign.setupAgentHome('chatgpt-codex')
    await foreign.home.mkdir('.agents/skills/ki-bootstrap')
    const refused = await foreign.run('ki bootstrap --refresh')

    expect(refreshed.exitCode).toBe(0)
    expect(await fresh.config.read('ki/config.toml')).toContain('[harnesses]')
    expect(refused.output).toContain('chatgpt-codex ki-bootstrap skill is not KI-managed')
  })

  test('rejects an existing configuration file that is not valid TOML', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(1)
    expect(bootstrapped.output).toContain('agent configuration must be valid TOML')
  })

  test('rejects an existing configuration whose agents.ids is not a string array', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["chatgpt-codex", 5]
`
    )

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(1)
    expect(bootstrapped.output).toContain(
      'ki configuration must declare an agents.ids string array and optional local harness and path strings'
    )
  })

  test('rejects duplicate configured agents', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["claude-code", "claude-code"]
`
    )

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({ exitCode: 1, output: 'ki: error: agent configuration repeats an agent\n' })
  })

  test('rejects a configuration file that is a directory', async () => {
    const box = await sandbox()
    await box.config.mkdir('ki/config.toml')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({ exitCode: 1, output: 'ki: error: agent configuration must be a regular file\n' })
  })

  test('rejects a non-table agents or local section', async () => {
    const agentSection = await sandbox()
    await agentSection.config.write(
      'ki/config.toml',
      `schema = 1
agents = "not-a-table"
`
    )
    const localSection = await sandbox()
    await localSection.config.write(
      'ki/config.toml',
      `schema = 1
local = "not-a-table"

[agents]
ids = ["claude-code"]
`
    )

    const rejectedAgents = await agentSection.run('ki bootstrap')
    const rejectedLocal = await localSection.run('ki bootstrap')

    expect(rejectedAgents).toEqual({
      exitCode: 1,
      output:
        'ki: error: ki configuration must declare an agents.ids string array and optional local harness and path strings\n'
    })
    expect(rejectedLocal).toEqual({
      exitCode: 1,
      output:
        'ki: error: ki configuration must declare an agents.ids string array and optional local harness and path strings\n'
    })
  })

  test('rejects a configuration location whose parent is not a directory', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.config.write('ki', 'not a directory')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({ exitCode: 1, output: 'ki: error: ki configuration directory must be a directory\n' })
  })

  test('detects both physical agent homes when creating configuration', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupAgentHome('chatgpt-codex')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(0)
    expect(bootstrapped.output).toContain('created KI agent configuration for claude-code, chatgpt-codex')
  })

  test('uses a configured agent’s repository skill path when linking a repository skill', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.project.write(
      '.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nsupported_runtimes = ["claude-code"]\n'
    )
    await box.run('ki bootstrap')

    const added = await box.run(`ki repo --repo ${box.project.path} skill add example-skill`)

    expect(added.exitCode).toBe(0)
    expect(added.output).toContain('ki repo skill add: linked example-skill into ')
    expect(added.output).toContain(' for claude-code\n')
    expect(await box.project.isSymlink('.claude/skills/example-skill')).toBe(true)
  })

  test('reports an empty detected inventory when creating and refreshing configuration', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()

    const created = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')

    expect(created.output).toContain('created KI agent configuration for no detected agents')
    expect(refreshed.output).toContain('refreshed KI agents: none')
  })

  test('refuses an installed canonical harness missing a required bootstrap skill', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await rm(
      `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills/change-management/ki-implement`,
      { recursive: true }
    )

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({
      exitCode: 1,
      output:
        'created KI agent configuration for no detected agents\nki: error: canonical harness is incomplete: missing required bootstrap skill ki-implement\n'
    })
  })

  test('keeps an active local projection coherent when archive bootstrap fails', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    const configuration = await box.config.read('ki/config.toml')
    await box.setupAgentHome('chatgpt-codex')
    box.setFetcher(async () => {
      throw new Error('offline')
    })

    const bootstrapped = await box.run('ki bootstrap --refresh')
    const doctor = await box.run('ki manage doctor')

    expect(bootstrapped.exitCode).toBe(1)
    expect(bootstrapped.output).toContain('could not download configured harness knowledgeislands/ki-agentic-harness')
    expect(bootstrapped.output).not.toContain('skill points elsewhere')
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
    for (const payload of ['skills', 'subagents', 'hooks']) {
      expect(await box.data.isSymlink(`ki/harnesses/knowledgeislands/ki-agentic-harness/${payload}`)).toBe(true)
    }
    expect(await realpath(`${box.home.path}/.claude/skills/ki-bootstrap`)).toBe(
      `${harnessPath}/skills/keystone/ki-bootstrap`
    )
    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).toContain(`✓ Local development: active ${harnessPath}`)
    expect(doctor.output).not.toContain('✗')
  })

  test('refresh ignores a dangling managed link and a non-link skill entry', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.run('ki bootstrap')
    await box.run('ki skill add example-skill')
    const skillDirectory = join(box.home.path, '.claude', 'skills')
    const target = join(skillDirectory, 'example-skill')
    await unlink(target)
    await symlink(join(box.root.path, 'missing-skill'), target, 'dir')
    await mkdir(join(skillDirectory, 'notes'))

    const refreshed = await box.run('ki bootstrap --refresh')
    const config = await box.config.read('ki/config.toml')

    expect(refreshed.exitCode).toBe(0)
    expect(refreshed.output).toContain('refreshed ki configuration: 1 agents, 2 harnesses, 7 skills')
    expect(config).not.toContain('[skills.example-skill]')
  })

  test('keeps user skills beyond the minimum on bootstrap and refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.run('ki bootstrap')
    const added = await box.run('ki skill add example-skill')

    expect(added.exitCode).toBe(0)
    await box.run('ki bootstrap')
    expect(await box.config.read('ki/config.toml')).toContain('[skills.example-skill]')

    await box.run('ki bootstrap --refresh')
    expect(await box.config.read('ki/config.toml')).toContain('[skills.example-skill]')
  })
})
