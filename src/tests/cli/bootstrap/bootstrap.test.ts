import { lstat, mkdir, readlink, realpath, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki bootstrap]', () => {
  test('bootstraps without replacement and refreshes the detected installed inventory on request', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.data.write(
      'ki/backpacks/knowledgeislands/ki-agent-backpack/skills/governance/ki-authoring/SKILL.md',
      '---\nname: ki-authoring\nki-depends-on: []\n---\n'
    )

    const bootstrapped = await box.run('ki bootstrap')
    const repeated = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')
    const checked = await box.run('ki doctor')

    expect(bootstrapped).toEqual({
      exitCode: 0,
      output: `created KI agent configuration for chatgpt-codex
canonical backpack already installed\tarchive abb4eb541e0cb7c46a17ac3dbf6f2f4a6334f782cea0e7165c81976a6fc12404
ki-bootstrap for chatgpt-codex installed
ki-next for chatgpt-codex installed
ki-plan for chatgpt-codex installed
ki-implement for chatgpt-codex installed
ki-accept for chatgpt-codex installed
ki-batch for chatgpt-codex installed
ki-recap for chatgpt-codex installed
ki-work-design for chatgpt-codex installed
`
    })
    expect(repeated).toEqual({
      exitCode: 0,
      output: `canonical backpack already installed\tarchive abb4eb541e0cb7c46a17ac3dbf6f2f4a6334f782cea0e7165c81976a6fc12404
ki-bootstrap for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-implement for chatgpt-codex already installed
ki-accept for chatgpt-codex already installed
ki-batch for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
ki-work-design for chatgpt-codex already installed
`
    })
    expect(refreshed).toEqual({
      exitCode: 0,
      output: `refreshed KI agents: chatgpt-codex
canonical backpack already installed\tarchive abb4eb541e0cb7c46a17ac3dbf6f2f4a6334f782cea0e7165c81976a6fc12404
refreshed ki configuration: 1 agents, 1 backpacks, 8 skills
ki-bootstrap for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-implement for chatgpt-codex already installed
ki-accept for chatgpt-codex already installed
ki-batch for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
ki-work-design for chatgpt-codex already installed
`
    })
    expect(checked.output).toContain('✓ Configuration:')
    expect(checked.output).toContain('✓ Backpack inventory: 1 installed')
    expect(checked.output).toContain('✓ Agent chatgpt-codex: ready')
    expect(checked.output).not.toContain('✗')
    const config = await box.config.read('ki/config.toml')
    expect(config).not.toContain('[skills.ki-authoring]')
    const expectedConfig = `[agents]
ids = [
  "chatgpt-codex",
]

[backpacks]
ids = [
  "knowledgeislands/ki-agent-backpack",
]

[skills]

[skills.ki-accept]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-batch]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-bootstrap]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-implement]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-next]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-plan]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-recap]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-work-design]
backpack = "knowledgeislands/ki-agent-backpack"
`
    expect(config).toBe(expectedConfig)
  })

  test('replaces a legacy flat configuration with the current unversioned sections on refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    const legacyConfig = `schema = 1
agents = ["chatgpt-codex"]
backpacks = []
skills = []
`
    await box.config.write('ki/config.toml', legacyConfig)
    await box.setupCanonicalBackpack()

    const refreshed = await box.run('ki bootstrap --refresh')
    const config = await box.config.read('ki/config.toml')
    const expectedAgentsSection = `[agents]
ids = [
  "chatgpt-codex",
]`

    expect(refreshed.exitCode).toBe(0)
    expect(config).toContain(expectedAgentsSection)
    expect(config).not.toContain('schema =')
  })

  test('preserves registered local and repository settings while refreshing configuration', async () => {
    const box = await sandbox()
    const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
    const repository = await realpath(box.project.path)
    const existing = await box.config.read('ki/config.toml')
    await box.config.write(
      'ki/config.toml',
      `${existing}\n[repositories]\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
    )
    await box.project.write(
      '.ki.toml',
      '[repo]\nbackpacks = ["knowledgeislands/ki-agent-backpack"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\n'
    )
    await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
    expect(await box.config.read('ki/config.toml')).toContain('[repositories]')

    const migrated = await box.run('ki bootstrap --refresh')
    await box.config.write(
      'ki/config.toml',
      `${await box.config.read('ki/config.toml')}\n[repositories]\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
    )
    await box.project.write(
      '.ki.toml',
      '[repo]\nbackpacks = ["knowledgeislands/ki-agent-backpack"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    )
    box.setRunner(async (command, arguments_) =>
      command === 'git' && arguments_.join(' ') === `-C ${repository} remote get-url origin`
        ? { exitCode: 0, output: 'git@github.com:example/project.git\n' }
        : { exitCode: 1, output: '' }
    )
    const refreshed = await box.run('ki bootstrap --refresh')

    expect(migrated.output).toContain('migrated local KI repository registry: 1 repositories')
    expect(refreshed.exitCode).toBe(0)
    expect(await box.state.read('ki/locals.toml')).toBe(
      `[locals."knowledgeislands/ki-agent-backpack"]\npath = ${JSON.stringify(backpackPath)}\n`
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
    await box.project.write('.ki.toml', '[repo]\nbackpacks = ["knowledgeislands/ki-agent-backpack"]\n')
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
      'backpacks',
      'knowledgeislands',
      'ki-agent-backpack',
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
    expect(await fresh.config.read('ki/config.toml')).toContain('[backpacks]')
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
      'ki configuration must declare an agents.ids string array and optional locals.<backpack-id>.path strings'
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

  test('rejects a non-table agents or locals section', async () => {
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
locals = "not-a-table"

[agents]
ids = ["claude-code"]
`
    )

    const rejectedAgents = await agentSection.run('ki bootstrap')
    const rejectedLocal = await localSection.run('ki bootstrap')

    expect(rejectedAgents).toEqual({
      exitCode: 1,
      output:
        'ki: error: ki configuration must declare an agents.ids string array and optional locals.<backpack-id>.path strings\n'
    })
    expect(rejectedLocal).toEqual({
      exitCode: 1,
      output:
        'ki: error: ki configuration must declare an agents.ids string array and optional locals.<backpack-id>.path strings\n'
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
    await box.setupExampleBackpack({ name: 'example-skill', prefix: 'example' })
    await box.project.write(
      '.ki.toml',
      '[repo]\nbackpacks = ["example/backpack"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nsupported_runtimes = ["claude-code"]\n'
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
    await box.setupCanonicalBackpack()

    const created = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')

    expect(created.output).toContain('created KI agent configuration for no detected agents')
    expect(refreshed.output).toContain('refreshed KI agents: none')
  })

  test('refuses an installed canonical backpack missing a required bootstrap skill', async () => {
    const box = await sandbox()
    await box.setupCanonicalBackpack()
    await rm(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack/skills/change-management/ki-implement`, {
      recursive: true
    })

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({
      exitCode: 1,
      output:
        'created KI agent configuration for no detected agents\nki: error: canonical backpack is incomplete: missing required bootstrap skill ki-keystone\n'
    })
  })

  test('keeps an active local development binding without contacting the archive', async () => {
    const box = await sandbox()
    const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    await box.setupAgentHome('claude-code')
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.root.write(
      'dev/knowledgeislands/ki-agent-backpack/skills/governance/ki-authoring/SKILL.md',
      '---\nname: ki-authoring\nki-depends-on: []\n---\n'
    )
    await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
    await box.run('ki dev local on')
    expect((await box.run('ki skill add ki-authoring')).exitCode).toBe(0)
    box.setFetcher(async () => {
      throw new Error('offline')
    })

    const bootstrapped = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')
    const doctor = await box.run('ki doctor')

    expect(bootstrapped.exitCode).toBe(0)
    expect(bootstrapped.output).toContain(`canonical backpack kept in local development\t${backpackPath}\n`)
    expect(bootstrapped.output).not.toContain('warning')
    expect(refreshed.exitCode).toBe(0)
    expect(refreshed.output).toContain(`canonical backpack kept in local development\t${backpackPath}\n`)
    expect(refreshed.output).toContain('ki-bootstrap for chatgpt-codex already installed')
    expect(await realpath(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`)).toBe(backpackPath)
    expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(true)
    for (const home of ['.claude', '.agents'])
      expect(await realpath(`${box.home.path}/${home}/skills/ki-bootstrap`)).toBe(
        `${backpackPath}/skills/keystone/ki-bootstrap`
      )
    for (const home of ['.claude', '.agents'])
      expect(await realpath(`${box.home.path}/${home}/skills/ki-authoring`)).toBe(
        `${backpackPath}/skills/governance/ki-authoring`
      )
    expect(await box.config.read('ki/config.toml')).toContain('[skills.ki-authoring]')
    expect(doctor.exitCode).toBe(0)
    expect(doctor.output).toContain(`✓ Local development knowledgeislands/ki-agent-backpack: active ${backpackPath}`)
    expect(doctor.output).not.toContain('✗')
  })

  test('rolls back local skill projections when refresh fails after linking them', async () => {
    const box = await sandbox()
    const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
    await box.run('ki dev local on')
    const configuration = await box.config.read('ki/config.toml')
    const skills = `${box.home.path}/.claude/skills`
    await unlink(`${skills}/ki-recap`)
    await unlink(`${skills}/ki-plan`)
    await symlink(`${box.root.path}/elsewhere`, `${skills}/ki-plan`, 'dir')
    await box.data.write('ki/backpacks/stray', '')

    const refreshed = await box.run('ki bootstrap --refresh')

    expect(refreshed.exitCode).toBe(1)
    expect(refreshed.output).toContain('installed backpacks directory contains an unsafe owner entry stray')
    expect(await box.config.read('ki/config.toml')).toBe(configuration)
    expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(true)
    expect(await lstat(`${skills}/ki-recap`).catch(() => undefined)).toBeUndefined()
    expect(await readlink(`${skills}/ki-plan`)).toBe(`${box.root.path}/elsewhere`)
    expect(await realpath(`${skills}/ki-bootstrap`)).toBe(`${backpackPath}/skills/keystone/ki-bootstrap`)
  })

  test('warns loudly before restoring the archive when a local development binding cannot be kept', async () => {
    const link = 'ki/backpacks/knowledgeislands/ki-agent-backpack'
    const prepare = async (box: Awaited<ReturnType<typeof sandbox>>, backpackPath: string) => {
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
      await box.run('ki dev local on')
      box.setFetcher(async () => {
        throw new Error('offline')
      })
    }
    const restoring = 'restoring the verified archive and re-pointing its configured skills.'
    const advice = `${restoring} To resume, run ki dev local on knowledgeislands/ki-agent-backpack once its checkout is available\n`

    const missing = await sandbox()
    const missingPath = await missing.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    await prepare(missing, missingPath)
    await rm(missingPath, { recursive: true })
    const missingResult = await missing.run('ki bootstrap')

    const mismatched = await sandbox()
    const configured = await mismatched.setupLocalCanonicalBackpack('dev/current/knowledgeislands/ki-agent-backpack')
    const other = await mismatched.setupLocalCanonicalBackpack('dev/other/knowledgeislands/ki-agent-backpack')
    await prepare(mismatched, configured)
    await unlink(`${mismatched.data.path}/${link}`)
    await symlink(other, `${mismatched.data.path}/${link}`, 'dir')
    const mismatchedResult = await mismatched.run('ki bootstrap')

    const unconfigured = await sandbox()
    const unconfiguredPath = await unconfigured.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    await prepare(unconfigured, unconfiguredPath)
    await unconfigured.state.write('ki/locals.toml', '')
    const unconfiguredResult = await unconfigured.run('ki bootstrap')

    const warning = 'ki: warning: leaving local development for knowledgeislands/ki-agent-backpack:'
    expect(missingResult.exitCode).toBe(1)
    expect(missingResult.stderr).toContain(`${warning} its checkout ${missingPath} is missing; ${advice}`)
    expect(missingResult.stdout).not.toContain('warning')
    expect(missingResult.output).toContain('could not download configured backpack knowledgeislands/ki-agent-backpack')
    expect(mismatchedResult.exitCode).toBe(1)
    expect(mismatchedResult.stderr).toContain(
      `${warning} its link targets ${other}, not the configured checkout ${configured}; ${advice}`
    )
    expect(await mismatched.data.isSymlink(link)).toBe(true)
    expect(unconfiguredResult.exitCode).toBe(1)
    expect(unconfiguredResult.stderr).toContain(
      `${warning} its link targets ${unconfiguredPath}, but no local checkout is configured; ${restoring} To resume, run ki dev local set knowledgeislands/ki-agent-backpack <checkout> and then ki dev local on knowledgeislands/ki-agent-backpack\n`
    )
    expect(await unconfigured.data.isSymlink(link)).toBe(true)
  })

  test('fails closed without leaving local development when the active checkout is incomplete', async () => {
    const box = await sandbox()
    const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
    await box.run('ki dev local on')
    await rm(`${backpackPath}/skills/keystone/ki-bootstrap`, { recursive: true })

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(1)
    expect(bootstrapped.output).toContain('does not provide ki-keystone')
    expect(await realpath(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`)).toBe(backpackPath)
  })

  test('refresh ignores a dangling managed link and a non-link skill entry', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleBackpack({ name: 'example-skill', prefix: 'example' })
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
    expect(refreshed.output).toContain('refreshed ki configuration: 1 agents, 2 backpacks, 8 skills')
    expect(config).not.toContain('[skills.example-skill]')
  })

  test('keeps user skills beyond the minimum on bootstrap and refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleBackpack({ name: 'example-skill', prefix: 'example' })
    await box.run('ki bootstrap')
    const added = await box.run('ki skill add example-skill')

    expect(added.exitCode).toBe(0)
    await box.run('ki bootstrap')
    expect(await box.config.read('ki/config.toml')).toContain('[skills.example-skill]')

    await box.run('ki bootstrap --refresh')
    expect(await box.config.read('ki/config.toml')).toContain('[skills.example-skill]')
  })
})
