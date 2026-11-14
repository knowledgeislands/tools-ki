import { chmod, lstat, readdir, readlink, realpath, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { makeBackpackArchive } from '../_archive_helper.ts'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

// ki named backpacks "harnesses" until 0.17: the data folder `harnesses/`, the `[repo] harnesses`
// key, the `[harnesses]` configuration table and the `ki harness` command. For one release each
// retired name is still read, with a warning, and every link through the old layout keeps working.
const canonical = 'knowledgeislands/ki-agent-backpack'
const retiredSlot = 'example/demo-agentic-harness'
const backpackSlot = 'example/demo-agent-backpack'

const repositoryDeclaration = (key: string): string =>
  `[repo]\n${key} = ["${canonical}"] # the canonical backpack\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\ntitle = "Example"\ndescription = "Example repository."\nrepo_code = "EXAMPLE"\nsupported_runtimes = ["chatgpt-codex"]\nvisibility = "private"\n\n[skills.ki-example]\n`

/** Puts the data folder back in the 0.16 layout, with every link under `home` spelt through it. */
const retireDataFolder = async (box: Sandbox, roots: readonly string[]): Promise<readonly string[]> => {
  const backpacks = await realpath(join(box.data.path, 'ki/backpacks'))
  const harnesses = join(box.data.path, 'ki/harnesses')
  await rename(backpacks, harnesses)
  const relinked: string[] = []
  for (const root of roots) {
    const directory = await realpath(root)
    for (const name of await readdir(directory)) {
      const link = join(directory, name)
      const text = await readlink(link).catch(() => undefined)
      if (!text?.startsWith(`${backpacks}/`)) continue
      await unlink(link)
      await symlink(`${harnesses}/${text.slice(backpacks.length + 1)}`, link, 'dir')
      relinked.push(link)
    }
  }
  return relinked
}

describe('[backpack rename]', () => {
  describe('data folder', () => {
    test('moves harnesses to backpacks once, leaving a relative link so existing links keep resolving', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      const skills = join(box.home.path, '.claude/skills')
      const relinked = await retireDataFolder(box, [skills])

      const first = await box.run('ki backpack list')
      const second = await box.run('ki backpack list')

      expect(relinked.length).toBeGreaterThan(0)
      expect(first.exitCode).toBe(0)
      expect(first.stderr).toBe(
        `ki: warning: moved installed backpacks from ${box.data.path}/ki/harnesses to ${box.data.path}/ki/backpacks; ${box.data.path}/ki/harnesses links to it until the next release\n`
      )
      expect(first.stdout).toContain(`${canonical} (`)
      expect(second).toEqual({ exitCode: 0, output: first.stdout })
      expect(await readlink(join(box.data.path, 'ki/harnesses'))).toBe('backpacks')
      expect((await lstat(join(box.data.path, 'ki/backpacks'))).isDirectory()).toBe(true)
      for (const link of relinked) expect(await realpath(link)).toContain('/ki/backpacks/')
    })

    test('moves a development slot linked to its checkout unchanged', async () => {
      const box = await sandbox()
      const checkout = await box.setupLocalCanonicalBackpack('checkouts/ki-agent-backpack')
      await box.data.mkdir('ki/harnesses/knowledgeislands')
      await symlink(checkout, join(box.data.path, `ki/harnesses/${canonical}`), 'dir')

      const listed = await box.run('ki backpack list')

      expect(listed.exitCode).toBe(0)
      expect(listed.stdout).toContain(`${canonical} (`)
      expect(await readlink(join(box.data.path, `ki/backpacks/${canonical}`))).toBe(checkout)
    })

    test('moves into an empty backpacks folder', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      await rename(join(box.data.path, 'ki/backpacks'), join(box.data.path, 'ki/harnesses'))
      await box.data.mkdir('ki/backpacks')

      const listed = await box.run('ki backpack list')

      expect(listed.exitCode).toBe(0)
      expect(listed.stderr).toContain('moved installed backpacks')
      expect(await readlink(join(box.data.path, 'ki/harnesses'))).toBe('backpacks')
    })

    test('reads backpacks only, with a warning, while both folders hold backpacks', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      await box.data.write('ki/harnesses/example/backpack/.ki.toml', '')

      const listed = await box.run('ki backpack list')

      expect(listed.exitCode).toBe(0)
      expect(listed.stderr).toBe(
        `ki: warning: both ${box.data.path}/ki/harnesses and ${box.data.path}/ki/backpacks exist; ki reads ${box.data.path}/ki/backpacks only, so merge or remove ${box.data.path}/ki/harnesses\n`
      )
      expect(listed.stdout).not.toContain('example/backpack')
      expect(await box.data.isSymlink('ki/harnesses')).toBe(false)
    })

    test('warns about a harnesses entry that is neither a folder nor the migration link', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      await box.data.write('ki/harnesses', 'stray\n')
      await box.root.mkdir('other')

      const stray = await box.run('ki backpack list')
      await unlink(join(box.data.path, 'ki/harnesses'))
      await symlink('../other', join(box.data.path, 'ki/harnesses'))
      const foreignLink = await box.run('ki backpack list')
      await unlink(join(box.data.path, 'ki/harnesses'))
      await symlink('backpacks', join(box.data.path, 'ki/harnesses'))
      const migrationLink = await box.run('ki backpack list')

      const warning = `ki: warning: ${box.data.path}/ki/harnesses is neither a folder nor ki's link to ${box.data.path}/ki/backpacks; ki reads ${box.data.path}/ki/backpacks only, so remove it\n`
      expect(stray.stderr).toBe(warning)
      expect(foreignLink.stderr).toBe(warning)
      expect(migrationLink.stderr).toBe('')
    })

    test('leaves the data folder alone for help, version and the commit-msg check', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      await rename(join(box.data.path, 'ki/backpacks'), join(box.data.path, 'ki/harnesses'))

      await box.run('ki help')
      await box.run('ki backpack --help')
      await box.run('ki --version')
      await box.run('ki git')

      await expect(lstat(join(box.data.path, 'ki/backpacks'))).rejects.toThrow()
    })

    test('fails a command whose data folder cannot be moved', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      await rename(join(box.data.path, 'ki/backpacks'), join(box.data.path, 'ki/harnesses'))
      await chmod(join(box.data.path, 'ki'), 0o555)
      try {
        await expect(box.run('ki backpack list')).rejects.toThrow(/EACCES|EPERM/)
      } finally {
        await chmod(join(box.data.path, 'ki'), 0o755)
      }
    })
  })

  describe('installed slots', () => {
    test('moves a retired slot to its backpack name, leaving an alias that uninstall removes', async () => {
      const box = await sandbox()
      await box.config.write('ki/config.toml', `[backpacks]\nids = ["${backpackSlot}"]\n`)
      await box.setupExampleBackpack({ identifier: retiredSlot })

      const listed = await box.run('ki backpack list')
      const owner = join(box.data.path, 'ki/backpacks/example')
      const alias = await readlink(join(owner, 'demo-agentic-harness'))
      const removed = await box.run(`ki backpack uninstall ${retiredSlot}`)

      expect(listed.stderr).toBe(
        `ki: warning: renamed installed backpack slot ${retiredSlot} to ${backpackSlot}; the old name links to it until the next release\n`
      )
      expect(listed.stdout).toContain(`${backpackSlot} (1)`)
      expect(alias).toBe('demo-agent-backpack')
      expect(removed.output).toContain(`uninstalled ${backpackSlot}`)
      expect(await readdir(owner)).toEqual([])
    })

    test('keeps a slot alias when uninstall removes another backpack', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack({ identifier: retiredSlot })
      await box.setupExampleBackpack({ identifier: 'example/other', name: 'other-example' })
      await box.run('ki backpack list')

      const removed = await box.run('ki backpack uninstall example/other')

      expect(removed.exitCode).toBe(0)
      expect(await readlink(join(box.data.path, `ki/backpacks/${retiredSlot}`))).toBe('demo-agent-backpack')
    })

    test('reinstalls a backpack found under its retired slot into its backpack slot', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        'source-revision/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      const url = `https://codeload.github.com/${backpackSlot}/tar.gz/0123456789abcdef`
      await box.config.write(
        'ki/config.toml',
        `# Managed elsewhere.\n[harnesses]\nids = ["${retiredSlot}"]\n\n[[harnesses.releases]]\nid = "${backpackSlot}"\nurl = "${url}"\nsha256 = "${sha256}"\n`
      )
      box.setFetcher(async () => new Response(payload))
      await box.setupExampleBackpack({ identifier: retiredSlot })
      await box.data.write(`ki/backpacks/${retiredSlot}/skills/ki-example/stale.md`, 'stale\n')

      const reinstalled = await box.run(`ki backpack reinstall ${retiredSlot}`)

      expect(reinstalled.exitCode).toBe(0)
      expect(reinstalled.stdout).toBe(`reinstalled ${backpackSlot}\tarchive ${sha256}\n`)
      expect(reinstalled.stderr).toContain('ki configuration uses the retired [harnesses] table')
      expect(await box.data.isSymlink(`ki/backpacks/${backpackSlot}`)).toBe(false)
      expect(await readlink(join(box.data.path, `ki/backpacks/${retiredSlot}`))).toBe('demo-agent-backpack')
      await expect(
        lstat(join(box.data.path, `ki/backpacks/${backpackSlot}/skills/ki-example/stale.md`))
      ).rejects.toThrow()
    })
  })

  describe('command', () => {
    test('answers ki harness as ki backpack with a one-line deprecation warning', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()

      const current = await box.run('ki backpack list')
      const retired = await box.run('ki harness list')

      expect(retired.exitCode).toBe(0)
      expect(retired.stdout).toBe(current.stdout)
      expect(retired.stderr).toBe(
        'ki: warning: ki harness is deprecated and will be removed in the next release; use ki backpack\n'
      )
      expect((await box.run('ki --help')).stdout).not.toContain('harness')
    })
  })

  describe('repository declaration', () => {
    const prepared = async (key: string): Promise<Sandbox> => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.setupExampleBackpack({ name: 'ki-repo' })
      await box.setupExampleBackpack()
      await box.project.write('.ki.toml', repositoryDeclaration(key))
      return box
    }

    test('reads the retired [repo] harnesses key once per command, with a warning', async () => {
      const box = await prepared('harnesses')

      const diagnosed = await box.run('ki repo diag')

      expect(diagnosed.stderr.match(/retired \[repo\] key harnesses/g)).toEqual([expect.any(String)])
      expect(diagnosed.stderr).toContain(
        `ki: warning: ${await realpath(box.project.path)}/.ki.toml uses the retired [repo] key harnesses; rename it to backpacks, or run ki repo repair\n`
      )
    })

    test('refuses a declaration that has both the backpacks key and the retired harnesses key', async () => {
      const box = await prepared('backpacks')
      await box.project.write(
        '.ki.toml',
        repositoryDeclaration('backpacks').replace('[repo]\n', `[repo]\nharnesses = ["${canonical}"]\n`)
      )

      const diagnosed = await box.run('ki repo repair')

      expect(diagnosed.exitCode).toBe(1)
      expect(diagnosed.output).toContain(
        '.ki.toml [repo] must declare backpacks only; remove its retired harnesses key'
      )
    })

    test('repair previews and then renames the retired key, keeping the rest of the line', async () => {
      const box = await prepared('harnesses')
      const declaration = `${await realpath(box.project.path)}/.ki.toml`

      const preview = await box.run('ki repo repair --dry-run')
      const unchanged = await box.project.read('.ki.toml')
      const repaired = await box.run('ki repo repair')

      expect(preview.output).toContain(`would rename [repo] harnesses to backpacks in ${declaration}`)
      expect(preview.stderr).toContain('uses the retired [repo] key harnesses')
      expect(unchanged).toBe(repositoryDeclaration('harnesses'))
      expect(repaired.exitCode).toBe(0)
      expect(repaired.output).toContain(`rename [repo] harnesses to backpacks in ${declaration}`)
      expect(repaired.stderr).toBe('')
      expect(await box.project.read('.ki.toml')).toBe(repositoryDeclaration('backpacks'))
    })

    test('asks for a hand edit when the retired key is not spelt in a [repo] table', async () => {
      const box = await prepared('backpacks')
      const dotted = repositoryDeclaration('backpacks').replace(
        `[repo]\nbackpacks = ["${canonical}"] # the canonical backpack\n`,
        `repo.harnesses = ["${canonical}"]\n`
      )
      await box.project.write('.ki.toml', dotted)

      const repaired = await box.run('ki repo repair')

      expect(repaired.output).toContain(
        `Declaration: rename [repo] harnesses to backpacks in ${await realpath(box.project.path)}/.ki.toml by hand`
      )
      expect(await box.project.read('.ki.toml')).toBe(dotted)
    })

    test('leaves a declaration that does not parse to the declaration reader', async () => {
      const box = await prepared('backpacks')
      await box.project.write('.ki.toml', '[repo\n')

      const repaired = await box.run('ki repo repair')

      expect(repaired.exitCode).toBe(1)
      expect(repaired.output).not.toContain('rename [repo]')
    })
  })

  describe('user configuration', () => {
    test('reads the retired [harnesses] table with a warning and refuses a file that has both', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      const current = await box.config.read('ki/config.toml')
      const retired = current.replace('[backpacks]', '[harnesses]')
      await box.config.write('ki/config.toml', retired)

      const diagnosed = await box.run('ki diag --full')
      const listed = await box.run('ki backpack info knowledgeislands/ki-agent-backpack')
      await box.config.write('ki/config.toml', `${current}\n[harnesses]\nids = []\n`)
      const both = await box.run('ki diag --full')
      const installBoth = await box.run('ki backpack install example/backpack')

      expect(diagnosed.output).toContain('configuration uses the retired [harnesses] table; rename it to [backpacks]')
      expect(listed.exitCode).toBe(0)
      expect(both.output).toContain('configuration must declare [backpacks] only; remove its retired [harnesses] table')
      expect(installBoth.exitCode).toBe(1)
      expect(installBoth.output).toContain(
        'ki configuration must declare [backpacks] only; remove its retired [harnesses] table'
      )
    })

    test('leaves a retired [harnesses] table that already holds every value, and renames it on a write', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      const retired = (await box.config.read('ki/config.toml')).replace('[backpacks]', '[harnesses]')
      await box.config.write('ki/config.toml', retired)

      await box.run('ki bootstrap')
      const untouched = await box.config.read('ki/config.toml')
      await box.config.write('ki/config.toml', retired.replace(/\[skills\.ki-bootstrap\]\nbackpack = "[^"]+"\n/, ''))
      const rewritten = await box.run('ki bootstrap')

      expect(untouched).toBe(retired)
      expect(rewritten.exitCode).toBe(0)
      const configuration = await box.config.read('ki/config.toml')
      expect(configuration).toContain('[backpacks]')
      expect(configuration).not.toContain('harnesses')
    })

    test('records an install in [backpacks], renaming every retired [harnesses] header and keeping releases', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        'source-revision/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      const url = `https://codeload.github.com/${backpackSlot}/tar.gz/0123456789abcdef`
      await box.config.write(
        'ki/config.toml',
        `schema = 1\n[ harnesses ]\nids = []\n\n[[harnesses.releases]]\nid = "${backpackSlot}"\nurl = "${url}"\nsha256 = "${sha256}"\n`
      )
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run(`ki backpack install ${backpackSlot}`)

      expect(installed.exitCode).toBe(0)
      expect(await box.config.read('ki/config.toml')).toBe(
        `schema = 1\n[ backpacks ]\nids = ["${backpackSlot}"]\n\n[[backpacks.releases]]\nid = "${backpackSlot}"\nurl = "${url}"\nsha256 = "${sha256}"\n`
      )
    })

    test('lays out afresh a retired harnesses table spelt as an inline root key, keeping its releases', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      const url = `https://codeload.github.com/${backpackSlot}/tar.gz/0123456789abcdef`
      const release = `{ id = "${backpackSlot}", url = "${url}", sha256 = "${'a'.repeat(64)}" }`
      await box.config.write(
        'ki/config.toml',
        `"harnesses" = { ids = [], releases = [${release}] }\n\n[agents]\nids = []\n`
      )

      const bootstrapped = await box.run('ki bootstrap')
      const configuration = await box.config.read('ki/config.toml')

      expect(bootstrapped.exitCode).toBe(0)
      expect(configuration).not.toContain('harnesses')
      expect(configuration).toContain(`[[backpacks.releases]]\nid = "${backpackSlot}"`)
    })
  })

  describe('links', () => {
    test('ki repair re-points user skill links still spelt through the retired folder', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      const skills = join(box.home.path, '.claude/skills')
      const relinked = await retireDataFolder(box, [skills])

      const diagnosed = await box.run('ki repair --dry-run')
      const repaired = await box.run('ki repair --apply')
      const again = await box.run('ki repair --dry-run')

      expect(diagnosed.output).toContain(`would link ${relinked[0]} -> `)
      expect(repaired.exitCode).toBe(0)
      for (const link of relinked) expect(await readlink(link)).toContain('/ki/backpacks/')
      expect(again.output).not.toContain('would link')
    })

    test('ki repo repair re-points repository skill links still spelt through a retired path', async () => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.setupExampleBackpack({ name: 'ki-repo' })
      await box.setupExampleBackpack()
      await box.project.write('.ki.toml', repositoryDeclaration('backpacks'))
      await box.run('ki repo repair')
      const projection = join(await realpath(box.project.path), '.agents/skills/ki-example')
      await retireDataFolder(box, [join(box.project.path, '.agents/skills')])

      const diagnosed = await box.run('ki repo repair --dry-run')
      const repaired = await box.run('ki repo repair')
      const again = await box.run('ki repo repair --dry-run')

      expect(diagnosed.output).toContain(`would link ${projection} -> `)
      expect(repaired.exitCode).toBe(0)
      expect(await readlink(projection)).toBe(
        await realpath(join(box.data.path, `ki/backpacks/${canonical}/skills/ki-example`))
      )
      expect(again.output).not.toContain('would link')
    })

    test('keeps a development link whose checkout still carries a retired name', async () => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.setupExampleBackpack({ name: 'ki-repo' })
      await box.setupExampleBackpack()
      await box.project.write('.ki.toml', repositoryDeclaration('backpacks'))
      const checkout = join(await box.root.mkdir('checkouts'), 'ki-agentic-harness')
      await rename(join(box.data.path, `ki/backpacks/${canonical}`), checkout)
      await symlink(checkout, join(box.data.path, `ki/backpacks/${canonical}`), 'dir')
      await box.run('ki repo repair')

      const again = await box.run('ki repo repair --dry-run')

      expect(await readlink(join(box.project.path, '.agents/skills/ki-example'))).toContain('/ki-agentic-harness/')
      expect(again.output).not.toContain('would link')
    })
  })

  describe('install records', () => {
    test('reads an interrupted install recorded by ki 0.16 under the retired folder', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      const id = '22222222-2222-4222-8222-222222222222'
      await rename(join(box.data.path, 'ki/backpacks'), join(box.data.path, 'ki/harnesses'))
      const data = await realpath(box.data.path)
      const staging = `${data}/ki/harnesses/knowledgeislands/.install-${id}`
      await box.data.mkdir(`ki/harnesses/knowledgeislands/.install-${id}`)
      await box.state.mkdir('ki/managed-artifacts/locks')
      const lock = `${box.state.path}/ki/managed-artifacts/locks/${id}`
      await writeFile(
        `${box.state.path}/ki/managed-artifacts/${id}.toml`,
        [
          'schema = 1',
          `id = "${id}"`,
          'operation = "harness-install"',
          'state = "creating"',
          `paths = [${JSON.stringify(staging)}]`,
          `lock = ${JSON.stringify(lock)}`,
          ''
        ].join('\n')
      )

      const cleanup = await box.run('ki cleanup')

      expect(cleanup.output).toContain(`artifact ${id}`)
      expect(cleanup.output).not.toContain('foreign')
      expect(cleanup.output).not.toContain('operation is not supported')
    })
  })
})
