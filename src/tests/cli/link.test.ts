import { describe, expect, test } from 'vitest'
import { runCommand, type Sandbox, sandbox } from './_cli_helper.ts'

const harnesses = '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n'
const declaration = (code: string): string =>
  `${harnesses}\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepo_code = "${code}"\n\n[skills.ki-repo-project]\n`

/** A registry of six repositories: a scoped Git repository with a live and a pruned record, others for the fallbacks. */
const setupRegistry = async (box: Sandbox): Promise<void> => {
  box.setRunner(runCommand)
  await box.root.write('tools/.ki.toml', declaration('KI-TOOL'))
  await box.root.write('tools/docs/roadmap/_ISSUES.md', '---\nareas: { CLI: 3, OPS: 1 }\n---\n\n# Ledger\n')
  await box.root.write('tools/docs/roadmap/KI-TOOL-CLI-1-live.md', '# 1\n')
  await box.root.write('tools/docs/roadmap/KI-TOOL-CLI-2-gone.md', '# 2\n')
  await box.root.git(['init', '-q'], 'tools')
  await box.root.git(['add', '--all'], 'tools')
  await box.root.git(['commit', '-q', '-m', 'records'], 'tools')
  await box.root.git(['rm', '-q', 'docs/roadmap/KI-TOOL-CLI-2-gone.md'], 'tools')
  await box.root.git(['commit', '-q', '-m', 'prune'], 'tools')
  await box.root.write('island/Streams/Roadmap/KI-ISLAND-GOV-7-thing.md', '# 7\n')
  await box.root.write('plain/.ki.toml', harnesses)
  await box.root.write('loose/.ki.toml', declaration('KI-LOOSE'))
  await box.root.write('loose/Streams/Roadmap/_ISSUES.md', '---\nareas: { GOV: 4 }\n---\n')
  await box.root.write('bare/.ki.toml', declaration('KI-BARE'))
  await box.root.write('flat/.ki.toml', declaration('KI-FLAT'))
  await box.root.write('flat/docs/roadmap/_ISSUES.md', '# Ledger without front matter\n')
  const repositories = ['tools', 'island', 'plain', 'loose', 'bare', 'flat']
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      ...repositories.flatMap((name) => [
        '',
        `[repositories."${name}"]`,
        `repository = "https://github.com/knowledgeislands/${name}"`,
        `path = ${JSON.stringify(`${box.root.path}/${name}`)}`
      ]),
      ''
    ].join('\n')
  )
}

describe('ki link', () => {
  test('prints a live record by absolute path and a pruned one at its last revision', async () => {
    const box = await sandbox()
    await setupRegistry(box)
    const parent = await box.root.git(['rev-parse', 'HEAD^'], 'tools')
    const result = await box.run('ki link KI-TOOL-CLI-1 KI-TOOL-CLI-2 KI-ISLAND-GOV-7')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        `[KI-TOOL-CLI-1](${box.root.path}/tools/docs/roadmap/KI-TOOL-CLI-1-live.md)`,
        `[KI-TOOL-CLI-2 (pruned)](https://github.com/knowledgeislands/tools/blob/${parent}/docs/roadmap/KI-TOOL-CLI-2-gone.md)`,
        `[KI-ISLAND-GOV-7](${box.root.path}/island/Streams/Roadmap/KI-ISLAND-GOV-7-thing.md)`,
        ''
      ].join('\n')
    )
  })

  test('prints every link it can and refuses, with each reason, any identifier that resolves to nothing', async () => {
    const box = await sandbox()
    await setupRegistry(box)
    const result = await box.run(
      'ki link KI-TOOL-CLI-1 KI-TOOL-CLI-3 KI-TOOL-CLI-9 KI-TOOL-ENV-1 KI-LOOSE-GOV-2 KI-BARE-OPS-1 KI-FLAT-OPS-1 KI-NOWHERE-XYZ-1 not-an-id'
    )
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe(`[KI-TOOL-CLI-1](${box.root.path}/tools/docs/roadmap/KI-TOOL-CLI-1-live.md)\n`)
    expect(result.stderr).toBe(
      `ki: error: ${[
        'KI-TOOL-CLI-3 has no record in tools and no commit there deleted one',
        'KI-TOOL-CLI-9 has not been issued in tools',
        'KI-TOOL-ENV-1 has not been issued in tools',
        'KI-LOOSE-GOV-2 has no record in loose and no commit there deleted one',
        'KI-BARE-OPS-1 has not been issued in bare',
        'KI-FLAT-OPS-1 has not been issued in flat',
        'no registered repository issues KI-NOWHERE-XYZ-1',
        'not-an-id is not a work-record identifier'
      ].join('; ')}\n`
    )
  })
})
