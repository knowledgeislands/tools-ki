import { lstat, realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const metadata = (repoCode: string, title: string, description: string): string =>
  `["knowledgeislands/ki-agentic-harness:ki-repo"]\ntitle = "${title}"\ndescription = "${description}"\nrepo_code = "${repoCode}"\n`

const workspace = (members: string, options: { readonly name?: string; readonly extra?: string } = {}): string => {
  const name = options.name ?? 'default'
  return `schema = 2\ndefault = "${name}"\n\n[groups.${name}]\nmembers = [${members}]\n${options.extra ?? ''}`
}

const member = (type: 'repository' | 'workspace', path: string): string => `{ type = "${type}", path = "${path}" }`

describe('[ki workspace]', () => {
  test('retains the empty init flow and manages typed repository members', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('repo/.ki-config.toml', metadata('REPO', 'Repository', 'Managed repository.'))

    const initialised = await box.run('ki workspace init')
    const added = await box.run('ki workspace add default repo')
    const listed = await box.run('ki workspace list')
    const shown = await box.run('ki workspace show default')
    const removed = await box.run('ki workspace remove default repo')

    expect(initialised).toEqual({
      exitCode: 0,
      output: `ki workspace init: created ${root}/.ki-workspace.toml\n`
    })
    expect(added).toEqual({ exitCode: 0, output: 'ki workspace add: added repo to default\n' })
    expect(listed).toEqual({
      exitCode: 0,
      output: 'ki workspace list\n' + '  default (default): 1 local, 1 effective\n' + '    repo [direct] REPO — Repository — Managed repository.\n'
    })
    expect(shown).toEqual({
      exitCode: 0,
      output: 'ki workspace show default\n  repository repo\n'
    })
    expect(removed).toEqual({ exitCode: 0, output: 'ki workspace remove: removed repo from default\n' })
    expect(await box.project.read('.ki-workspace.toml')).toBe('schema = 2\ndefault = "default"\n\n[groups.default]\nmembers = []\n')
  })

  test('registers a deterministic physical hierarchy, preserves custom groups, and stops at repository leaves', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-workspace.toml',
      workspace(member('repository', 'stale'), {
        name: 'all',
        extra: `\n[groups.release]\nmembers = [${member('repository', 'direct')}]\n`
      })
    )
    await box.project.write('direct/.ki-config.toml', metadata('DIRECT', 'Direct', 'Direct leaf.'))
    await box.project.mkdir('direct/inside')
    await box.project.write('nested/.ki-workspace.toml', workspace('', { extra: '\n[groups.keep]\nmembers = []\n' }))
    await box.project.write('nested/repo/.ki-config.toml', metadata('NESTED', 'Nested', 'Nested leaf.'))
    await box.project.mkdir('empty')
    await box.project.mkdir('.git/objects/pack')
    await box.root.write('outside/.ki-config.toml', metadata('OUTSIDE', 'Outside', 'Ignored symlink target.'))
    await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)

    const result = await box.run('ki workspace register')
    const listed = await box.run('ki workspace list')

    expect(result).toEqual({
      exitCode: 0,
      output: 'ki workspace register: registered 2 repositories across 3 workspaces\n'
    })
    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain('  all (default): 3 local, 2 effective')
    expect(listed.output).toContain('  release: 1 local, 1 effective')
    expect(await box.project.read('.ki-workspace.toml')).toBe(
      'schema = 2\n' +
        'default = "all"\n' +
        '\n' +
        '[groups.all]\n' +
        `members = [${member('repository', 'direct')}, ${member('workspace', 'empty')}, ${member('workspace', 'nested')}]\n` +
        '\n' +
        '[groups.release]\n' +
        `members = [${member('repository', 'direct')}]\n`
    )
    expect(await box.project.read('nested/.ki-workspace.toml')).toBe(
      'schema = 2\n' +
        'default = "default"\n' +
        '\n' +
        '[groups.default]\n' +
        `members = [${member('repository', 'repo')}]\n` +
        '\n' +
        '[groups.keep]\n' +
        'members = []\n'
    )
    expect(await box.project.read('empty/.ki-workspace.toml')).toBe('schema = 2\ndefault = "default"\n\n[groups.default]\nmembers = []\n')
    await expect(lstat(`${box.project.path}/direct/.ki-workspace.toml`)).rejects.toThrow()
    await expect(lstat(`${box.project.path}/direct/inside/.ki-workspace.toml`)).rejects.toThrow()
    await expect(lstat(`${box.project.path}/.git/.ki-workspace.toml`)).rejects.toThrow()
    await expect(lstat(`${box.project.path}/.git/objects/.ki-workspace.toml`)).rejects.toThrow()
  })

  test('preflights every container configuration before writing any refresh', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const original = workspace(member('repository', 'stale'))
    await box.project.write('.ki-workspace.toml', original)
    await box.project.mkdir('a')
    await box.project.write('b/.ki-workspace.toml', 'schema = 2\ndefault = "default"\n')

    const result = await box.run('ki workspace register')

    expect(result.exitCode).toBe(2)
    expect(result.output).toBe(`ki: error: ${root}/b/.ki-workspace.toml must declare named groups\n`)
    expect(await box.project.read('.ki-workspace.toml')).toBe(original)
    await expect(lstat(`${box.project.path}/a/.ki-workspace.toml`)).rejects.toThrow()
  })

  test('lists and resolves nested defaults with deterministic paths, origins, and repository metadata', async () => {
    const box = await sandbox()
    await box.project.write('.ki-workspace.toml', workspace(`${member('workspace', 'platform')}, ${member('repository', 'z-repo')}`))
    await box.project.write('platform/.ki-workspace.toml', workspace(`${member('repository', 'a-repo')}, ${member('repository', 'b-repo')}`))
    await box.project.write('platform/a-repo/.ki-config.toml', metadata('A', 'Alpha', 'First repository.'))
    await box.project.write('platform/b-repo/.ki-config.toml', metadata('B', 'Beta', 'Second repository.'))
    await box.project.write('z-repo/.ki-config.toml', metadata('Z', 'Zulu', 'Direct repository.'))
    const alpha = await realpath(`${box.project.path}/platform/a-repo`)
    const beta = await realpath(`${box.project.path}/platform/b-repo`)
    const zulu = await realpath(`${box.project.path}/z-repo`)

    const listed = await box.run('ki workspace list')
    const operation = await box.run('ki repo diag')

    expect(listed).toEqual({
      exitCode: 0,
      output:
        'ki workspace list\n' +
        '  default (default): 2 local, 3 effective\n' +
        '    platform/a-repo [nested] A — Alpha — First repository.\n' +
        '    platform/b-repo [nested] B — Beta — Second repository.\n' +
        '    z-repo [direct] Z — Zulu — Direct repository.\n'
    })
    expect(operation.exitCode).toBe(0)
    expect(operation.output.indexOf(`Repository: ${alpha}`)).toBeLessThan(operation.output.indexOf(`Repository: ${beta}`))
    expect(operation.output.indexOf(`Repository: ${beta}`)).toBeLessThan(operation.output.indexOf(`Repository: ${zulu}`))
    expect(operation.output.match(/Source: current working directory/g)).toHaveLength(3)
  })

  test('refuses nested workspace cycles and duplicate repository leaves before an operation starts', async () => {
    const cycleBox = await sandbox()
    await cycleBox.project.write('.ki-workspace.toml', workspace(member('workspace', 'nested')))
    await cycleBox.project.write('nested/.ki-workspace.toml', workspace(member('workspace', '..')))
    const cycle = await cycleBox.run('ki repo diag')

    const duplicateBox = await sandbox()
    await duplicateBox.project.write('.ki-workspace.toml', workspace(`${member('repository', 'repo')}, ${member('workspace', 'nested')}`))
    await duplicateBox.project.write('nested/.ki-workspace.toml', workspace(member('repository', '../repo')))
    await duplicateBox.project.write('repo/.ki-config.toml', metadata('REPO', 'Repository', 'Duplicate target.'))
    const duplicate = await duplicateBox.run('ki repo diag')

    expect(cycle).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default has cycle . -> nested -> .\n'
    })
    expect(duplicate).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default selects duplicate repository repo\n'
    })
  })

  test('rejects malformed, escaping, and symbolic-link members deterministically', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('.ki-workspace.toml', workspace('{ type = "unknown", path = "repo" }'))
    const unsupported = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', workspace(member('repository', '../outside')))
    const escaping = await box.run('ki repo diag')
    await box.root.write('outside/.ki-config.toml', metadata('OUT', 'Outside', 'Outside repository.'))
    await symlink(`${box.root.path}/outside`, `${box.project.path}/linked`)
    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'linked')))
    const linked = await box.run('ki repo diag')
    await box.project.write('.ki-workspace.toml', workspace(member('repository', '.')))
    const selectingRoot = await box.run('ki repo diag')

    expect(unsupported).toEqual({
      exitCode: 2,
      output: `ki: error: ${root}/.ki-workspace.toml group default member has unsupported type\n`
    })
    expect(escaping).toEqual({
      exitCode: 2,
      output: `ki: error: workspace group default repository ../outside escapes workspace ${root}\n`
    })
    expect(linked).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default repository linked must be an existing physical directory\n'
    })
    expect(selectingRoot).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default repository . must contain a regular .ki-config.toml\n'
    })
  })

  test('diagnoses missing and malformed repository metadata during effective listing', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'repo')))
    await box.project.write('repo/.ki-config.toml', '# missing metadata\n')
    const missing = await box.run('ki workspace list')
    await box.project.write(
      'repo/.ki-config.toml',
      '["knowledgeislands/ki-agentic-harness:ki-repo"]\ntitle = "Repository"\ndescription = "Description."\nrepo_code = 1\n'
    )
    const malformed = await box.run('ki workspace list')

    expect(missing).toEqual({
      exitCode: 2,
      output: `ki: error: ${root}/repo/.ki-config.toml must declare [ki-repo] metadata\n`
    })
    expect(malformed).toEqual({
      exitCode: 2,
      output: `ki: error: ${root}/repo/.ki-config.toml [ki-repo].repo_code must be a non-empty string\n`
    })

    const metadataCases = [
      ['not valid = [\n', 'must be valid TOML'],
      ['["knowledgeislands/ki-agentic-harness:ki-repo"]\ndescription = "Description."\nrepo_code = "REPO"\n', '[ki-repo].title must be a non-empty string'],
      ['["knowledgeislands/ki-agentic-harness:ki-repo"]\ntitle = "Repository"\nrepo_code = "REPO"\n', '[ki-repo].description must be a non-empty string']
    ] as const
    for (const [contents, expected] of metadataCases) {
      await box.project.write('repo/.ki-config.toml', contents)
      const result = await box.run('ki workspace list')
      expect(result).toEqual({ exitCode: 2, output: `ki: error: ${root}/repo/.ki-config.toml ${expected}\n` })
    }
  })

  test('rejects incompatible schemas, invalid mutations, and non-regular workspace files', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "default"\n\n[groups.default]\nmembers = []\n')
    const schema = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', workspace(member('workspace', 'nested')))
    const duplicate = await box.run('ki workspace add default repo')
    const removeWorkspace = await box.run('ki workspace remove default nested')
    const invalidPath = await box.run('ki workspace add default /absolute')
    await box.project.write('workspace.toml', workspace(''))
    await box.project.mkdir('nested')
    await symlink(`${box.project.path}/workspace.toml`, `${box.project.path}/nested/.ki-workspace.toml`)
    box.cd('nested')
    const symbolic = await box.run('ki workspace list')

    expect(schema).toEqual({
      exitCode: 2,
      output: `ki: error: ${root}/.ki-workspace.toml schema must equal 2\n`
    })
    expect(duplicate).toEqual({ exitCode: 0, output: 'ki workspace add: added repo to default\n' })
    expect(removeWorkspace).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default does not contain repository nested\n'
    })
    expect(invalidPath).toEqual({
      exitCode: 2,
      output: `ki: error: ${root}/.ki-workspace.toml group default member path /absolute must be relative\n`
    })
    expect(symbolic).toEqual({
      exitCode: 2,
      output: `ki: error: ${root}/nested/.ki-workspace.toml must be a regular file\n`
    })
  })

  test('validates the complete typed workspace document and mutation contract', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const cases = [
      ['not valid = [\n', 'must be valid TOML'],
      ['schema = 2\n', 'must declare a default group'],
      ['schema = 2\ndefault = "default"\n', 'must declare named groups'],
      ['schema = 2\ndefault = "missing"\n\n[groups.default]\nmembers = []\n', 'default group missing is not declared'],
      ['schema = 2\ndefault = "invalid.group"\n\n[groups."invalid.group"]\nmembers = []\n', 'group name invalid.group must use letters'],
      ['schema = 2\ndefault = "default"\n\n[groups]\ndefault = 1\n', 'group default must declare a members array'],
      ['schema = 2\ndefault = "default"\n\n[groups.default]\nmembers = [1]\n', 'group default members must be tables'],
      [workspace('{ type = "repository" }'), 'group default member path must be a non-empty string'],
      [workspace('{ type = "workspace", path = "nested/*" }'), 'workspace member nested/* must not use a pattern']
    ] as const

    const missing = await box.run('ki workspace list')
    expect(missing).toEqual({ exitCode: 2, output: `ki: error: no .ki-workspace.toml in ${root}\n` })
    for (const [contents, expected] of cases) {
      await box.project.write('.ki-workspace.toml', contents)
      const result = await box.run('ki workspace list')
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain(expected)
    }

    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'repo')))
    expect(await box.run('ki workspace show absent')).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group absent is not declared\n'
    })
    expect(await box.run('ki workspace add default repo')).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default already contains repository repo\n'
    })
    expect(await box.run('ki workspace add release repo')).toEqual({
      exitCode: 0,
      output: 'ki workspace add: added repo to release\n'
    })
    expect(await box.run('ki workspace remove absent repo')).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group absent is not declared\n'
    })
    expect(await box.run('ki workspace remove default absent')).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default does not contain repository absent\n'
    })
    expect(await box.run('ki workspace init')).toEqual({
      exitCode: 2,
      output: `ki: error: .ki-workspace.toml already exists in ${root}\n`
    })
  })

  test('expands repository patterns without following symbolic links', async () => {
    const box = await sandbox()
    await box.project.write('repos/a/.ki-config.toml', metadata('A', 'Alpha', 'Alpha repository.'))
    await box.project.write('repos/b/.ki-config.toml', metadata('B', 'Beta', 'Beta repository.'))
    await box.project.write('repos/deep/x1/.ki-config.toml', metadata('X1', 'X one', 'Question match.'))
    await box.project.mkdir('repos/not-a-repository')
    await box.root.write('outside/.ki-config.toml', metadata('OUT', 'Outside', 'Symlink target.'))
    await symlink(`${box.root.path}/outside`, `${box.project.path}/repos/linked`)

    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'repos/?')))
    expect(await box.run('ki repo --repo repos/a --workspace default diag')).toEqual({
      exitCode: 2,
      output: 'ki: error: --repo and --workspace cannot be used together\n'
    })
    const immediate = await box.run('ki repo --workspace default diag')
    expect(immediate.exitCode).toBe(0)
    expect(immediate.output).toContain('Source: workspace group default')
    expect(immediate.output).not.toContain('linked')

    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'repos/**/x?')))
    const recursive = await box.run('ki repo diag')
    expect(recursive.exitCode).toBe(0)
    expect(recursive.output).toContain('/repos/deep/x1')

    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'repos/none*')))
    expect(await box.run('ki repo diag')).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default repository repos/none* matched no repositories\n'
    })

    await box.project.write('.ki-workspace.toml', workspace(member('repository', 'missing')))
    expect(await box.run('ki repo diag')).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group default repository missing must be an existing physical directory\n'
    })

    await box.project.write('.ki-workspace.toml', workspace(member('repository', '*')))
    const nonRepository = await box.run('ki repo diag')
    expect(nonRepository.exitCode).toBe(2)
    expect(nonRepository.output).toContain('must contain a regular .ki-config.toml')
  })

  test('refuses registration at repository leaves and unsafe existing workspace paths', async () => {
    const repositoryBox = await sandbox()
    const repositoryRoot = await realpath(repositoryBox.project.path)
    await repositoryBox.project.write('.ki-config.toml', metadata('ROOT', 'Root', 'Repository root.'))
    expect(await repositoryBox.run('ki workspace register')).toEqual({
      exitCode: 2,
      output: `ki: error: cannot register a workspace inside repository leaf ${repositoryRoot}\n`
    })
    await repositoryBox.project.write('.ki-workspace.toml', workspace(member('repository', '.')))
    const selectingRoot = await repositoryBox.run('ki workspace list')
    expect(selectingRoot.exitCode).toBe(0)
    expect(selectingRoot.output).toContain('    . [direct] ROOT')

    const unsafeBox = await sandbox()
    const unsafeRoot = await realpath(unsafeBox.project.path)
    await unsafeBox.project.write('workspace.toml', workspace(''))
    await symlink(`${unsafeBox.project.path}/workspace.toml`, `${unsafeBox.project.path}/.ki-workspace.toml`)
    expect(await unsafeBox.run('ki workspace register')).toEqual({
      exitCode: 2,
      output: `ki: error: ${unsafeRoot}/.ki-workspace.toml must be a regular file\n`
    })
    expect(await unsafeBox.run('ki repo diag')).toEqual({
      exitCode: 2,
      output: `ki: error: ${unsafeRoot}/.ki-workspace.toml must be a regular file\n`
    })
  })
})
