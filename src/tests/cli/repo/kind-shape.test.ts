import { expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const declaration = (fields: string, skills: readonly string[] = []): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n${fields}\n${skills.map((skill) => `\n[skills.${skill}]\n`).join('')}`

test.each([
  'ki-repo-project',
  'ki-repo-dotfiles-chezmoi',
  'ki-repo-harness',
  'ki-repo-homebrew-tap',
  'ki-repo-mcp',
  'ki-repo-specifications',
  'ki-repo-tools',
  'ki-repo-website'
])('registers an explicit Project primary shape: %s', async (shape) => {
  const box = await sandbox()
  await box.project.write('.ki.toml', declaration(`repo_type = "project"\nprimary_shape = "${shape}"`, [shape]))

  expect((await box.run('ki registry add')).exitCode).toBe(0)
  expect(await box.state.read('ki/registry.toml')).toContain('https://github.com/example/project')
})

test('allows an explicitly selected baseline alongside composable specialist shapes', async () => {
  const box = await sandbox()
  await box.project.write(
    '.ki.toml',
    declaration('repo_type = "project"\nprimary_shape = "ki-repo-project"', [
      'ki-repo-project',
      'ki-repo-mcp',
      'ki-repo-tools'
    ])
  )
  expect((await box.run('ki registry add')).exitCode).toBe(0)
})

test('requires the KB baseline shape even when a KB substructure is declared', async () => {
  const box = await sandbox()
  await box.project.write(
    '.ki.toml',
    declaration('repo_type = "kb"\nprimary_shape = "ki-repo-kb"\nstore_roles = ["notes"]', [
      'ki-repo-kb',
      'ki-repo-kb-principal'
    ])
  )
  expect((await box.run('ki repo store list')).exitCode).toBe(0)
})

test.each([
  ['', [], 'repo_type is required'],
  ['primary_shape = "ki-repo-project"', ['ki-repo-project'], 'repo_type is required'],
  ['repo_type = "ordinary"', [], 'repo_type is required'],
  ['repo_type = 42', [], 'repo_type is required'],
  ['repo_type = "project"', ['ki-repo-tools'], 'primary_shape is required'],
  ['repo_type = "kb"', ['ki-repo-kb'], 'primary_shape is required'],
  ['repo_type = "project"\nprimary_shape = 42', ['ki-repo-project'], 'primary_shape is required'],
  ['repo_type = "project"\nprimary_shape = "tools"', ['ki-repo-tools'], 'primary_shape is required'],
  ['repo_type = "project"\nprimary_shape = "ki-engineering"', ['ki-engineering'], 'primary_shape is required'],
  [
    'repo_type = "project"\nprimary_shape = "ki-repo-website-app"',
    ['ki-repo-website-app'],
    'primary_shape is required'
  ],
  ['repo_type = "project"\nprimary_shape = "ki-repo-kb"', ['ki-repo-kb'], 'primary_shape is required'],
  ['repo_type = "kb"\nprimary_shape = "ki-repo-tools"', ['ki-repo-tools'], 'primary_shape is required'],
  ['repo_type = "kb"\nprimary_shape = "ki-repo-kb-principal"', ['ki-repo-kb-principal'], 'primary_shape is required'],
  ['repo_type = "project"\nprimary_shape = "ki-repo-mcp"', ['ki-repo-tools'], 'must name a declared skill'],
  ['repo_type = "kb"\nprimary_shape = "ki-repo-kb"', [], 'must name a declared skill']
] as const)('rejects invalid kind/shape declarations before registration: %s', async (fields, skills, message) => {
  const box = await sandbox()
  await box.project.write('.ki.toml', declaration(fields, skills))

  const result = await box.run('ki registry add')

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain(message)
  await expect(box.state.read('ki/registry.toml')).rejects.toThrow()
})

test.each(['repo_type = "project"', 'primary_shape = "ki-repo-project"'])(
  'rejects kind/shape declarations in another skill: %s',
  async (field) => {
    const box = await sandbox()
    await box.project.write(
      '.ki.toml',
      declaration('repo_type = "project"\nprimary_shape = "ki-repo-project"', ['ki-repo-project']) + field + '\n'
    )
    const result = await box.run('ki registry add')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('belong only in [skills.ki-repo]')
  }
)

test('refuses to remove the selected primary shape before changing declarations or agent projections', async () => {
  const box = await sandbox()
  const configuration = declaration('repo_type = "project"\nprimary_shape = "ki-repo-project"', ['ki-repo-project'])
  await box.project.write('.ki.toml', configuration)
  await box.project.write('.agents/skills/ki-repo-project/SKILL.md', 'retained skill\n')

  const result = await box.run('ki repo skill remove ki-repo-project')

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain('cannot remove primary shape ki-repo-project')
  expect(await box.project.read('.ki.toml')).toBe(configuration)
  expect(await box.project.read('.agents/skills/ki-repo-project/SKILL.md')).toBe('retained skill\n')
})
