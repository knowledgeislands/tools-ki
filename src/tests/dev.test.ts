import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { sandbox } from './testkit.ts'

afterEach(sandbox.cleanupAll)

describe('ki dev', () => {
  describe('dev on', () => {
    test('switches the canonical harness to a local development checkout', async () => {
      const box = await sandbox()
      const harness = join(box.root.path, 'harness')
      const source = join(harness, 'skills', 'keystone', 'ki-bootstrap')
      await box.home.mkdir('.agents')
      await Promise.all(['subagents', 'hooks'].map((payload) => mkdir(join(harness, payload), { recursive: true })))
      await box.installBootstrapHarness()
      for (const skill of ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap']) {
        const path = skill === 'ki-bootstrap' ? source : join(harness, 'skills', 'process', skill)
        await mkdir(path, { recursive: true })
        await writeFile(join(path, 'SKILL.md'), `---\nname: ${skill}\nki-depends-on: []\n---\n`)
      }

      await box.run(['bootstrap'])
      const result = await box.run(['dev', 'on', harness])

      expect(result).toEqual({
        exitCode: 0,
        output: `development harness enabled ${await realpath(harness)}
refreshed KI configuration: 1 agents, 1 harnesses, 5 skills
ki-bootstrap for chatgpt-codex already installed
ki-delegate for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
`
      })
      expect(
        (await lstat(join(box.data.path, 'ki', 'harnesses', 'knowledgeislands', 'ki-agentic-harness', 'skills'))).isSymbolicLink()
      ).toBe(true)
      expect((await lstat(join(box.home.path, '.agents', 'skills', 'ki-bootstrap'))).isSymbolicLink()).toBe(true)
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
path = ${JSON.stringify(await realpath(harness))}
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
      const harness = join(box.root.path, 'harness')
      await mkdir(join(harness, 'skills', 'process', 'ki-other'), { recursive: true })

      const result = await box.run(['dev', 'on', harness])

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('skills/keystone/ki-bootstrap/SKILL.md')
    })
  })
})
