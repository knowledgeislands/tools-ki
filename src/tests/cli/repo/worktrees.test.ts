import { symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runCommand, sandbox } from '../_cli_helper.ts'

const names = ['ki-repo', 'ki-authoring', 'ki-repo-tools', 'ki-guides', 'ki-specs', 'ki-binding', 'ki-git', 'ki-work']
const rubric = `export default {
  contract: 1, name: 'ki-repo', concern: 'worktree inheritance',
  families: [{ code: 'RUNTIMES', title: 'Runtime activation', description: 'All eight activation checks.', standard: 'standard.md', selectContext: (states) => states,
    items: [{ code: 'RUNTIMES-2', title: 'Eight runtime skills', description: 'Every declared skill remains checked.', sources: ['standard.md'], mechanical: { level: 'FAIL', remediation: { class: 'diagnostic', guidance: 'Activate the missing skill.' }, audit: { phase: 'INSPECT', run: (states) => states.length === 8 && states.every((state) => state.status === 'active') ? [{ status: 'PASS', message: 'all eight active' }] : [{ status: 'VIOLATION', message: states.map((state) => state.message).join('; ') }] } } }]
  }],
  createSession: async ({ repositorySkills }) => ({ subjects: [{ families: ['RUNTIMES'], context: async () => repositorySkills.inspect(${JSON.stringify(names)}) }], proposal: () => ({ writes: [] }) })
}`

const fixture = async (name: string) => {
  const box = await sandbox()
  for (const skill of names)
    await box.setupExampleHarness({
      name: skill,
      rubric:
        skill === 'ki-repo'
          ? rubric
          : `export default { contract: 1, name: '${skill}', concern: 'fixture', families: [], createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }) }`
    })
  await box.home.mkdir('.agents')
  await box.config.write(
    'ki/config.toml',
    'schema = 1\n[agents]\nids = ["chatgpt-codex"]\n[harnesses]\nids = ["example/harness"]\n[skills]\n'
  )
  const declaration = `[repo]\nharnesses = ["example/harness"]\n[skills.ki-repo-project]\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/knowledgeislands/${name}"\nsupported_runtimes = ["chatgpt-codex"]\n${names
    .filter((skill) => skill !== 'ki-repo')
    .map((skill) => `[skills.${skill}]`)
    .join('\n')}\n`
  await box.project.write('.ki.toml', declaration)
  await box.project.git(['init', '-q', '-b', 'main'])
  await box.project.git(['add', '.ki.toml'])
  await box.project.git(['commit', '-q', '-m', 'base'])
  await box.project.git(['worktree', 'add', '-q', '-b', 'work', '../linked'])
  await box.project.mkdir('.agents/skills')
  for (const skill of names)
    await symlink(
      join(box.data.path, 'ki/harnesses/example/harness/skills', skill),
      join(box.project.path, '.agents/skills', skill)
    )
  const registered = await box.run('ki registry add --repo .')
  expect(registered.exitCode, registered.output).toBe(0)
  return { box, declaration }
}

test.each(['tools-ki', 'tools-rig'])(
  'inherits registration and all eight runtime checks in a fresh %s worktree',
  async (name) => {
    const { box } = await fixture(name)
    const primary = await box.run('ki repo audit', { runner: 'default' })
    expect(primary.exitCode, primary.output).toBe(0)
    box.cd('../linked')
    const linked = await box.run('ki repo audit', { runner: 'default' })
    expect(linked.exitCode, linked.output).toBe(0)
    expect(linked.output).not.toContain('REPO-REG-1')
    for (const skill of names) {
      const path = join(box.project.path, '.agents/skills', skill)
      await unlink(path)
      const missing = await box.run('ki repo audit', { runner: 'default' })
      expect(missing.exitCode, skill).toBe(1)
      expect(missing.output).toContain('RUNTIMES-2')
      expect(missing.output).toContain(`${skill} is not active`)
      await symlink(join(box.data.path, 'ki/harnesses/example/harness/skills', skill), path)
    }
  }
)

test('refuses registration and runtime inheritance from an unrelated checkout or changed identity', async () => {
  const { box, declaration } = await fixture('tools-ki')
  await box.root.write('unrelated/.ki.toml', declaration)
  await box.root.git(['init', '-q'], 'unrelated')
  box.cd('../unrelated')
  const unrelated = await box.run('ki repo audit', { runner: 'default' })
  expect(unrelated.exitCode).toBe(1)
  expect(unrelated.output).toContain('REPO-REG-1')
  expect(unrelated.output).toContain('RUNTIMES-2')
  await box.root.write('linked/.ki.toml', declaration.replace('knowledgeislands/tools-ki', 'knowledgeislands/foreign'))
  box.cd('../linked')
  const foreign = await box.run('ki repo audit', { runner: 'default' })
  expect(foreign.exitCode).toBe(1)
  expect(foreign.output).toContain('REPO-REG-1')
  expect(foreign.output).toContain('RUNTIMES-2')
})

test('keeps an unsafe worktree activation blocking even when the primary activation is valid', async () => {
  const { box } = await fixture('tools-rig')
  await box.root.mkdir('linked/.agents/skills')
  await symlink(
    join(box.data.path, 'ki/harnesses/example/harness/skills/ki-specs'),
    join(box.root.path, 'linked/.agents/skills/ki-guides')
  )
  box.cd('../linked')
  const result = await box.run('ki repo audit', { runner: 'default' })
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('ki-guides has an unsafe')
  expect(result.output).not.toContain('REPO-REG-1')
})

test.each(['discovery', 'common', 'listing', 'membership'])(
  'fails closed when Git %s cannot prove the common repository',
  async (failure) => {
    const { box } = await fixture('tools-ki')
    box.cd('../linked')
    box.setRunner(async (command, args, environment) => {
      if (
        command === 'git' &&
        ((failure === 'discovery' && args.includes('--show-toplevel')) ||
          (failure === 'common' && args.includes('--git-common-dir')) ||
          (failure === 'listing' && args.includes('--porcelain')))
      )
        return { exitCode: 1, output: 'fixture Git failure' }
      if (command === 'git' && failure === 'membership' && args.includes('--porcelain'))
        return { exitCode: 0, output: '' }
      return runCommand(command, args, environment)
    })
    const result = await box.run('ki repo audit')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('REPO-REG-1')
    expect(result.output).toContain('RUNTIMES-2')
  }
)

test.each(['missing', 'foreign'])(
  'refuses inheritance when the registered primary declaration is %s',
  async (state) => {
    const { box, declaration } = await fixture('tools-rig')
    if (state === 'missing') await unlink(join(box.project.path, '.ki.toml'))
    else
      await box.project.write('.ki.toml', declaration.replace('knowledgeislands/tools-rig', 'knowledgeislands/foreign'))
    box.cd('../linked')
    const result = await box.run('ki repo audit', { runner: 'default' })
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('REPO-REG-1')
    expect(result.output).toContain('RUNTIMES-2')
  }
)
