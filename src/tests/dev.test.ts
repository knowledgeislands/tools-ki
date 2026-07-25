import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, installBootstrapHarness, runKi, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki dev', () => {
  describe('dev on', () => {
    test('switches the canonical harness to a local development checkout', async () => {
      const root = await temporaryDirectory()
      const home = join(root, 'home')
      const harness = join(root, 'harness')
      const source = join(harness, 'skills', 'keystone', 'ki-bootstrap')
      const data = join(root, 'data')
      await mkdir(join(home, '.agents'), { recursive: true })
      await Promise.all(['subagents', 'hooks'].map((payload) => mkdir(join(harness, payload), { recursive: true })))
      await installBootstrapHarness(data)
      for (const skill of ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap']) {
        const path = skill === 'ki-bootstrap' ? source : join(harness, 'skills', 'process', skill)
        await mkdir(path, { recursive: true })
        await writeFile(join(path, 'SKILL.md'), `---\nname: ${skill}\nki-depends-on: []\n---\n`)
      }

      await runKi(['bootstrap'], { HOME: home, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: data })
      const result = await runKi(['dev', 'on', harness], {
        HOME: home,
        XDG_CONFIG_HOME: join(root, 'config'),
        XDG_DATA_HOME: data
      })

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
      expect((await lstat(join(data, 'ki', 'harnesses', 'knowledgeislands', 'ki-agentic-harness', 'skills'))).isSymbolicLink()).toBe(true)
      expect((await lstat(join(home, '.agents', 'skills', 'ki-bootstrap'))).isSymbolicLink()).toBe(true)
      expect(await readFile(join(root, 'config', 'ki', 'config.toml'), 'utf8')).toBe(
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
      const root = await temporaryDirectory()
      const home = join(root, 'home')
      const configuration = join(root, 'config')
      const data = join(root, 'data')
      await mkdir(join(home, '.claude'), { recursive: true })
      await installBootstrapHarness(data)
      const environment = { HOME: home, XDG_CONFIG_HOME: configuration, XDG_DATA_HOME: data }
      await runKi(['bootstrap'], environment)

      const off = await runKi(['dev', 'off'], environment)

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
})
