import { realpath } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { describe, expect, test } from 'vitest'
import { makeHarnessArchive } from '../_archive_helper.ts'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

/*
 * `config.toml` is rendered by chezmoi on each host, so `ki` must leave it byte-identical when
 * nothing it owns changes, and change only the owned lines when something does. Each fixture
 * restyles the configuration `ki bootstrap` first writes: a comment banner, a single-line agents
 * array with a trailing comment, a commented skills header and a multi-line territories array.
 */

const canonical = 'knowledgeislands/ki-agentic-harness'

const territories = `
[territories]
# Personal order, most-used first.
ranking = [
  "alpha", # the capital
  "beta",
]
`

/** The bootstrap-written configuration restyled by hand, with `extra` tables appended. */
const managed = async (box: Sandbox, extra = ''): Promise<string> => {
  const generated = await box.config.read('ki/config.toml')
  const fixture = `# Managed by chezmoi: edit the source, not this file.

${generated
  .replace(/^ids = \[\n {2}("[^"]+"),\n\]/m, "ids = [$1] # this host's agents")
  .replace('[skills]\n', '[skills] # user skills ki projects\n')}${territories}${extra}`
  await box.config.write('ki/config.toml', fixture)
  return fixture
}

describe('[ki bootstrap] managed configuration', () => {
  test('leaves a managed configuration byte-identical when bootstrap and refresh change nothing', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap --refresh')
    const fixture = await managed(box)

    const bootstrapped = await box.run('ki bootstrap')
    const afterBootstrap = await box.config.read('ki/config.toml')
    const refreshed = await box.run('ki bootstrap --refresh')

    expect(bootstrapped.exitCode).toBe(0)
    expect(afterBootstrap).toBe(fixture)
    expect(refreshed.exitCode).toBe(0)
    expect(await box.config.read('ki/config.toml')).toBe(fixture)
  })

  test('moves remembered checkouts out of a managed configuration without rewriting it', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap --refresh')
    const fixture = await managed(
      box,
      `\n# Remembered checkouts, awaiting removal from the chezmoi source.\n[locals.${JSON.stringify(canonical)}]\npath = ${JSON.stringify(harnessPath)}\n`
    )

    const moved = await box.run('ki bootstrap')
    const afterMove = await box.config.read('ki/config.toml')
    const on = await box.run(`ki dev local on ${canonical}`)

    expect(moved.output).toContain(`moved remembered local harness checkouts to ${box.state.path}/ki/locals.toml`)
    expect(await box.state.read('ki/locals.toml')).toBe(
      `[locals.${JSON.stringify(canonical)}]\npath = ${JSON.stringify(harnessPath)}\n`
    )
    expect(afterMove).toBe(fixture)
    expect(on.exitCode).toBe(0)
    expect(await box.config.read('ki/config.toml')).toBe(fixture)
  })

  test('switches local development on and off without rewriting a managed configuration', async () => {
    // Canonical `off` restores the pinned archive, which no sandbox fixture can match, so a second
    // harness with a configured release carries the round trip through the same refresh writer.
    const box = await sandbox()
    const skill = '---\nname: hnr-example\nki-depends-on: []\n---\n'
    const harness = 'humansnotrobots/hnr-agentic-harness'
    const installed = `ki/harnesses/${harness}`
    await box.setupAgentHome('chatgpt-codex')
    await box.data.write(`${installed}/.ki.toml`, '[skills.ki-repo-harness]\nprefix = "hnr"\n')
    await box.data.write(`${installed}/skills/hnr-example/SKILL.md`, skill)
    await Promise.all(['subagents', 'hooks'].map((payload) => box.data.mkdir(`${installed}/${payload}`)))
    await box.run('ki bootstrap --refresh')
    await box.run('ki skill add hnr-example')
    const checkout = `dev/${harness}`
    await box.root.write(`${checkout}/.ki.toml`, '[skills.ki-repo-harness]\nprefix = "hnr"\n')
    await box.root.write(`${checkout}/skills/hnr-example/SKILL.md`, skill)
    await Promise.all(['subagents', 'hooks'].map((payload) => box.root.mkdir(`${checkout}/${payload}`)))
    const local = await realpath(`${box.root.path}/${checkout}`)
    const archive = makeHarnessArchive({ 'source/skills/hnr-example/SKILL.md': skill }, { harnessPrefix: 'hnr' })
    box.setFetcher(async () => new Response(archive.payload))
    const fixture = await managed(
      box,
      `\n[[harnesses.releases]]\nid = ${JSON.stringify(harness)}\nurl = "https://releases.example.test/hnr.tgz" # pinned\nsha256 = "${archive.sha256}"\n`
    )

    const set = await box.run(`ki dev local set ${harness} ${local}`)
    const on = await box.run(`ki dev local on ${harness}`)
    const afterOn = await box.config.read('ki/config.toml')
    const off = await box.run(`ki dev local off ${harness}`)

    expect(set.exitCode).toBe(0)
    expect(on.exitCode).toBe(0)
    expect(afterOn).toBe(fixture)
    expect(off.exitCode).toBe(0)
    expect(await box.data.isSymlink(installed)).toBe(false)
    expect(await box.config.read('ki/config.toml')).toBe(fixture)
  })

  test('adds and removes a user skill without touching any other line', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.run('ki bootstrap')
    const fixture = await managed(box)

    const added = await box.run('ki skill add example-skill')
    const withSkill = await box.config.read('ki/config.toml')
    const removed = await box.run('ki skill remove example-skill')

    const harness = (parse(withSkill) as { skills: Record<string, { harness: string }> }).skills['example-skill']
      ?.harness
    expect(added.exitCode).toBe(0)
    expect(withSkill).toBe(
      fixture.replace(
        '\n\n[territories]',
        `\n\n[skills.example-skill]\nharness = ${JSON.stringify(harness)}\n\n[territories]`
      )
    )
    expect(removed.exitCode).toBe(0)
    expect(await box.config.read('ki/config.toml')).toBe(fixture)
  })

  test('rewrites only a changed array, keeping its single-line layout', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap --refresh')
    const fixture = await managed(box)
    await box.setupAgentHome('claude-code')

    const refreshed = await box.run('ki bootstrap --refresh')
    const config = await box.config.read('ki/config.toml')

    const ids = (parse(config) as { agents: { ids: string[] } }).agents.ids
    expect(refreshed.exitCode).toBe(0)
    expect([...ids].sort()).toEqual(['chatgpt-codex', 'claude-code'])
    expect(config).toBe(
      fixture.replace(
        `ids = ["chatgpt-codex"] # this host's agents`,
        `ids = [${ids.map((id) => JSON.stringify(id)).join(', ')}]`
      )
    )
  })

  test('drops the retired repository list on refresh and keeps the rest as written', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap --refresh')
    const repository = await realpath(box.project.path)
    const fixture = await managed(box)
    const repositories = `\n[repositories]\n# Retired: moved to the state registry.\npaths = [\n  ${JSON.stringify(repository)},\n]\n`
    await box.config.write('ki/config.toml', `${fixture}${repositories}`)
    await box.project.write(
      '.ki.toml',
      '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\n'
    )

    const refreshed = await box.run('ki bootstrap --refresh')

    expect(refreshed.output).toContain('migrated local KI repository registry: 1 repositories')
    expect(await box.config.read('ki/config.toml')).toBe(fixture)
  })

  test('keeps the retired repository list as written when adding a skill', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.run('ki bootstrap')
    const repositories = `\n[repositories]\npaths = [\n  ${JSON.stringify(await realpath(box.project.path))}, # retired\n]\n`
    const fixture = await managed(box, repositories)

    const added = await box.run('ki skill add example-skill')

    expect(added.exitCode).toBe(0)
    expect(await box.config.read('ki/config.toml')).toBe(
      fixture.replace('\n\n[territories]', '\n\n[skills.example-skill]\nharness = "example/harness"\n\n[territories]')
    )
  })

  test('removes a skill from a compact layout without a blank line to take with it', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.run('ki bootstrap')
    await box.run('ki skill add example-skill')
    const compact = (await managed(box)).replaceAll('\n\n[skills.', '\n[skills.')
    await box.config.write('ki/config.toml', compact)

    const removed = await box.run('ki skill remove example-skill')

    expect(removed.exitCode).toBe(0)
    expect(await box.config.read('ki/config.toml')).toBe(
      compact.replace('[skills.example-skill]\nharness = "example/harness"\n', '')
    )
  })

  test('lays out afresh a configuration whose owned values no text edit can reach, keeping every other setting', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    const repository = await realpath(box.project.path)
    const release = {
      id: 'example/other',
      url: 'https://releases.example.test/other.tgz',
      sha256: 'a'.repeat(64)
    }
    await box.config.write(
      'ki/config.toml',
      `skills = { ki-next = { harness = ${JSON.stringify(canonical)} } }

[agents]
ids = ["claude-code"]

[harnesses]
ids = [${JSON.stringify(canonical)}]

[[harnesses.releases]]
id = ${JSON.stringify(release.id)}
url = ${JSON.stringify(release.url)}
sha256 = ${JSON.stringify(release.sha256)}

[repositories]
paths = [${JSON.stringify(repository)}]
${territories}`
    )

    const added = await box.run('ki skill add example-skill')

    expect(added.exitCode).toBe(0)
    expect(parse(await box.config.read('ki/config.toml'))).toEqual({
      agents: { ids: ['claude-code'] },
      harnesses: { ids: [canonical], releases: [release] },
      skills: { 'example-skill': { harness: 'example/harness' }, 'ki-next': { harness: canonical } },
      territories: { ranking: ['alpha', 'beta'] },
      repositories: { paths: [repository] }
    })
  })

  test('keeps a malformed release entry verbatim when laying out a legacy configuration afresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.config.write('ki/config.toml', 'agents = ["chatgpt-codex"]\n\n[harnesses]\nreleases = ["malformed"]\n')

    const refreshed = await box.run('ki bootstrap --refresh')

    expect(refreshed.output).toContain('ki: error: harnesses[0] must be a table')
    expect(parse(await box.config.read('ki/config.toml'))).toEqual({
      agents: { ids: ['chatgpt-codex'] },
      harnesses: { ids: [], releases: ['malformed'] },
      skills: {}
    })
  })

  test('replaces an unparseable configuration on refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.config.write('ki/config.toml', 'agents = [\n')

    const refreshed = await box.run('ki bootstrap --refresh')

    expect(refreshed.exitCode).toBe(0)
    expect(parse(await box.config.read('ki/config.toml'))['agents']).toEqual({ ids: ['chatgpt-codex'] })
  })
})
