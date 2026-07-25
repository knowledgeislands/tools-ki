import { describe, expect, test } from 'vitest'
import { sandbox } from './_helper.ts'

describe('ki dev', () => {
  describe('dev on', () => {
    test('switches the canonical harness to a local development checkout', async () => {
      const box = await sandbox()
      await box.home.mkdir('.agents')
      await Promise.all(['subagents', 'hooks'].map((payload) => box.root.mkdir(`harness/${payload}`)))
      await box.installBootstrapHarness()
      for (const skill of ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap']) {
        const group = skill === 'ki-bootstrap' ? 'keystone' : 'process'
        await box.root.write(`harness/skills/${group}/${skill}/SKILL.md`, `---\nname: ${skill}\nki-depends-on: []\n---\n`)
      }

      await box.run(['bootstrap'])
      const result = await box.run(['dev', 'on', box.root.resolve('harness')])

      expect(result).toEqual({
        exitCode: 0,
        output: `development harness enabled ${await box.root.realpath('harness')}
refreshed KI configuration: 1 agents, 1 harnesses, 5 skills
ki-bootstrap for chatgpt-codex already installed
ki-delegate for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
`
      })
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(true)
      expect(await box.home.isSymlink('.agents/skills/ki-bootstrap')).toBe(true)
      expect(await box.config.read('ki/config.toml')).toBe(
        `schema = 1

[agents]
ids = [
  "chatgpt-codex",
]

[harnesses]
ids = [
  "knowledgeislands/ki-agentic-harness",
]

[skills]

[skills.ki-bootstrap]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-delegate]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-next]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-plan]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-recap]
harness = "knowledgeislands/ki-agentic-harness"

[local]
path = ${JSON.stringify(await box.root.realpath('harness'))}
`
      )
    })
  })

  describe('dev off', () => {
    test('restores the verified canonical harness and re-projects skills', async () => {
      const box = await sandbox()
      await box.home.mkdir('.claude')
      await box.installBootstrapHarness()
      await box.run(['bootstrap'])

      const off = await box.run(['dev', 'off'])

      expect(off).toEqual({
        exitCode: 0,
        output: [
          'development harness disabled; canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c',
          'refreshed KI configuration: 1 agents, 1 harnesses, 5 skills',
          'ki-bootstrap for claude-code already installed',
          'ki-delegate for claude-code already installed',
          'ki-next for claude-code already installed',
          'ki-plan for claude-code already installed',
          'ki-recap for claude-code already installed',
          ''
        ].join('\n')
      })
    })
  })

  describe('guards', () => {
    test('refuses to switch before the environment is bootstrapped', async () => {
      const box = await sandbox()

      const off = await box.run(['dev', 'off'])

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('run `ki bootstrap` first')
    })

    test('requires the local harness to contain the canonical bootstrap skill', async () => {
      const box = await sandbox()
      await box.root.mkdir('harness/skills/process/ki-other')

      const result = await box.run(['dev', 'on', box.root.resolve('harness')])

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('skills/keystone/ki-bootstrap/SKILL.md')
    })
  })
})
