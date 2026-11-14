import { lstat } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeBackpackArchive } from '../_archive_helper.ts'
import { sandbox } from '../_cli_helper.ts'

const skill = (name = 'ki-example'): string => `---\nname: ${name}\nki-depends-on: []\n---\n`

const userConfiguration = (release?: { readonly id: string; readonly sha256: string }): string =>
  [
    'schema = 1',
    '',
    '[agents]',
    'ids = []',
    '',
    '[backpacks]',
    'ids = []',
    ...(release
      ? [
          '',
          `releases = [{ id = "${release.id}", url = "https://releases.example.test/backpack.tgz", sha256 = "${release.sha256}" }]`
        ]
      : []),
    '',
    '[skills]',
    ''
  ].join('\n')

const configuredArchive = (name = 'ki-example') =>
  makeBackpackArchive({ 'source/skills/example/SKILL.md': skill(name) })

describe('[ki backpack lifecycle]', () => {
  test('installs exactly one configured backpack', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/backpack', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const installed = await box.run('ki backpack install example/backpack')

    expect(installed).toEqual({ exitCode: 0, output: `installed example/backpack\tarchive ${archive.sha256}\n` })
    expect(await box.data.read('ki/backpacks/example/backpack/skills/example/SKILL.md')).toBe(skill())
  })

  test('rejects retired top-level lifecycle and qualified-target grammars', async () => {
    const box = await sandbox()

    const retired = await box.run('ki install example/backpack')
    const qualified = await box.run('ki backpack install example/backpack:ki-example')

    expect(retired.exitCode).toBe(2)
    expect(retired.output).toContain("ki: error: unknown subcommand 'install' for 'ki'")
    expect(qualified).toEqual({
      exitCode: 2,
      output: 'ki: error: backpack identifier must be an owner/name identifier\n'
    })
  })

  test('reinstalls an inactive installed backpack only with a verified archive', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.setupExampleBackpack()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/backpack', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const reinstalled = await box.run('ki backpack reinstall example/backpack')

    expect(reinstalled).toEqual({ exitCode: 0, output: `reinstalled example/backpack\tarchive ${archive.sha256}\n` })
    expect(await box.data.read('ki/backpacks/example/backpack/skills/example/SKILL.md')).toBe(skill())
  })

  test('keeps an installed backpack intact when a replacement payload is invalid', async () => {
    const box = await sandbox()
    const archive = makeBackpackArchive({ 'source/README.md': '# not a backpack\n' })
    await box.setupExampleBackpack()
    await box.config.write('ki/config.toml', userConfiguration({ id: 'example/backpack', sha256: archive.sha256 }))
    box.setFetcher(async () => new Response(archive.payload))

    const result = await box.run('ki backpack reinstall example/backpack')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('backpack archive contains no skills, agents, or hooks payload')
    expect(await box.data.read('ki/backpacks/example/backpack/skills/ki-example/SKILL.md')).toBe(skill())
  })

  test('blocks replacement and removal while a supplied user skill is active', async () => {
    const box = await sandbox()
    const archive = configuredArchive()
    await box.setupExampleBackpack()
    await box.config.write(
      'ki/config.toml',
      `${userConfiguration({ id: 'example/backpack', sha256: archive.sha256 }).replace('[skills]\n', '[repo]\nbackpacks = ["example/backpack"]\n\n[skills.ki-example]\nbackpack = "example/backpack"\n')}`
    )
    box.setFetcher(async () => new Response(archive.payload))

    const reinstalled = await box.run('ki backpack reinstall example/backpack')
    const removed = await box.run('ki backpack uninstall example/backpack')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output:
        'ki: error: cannot reinstall example/backpack while it has active skills; run ki skill remove ki-example first\n'
    })
    expect(removed).toEqual({
      exitCode: 1,
      output:
        'ki: error: cannot uninstall example/backpack while it has active skills; run ki skill remove ki-example first\n'
    })
  })

  test('removes inactive non-canonical backpacks without inspecting repository declarations', async () => {
    const box = await sandbox()
    await box.setupExampleBackpack()
    await box.config.write('ki/config.toml', userConfiguration())
    await box.project.write('.ki.toml', '[repo]\nbackpacks = ["example/backpack"]\n\n[skills.ki-example]\n')

    const result = await box.run('ki backpack uninstall example/backpack')

    expect(result).toEqual({ exitCode: 0, output: 'uninstalled example/backpack\n' })
    await expect(lstat(`${box.data.path}/ki/backpacks/example/backpack`)).rejects.toThrow()
  })

  test('allows removal when a user declaration names no capability supplied by the backpack', async () => {
    const box = await sandbox()
    await box.setupExampleBackpack()
    await box.config.write(
      'ki/config.toml',
      userConfiguration().replace(
        '[skills]\n',
        '[repo]\nbackpacks = ["example/backpack"]\n\n[skills.ki-other]\nbackpack = "example/backpack"\n'
      )
    )

    const result = await box.run('ki backpack uninstall example/backpack')

    expect(result).toEqual({ exitCode: 0, output: 'uninstalled example/backpack\n' })
  })

  test('protects canonical backpacks from removal and development-linked replacement', async () => {
    const box = await sandbox()
    await box.setupCanonicalBackpack()
    await box.config.write('ki/config.toml', userConfiguration())
    const local = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
    expect((await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${local}`)).exitCode).toBe(0)
    expect((await box.run('ki dev local on')).exitCode).toBe(0)

    const reinstalled = await box.run('ki backpack reinstall knowledgeislands/ki-agent-backpack')
    const removed = await box.run('ki backpack uninstall knowledgeislands/ki-agent-backpack')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output:
        'ki: error: backpack knowledgeislands/ki-agent-backpack is development-linked; run ki dev local off before reinstalling\n'
    })
    expect(removed).toEqual({
      exitCode: 1,
      output: 'ki: error: the canonical backpack knowledgeislands/ki-agent-backpack cannot be uninstalled\n'
    })
  })

  test('requires an installed backpack before reinstalling or uninstalling it', async () => {
    const box = await sandbox()

    const reinstalled = await box.run('ki backpack reinstall example/backpack')
    const removed = await box.run('ki backpack uninstall example/backpack')

    expect(reinstalled).toEqual({
      exitCode: 1,
      output: 'ki: error: backpack example/backpack is not installed; run ki backpack install example/backpack first\n'
    })
    expect(removed).toEqual({ exitCode: 1, output: 'ki: error: backpack example/backpack is not installed\n' })
  })
})
