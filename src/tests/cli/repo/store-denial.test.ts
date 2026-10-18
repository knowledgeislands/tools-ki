import { realpath } from 'node:fs/promises'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const denied = vi.hoisted(() => new Set<string>())

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    lstat: (...arguments_: Parameters<typeof original.lstat>) =>
      denied.has(String(arguments_[0]))
        ? Promise.reject(Object.assign(new Error('operation not permitted'), { code: 'EPERM' }))
        : original.lstat(...arguments_)
  }
})

afterEach(() => denied.clear())

const knowledgeBase = (identity: string, harness = 'example/harness'): string =>
  `[repo]\nharnesses = ["${harness}"]\n\n[skills.ki-repo-kb]\n\n[skills.ki-repo]\nprimary_shape = "ki-repo-kb"\nrepository = ${JSON.stringify(identity)}\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]\n`

const macFix =
  "grant Full Disk Access to the terminal app, or to sshd-keygen-wrapper over SSH, in System Settings > Privacy & Security, or run ki at the Mac's screen"

describe('ki repo store under access denial', () => {
  test('refuses to create a store under a denied OneDrive root and names the macOS grant', async () => {
    const box = await sandbox()
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))
    const oneDrive = await box.home.mkdir('Library/CloudStorage/OneDrive-Personal')
    denied.add(oneDrive)

    const result = await box.run('ki repo store create sources', { platform: 'darwin' })

    expect(result.exitCode).toBe(1)
    expect(result.output).toBe(`ki: error: access denied to ${oneDrive} by macOS privacy protection\nnext: ${macFix}\n`)
  })

  test('reports a denied bound store as unavailable with its fix rather than missing', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))
    await box.state.write(
      'ki/registry.toml',
      `schema = 1\n\n[repositories.project]\nrepository = "https://github.com/example/knowledge"\npath = ${JSON.stringify(root)}\n\n[repositories.project.stores]\nsources = ${JSON.stringify(sources)}\n`
    )
    denied.add(sources)
    const reason = `access denied to ${sources}; give this user read access to the folder`

    const text = await box.run('ki repo store list', { platform: 'linux' })
    const json = await box.run('ki repo store list --format json', { platform: 'linux' })

    expect(text.exitCode).toBe(0)
    expect(text.output).toContain(`! sources: bound ${sources} (unavailable: ${reason})`)
    expect(JSON.parse(json.output).repositories[0].stores[1]).toMatchObject({
      role: 'sources',
      path: sources,
      state: 'bound',
      availability: 'unavailable',
      reason
    })
  })

  test('refuses to bind a denied folder with its fix', async () => {
    const box = await sandbox()
    const sources = await box.root.mkdir('sources')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))
    denied.add(sources)

    expect(await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources], { platform: 'linux' })).toEqual({
      exitCode: 1,
      output: `ki: error: access denied to ${sources}\nnext: give this user read access to the folder\n`
    })
    await expect(box.state.read('ki/registry.toml')).rejects.toThrow()
  })

  test('does not offer a denied conventional folder as the fix', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))
    const candidate = await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-project')
    const offered = await box.run('ki repo store list')
    denied.add(candidate)
    const withheld = await box.run('ki repo store list')

    expect(offered.output).toContain(`store bind sources ${candidate} --write`)
    expect(withheld.exitCode).toBe(0)
    expect(withheld.output).not.toContain(candidate)
    expect(withheld.output).toContain(`fix: ki repo --repo ${root} store bind sources <absolute-path> --write`)
  })

  test('carries the denial and its fix into the repair warning', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.setupExampleHarness({ name: 'ki-repo' })
    await box.setupExampleHarness()
    const root = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    await box.project.write(
      '.ki.toml',
      `${knowledgeBase('https://github.com/example/knowledge', 'knowledgeislands/ki-agentic-harness')}supported_runtimes = ["chatgpt-codex"]\n\n[skills.ki-example]\n`
    )
    await box.state.write(
      'ki/registry.toml',
      `schema = 1\n\n[repositories.project]\nrepository = "https://github.com/example/knowledge"\npath = ${JSON.stringify(root)}\n\n[repositories.project.stores]\nsources = ${JSON.stringify(sources)}\n`
    )
    denied.add(sources)

    const repair = await box.run('ki repo repair', { platform: 'darwin' })

    expect(repair.exitCode).toBe(0)
    expect(repair.output).toContain(
      `! Store: sources store is unavailable on this host (access denied to ${sources} by macOS privacy protection; ${macFix})`
    )
  })
})
