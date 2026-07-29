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

describe('[ki harness lifecycle]', () => {
  test('installs exactly one configured harness', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const installed = await box.run('ki harness install example/harness')

    expect(installed).toEqual({ exitCode: 0, output: `installed example/harness\tarchive ${archive.sha256}\n` })
    expect(await box.data.read('ki/harnesses/example/harness/skills/example/SKILL.md')).toBe(skill())
  })

  test('rejects retired top-level lifecycle and qualified-target grammars', async () => {
    const box = await sandbox()

    const retired = await box.run('ki install example/harness')
    const qualified = await box.run('ki harness install example/harness:ki-example')

    expect(retired.exitCode).toBe(2)
    expect(retired.output).toContain("unknown command 'install'")
    expect(qualified).toEqual({ exitCode: 2, output: 'ki: error: harness identifier must be an owner/name identifier\n' })
  })

  test('reinstalls an inactive installed harness only with a verified archive', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const reinstalled = await box.run('ki harness reinstall example/harness')

    expect(reinstalled).toEqual({ exitCode: 0, output: `reinstalled example/harness\tarchive ${archive.sha256}\n` })
    expect(await box.data.read('ki/harnesses/example/harness/skills/example/SKILL.md')).toBe(skill())
  })

  test('keeps an installed harness intact when a replacement payload is invalid', async () => {
    const box = await sandbox()
    const archive = makeHarnessArchive({ 'source/README.md': '# not a harness\n' })
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/harness', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const result = await box.run('ki harness reinstall example/harness')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('harness archive contains no skills, agents, or hooks payload')
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill())
  })

  test('blocks replacement and removal while a supplied user skill is active', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.setupExampleHarness()
    await box.config.write(
      'ki/config.toml',
      `${userConfiguration({ id: 'example/harness', sha256: archive.sha256 }).replace('[skills]\n', '[skills.ki-example]\nharness = "example/harness"\n')}`
    )
    box.setFetcher(async () => new Response(archive.payload))

    const reinstalled = await box.run('ki harness reinstall example/harness')
    const removed = await box.run('ki harness uninstall example/harness')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output: 'ki: error: cannot reinstall example/harness while it has active skills; run ki skill remove ki-example first\n'
    })
    expect(removed).toEqual({
      exitCode: 1,
      output: 'ki: error: cannot uninstall example/harness while it has active skills; run ki skill remove ki-example first\n'
    })
  })

  test('removes inactive non-canonical harnesses without inspecting repository declarations', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration())
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')

    const result = await box.run('ki harness uninstall example/harness')

    expect(result).toEqual({ exitCode: 0, output: 'uninstalled example/harness\n' })
    await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
  })

  test('allows removal when a user declaration names no capability supplied by the harness', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', userConfiguration().replace('[skills]\n', '[skills.ki-other]\nharness = "example/harness"\n'))

    const result = await box.run('ki harness uninstall example/harness')

    expect(result).toEqual({ exitCode: 0, output: 'uninstalled example/harness\n' })
  })

  test('protects canonical harnesses from removal and development-linked replacement', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await box.config.write('ki/config.toml', userConfiguration())
    const local = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    expect((await box.run(`ki dev local set ${local}`)).exitCode).toBe(0)
    expect((await box.run('ki dev local on')).exitCode).toBe(0)

    const reinstalled = await box.run('ki harness reinstall knowledgeislands/ki-agentic-harness')
    const removed = await box.run('ki harness uninstall knowledgeislands/ki-agentic-harness')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output:
        'ki: error: the canonical harness knowledgeislands/ki-agentic-harness is development-linked; run ki dev local off before reinstalling\n'
    })
    expect(removed).toEqual({
      exitCode: 1,
      output: 'ki: error: the canonical harness knowledgeislands/ki-agentic-harness cannot be uninstalled\n'
    })
  })

  test('requires an installed harness before reinstalling or uninstalling it', async () => {
    const box = await sandbox()

    const reinstalled = await box.run('ki harness reinstall example/harness')
    const removed = await box.run('ki harness uninstall example/harness')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output: 'ki: error: harness example/harness is not installed; run ki harness install example/harness first\n'
    })
    expect(removed).toEqual({ exitCode: 1, output: 'ki: error: harness example/harness is not installed\n' })
  })
})
