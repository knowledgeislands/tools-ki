import { lstat } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeHarnessArchive } from './_archive_helper.ts'
import { sandbox } from './_cli_helper.ts'

const skill = (name = 'ki-example'): string => `---\nname: ${name}\nki-depends-on: []\n---\n`

const userConfiguration = (release?: { readonly id: string; readonly sha256: string }): string =>
  [
    'schema = 1',
    '',
    '[agents]',
    'ids = []',
    '',
    '[harnesses]',
    'ids = []',
    ...(release
      ? ['', `releases = [{ id = "${release.id}", url = "https://releases.example.test/harness.tgz", sha256 = "${release.sha256}" }]`]
      : []),
    '',
    '[skills]',
    ''
  ].join('\n')

const configuredArchive = (name = 'ki-example') => makeHarnessArchive({ 'source/skills/example/SKILL.md': skill(name) })

describe('[ki lifecycle]', () => {
  test('installs a supplier-qualified capability only after the verified payload proves it', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const installed = await box.run('ki install example/harness:ki-example')

    expect(installed).toEqual({ exitCode: 0, output: `installed example/harness\tarchive ${archive.sha256}\n` })
    expect(await box.data.read('ki/harnesses/example/harness/skills/example/SKILL.md')).toBe(skill())
    expect(await box.config.read('ki/config.toml')).toContain('"example/harness"')
  })

  test('fails closed when a qualified capability is absent from the verified archive', async () => {
    const box = await sandbox()
    const archive = configuredArchive('ki-other')
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const result = await box.run('ki install example/harness:ki-example')

    expect(result).toEqual({ exitCode: 1, output: 'ki: error: harness example/harness does not provide skill ki-example\n' })
    await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
  })

  test('does not acquire an unconfigured supplier or mutate state', async () => {
    const box = await sandbox()

    const result = await box.run('ki install example/harness:ki-example')

    expect(result).toEqual({
      exitCode: 1,
      output: 'ki: error: harness example/harness is not configured in the immutable release registry\n'
    })
    await expect(lstat(`${box.data.path}/ki/harnesses`)).rejects.toThrow()
  })

  test('resolves a bare capability only when exactly one installed harness provides it', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()

    const existing = await box.run('ki install ki-example')
    const dryExisting = await box.run('ki install ki-example --dry-run')
    const absent = await box.run('ki install ki-missing')
    await box.data.write('ki/harnesses/other/harness/skills/other/SKILL.md', skill())
    const ambiguous = await box.run('ki uninstall ki-example')

    expect(existing).toEqual({ exitCode: 0, output: 'example/harness is already installed\n' })
    expect(dryExisting).toEqual({ exitCode: 0, output: 'example/harness is already installed\n' })
    expect(absent).toEqual({
      exitCode: 1,
      output: 'ki: error: skill ki-missing is not installed; use <harness-id>:ki-missing to acquire a configured supplier\n'
    })
    expect(ambiguous).toEqual({
      exitCode: 1,
      output: 'ki: error: skill ki-example is provided by multiple installed harnesses; use <harness-id>:ki-example\n'
    })
  })

  test('rejects a qualified capability that its installed supplier does not provide', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()

    const result = await box.run('ki install example/harness:ki-missing')

    expect(result).toEqual({ exitCode: 1, output: 'ki: error: harness example/harness does not provide skill ki-missing\n' })
  })

  test('validates dry-run installs without downloading or changing state', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))

    const result = await box.run('ki install example/harness:ki-example --dry-run')

    expect(result).toEqual({ exitCode: 0, output: 'would install example/harness\n' })
    await expect(lstat(`${box.data.path}/ki/harnesses`)).rejects.toThrow()
  })

  test('replaces an inactive installed harness only with a newly verified archive', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const dryRun = await box.run('ki reinstall example/harness:ki-example --dry-run')
    const reinstalled = await box.run('ki reinstall ki-example')

    expect(dryRun).toEqual({ exitCode: 0, output: 'would reinstall example/harness\n' })
    expect(reinstalled).toEqual({ exitCode: 0, output: `reinstalled example/harness\tarchive ${archive.sha256}\n` })
    expect(await box.data.read('ki/harnesses/example/harness/skills/example/SKILL.md')).toBe(skill())
  })

  test('keeps an installed harness intact when a reinstall payload is invalid', async () => {
    const box = await sandbox()
    const archive = makeHarnessArchive({ 'source/README.md': '# not a harness\n' })
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const result = await box.run('ki reinstall example/harness')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('harness archive contains no skills, agents, or hooks payload')
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill())
  })

  test('refuses lifecycle replacement and removal while a supplied user skill is active', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.setupExampleHarness()
    await box.config.write(
      'ki/config.toml',
      `${userConfiguration({ id: 'example/harness', sha256: archive.sha256 }).replace('[skills]\n', '[skills.ki-example]\nharness = "example/harness"\n')}`
    )
    box.setFetcher(async () => new Response(archive.payload))

    const reinstalled = await box.run('ki reinstall example/harness')
    const removed = await box.run('ki uninstall example/harness')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output: 'ki: error: cannot reinstall example/harness while it has active skills; run ki skill user remove ki-example first\n'
    })
    expect(removed).toEqual({
      exitCode: 1,
      output: 'ki: error: cannot uninstall example/harness while it has active skills; run ki skill user remove ki-example first\n'
    })
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill())
  })

  test('refuses lifecycle removal while a current repository declares a supplied skill', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration())
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')

    const result = await box.run('ki uninstall example/harness')

    expect(result).toEqual({
      exitCode: 1,
      output: 'ki: error: cannot uninstall example/harness while it has active skills; run ki skill repo remove ki-example first\n'
    })
  })

  test('allows removal when invalid user and repository declarations do not name a supplied capability', async () => {
    const box = await sandbox()
    await box.data.write('ki/harnesses/example/harness/skills/other/SKILL.md', skill('ki-other'))
    await box.config.write(
      'ki/config.toml',
      `${userConfiguration().replace('[skills]\n', '[skills.ki-example]\nharness = "example/harness"\n')}`
    )
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')

    const result = await box.run('ki uninstall example/harness')

    expect(result).toEqual({ exitCode: 0, output: 'uninstalled example/harness\n' })
  })

  test('refuses removal when user activation state cannot be inspected', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', '[skills\n')

    const result = await box.run('ki uninstall example/harness')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('ki configuration is invalid: configuration must be valid TOML')
  })

  test('removes inactive non-canonical harnesses without changing activation and protects the canonical harness', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    const dryRun = await box.run('ki uninstall example/harness --dry-run')
    const removed = await box.run('ki uninstall example/harness:ki-example')
    await box.setupCanonicalHarness()
    const canonical = await box.run('ki uninstall knowledgeislands/ki-agentic-harness')

    expect(dryRun).toEqual({ exitCode: 0, output: 'would uninstall example/harness\n' })
    expect(removed).toEqual({ exitCode: 0, output: 'uninstalled example/harness\n' })
    await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
    expect(canonical).toEqual({
      exitCode: 1,
      output: 'ki: error: the canonical harness knowledgeislands/ki-agentic-harness cannot be uninstalled\n'
    })
  })

  test('rejects malformed lifecycle targets before inspecting installed state', async () => {
    const box = await sandbox()

    const result = await box.run('ki install bad/target:bad:target')

    expect(result).toEqual({
      exitCode: 2,
      output: 'ki: error: lifecycle target must be a harness id, harness id:skill, or bare skill capability\n'
    })
  })

  test('rejects an unqualified malformed target before inspecting installed state', async () => {
    const box = await sandbox()

    const result = await box.run('ki install KI-EXAMPLE')

    expect(result).toEqual({
      exitCode: 2,
      output: 'ki: error: lifecycle target must be a harness id, harness id:skill, or bare skill capability\n'
    })
  })

  test('refuses to replace a development-linked canonical harness', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await box.config.write('ki/config.toml', userConfiguration())
    const local = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    const enabled = await box.run(`ki dev on ${local}`)

    const result = await box.run('ki reinstall knowledgeislands/ki-agentic-harness --dry-run')

    expect(enabled.exitCode).toBe(0)
    expect(result).toEqual({
      exitCode: 1,
      output:
        'ki: error: the canonical harness knowledgeislands/ki-agentic-harness is development-linked; run ki dev off before reinstalling\n'
    })
  })

  test('requires an installed harness before reinstalling or uninstalling it', async () => {
    const box = await sandbox()

    const reinstalled = await box.run('ki reinstall example/harness')
    const removed = await box.run('ki uninstall example/harness')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output: 'ki: error: harness example/harness is not installed; run ki install example/harness first\n'
    })
    expect(removed).toEqual({ exitCode: 1, output: 'ki: error: harness example/harness is not installed\n' })
  })
})
