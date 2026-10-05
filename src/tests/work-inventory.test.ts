import { expect, test } from 'vitest'
import { listRoadmap, listRoadmapItems, roadmapStatisticsForSelection } from '../core/work/index.ts'
import { sandbox } from './cli/_cli_helper.ts'

test('distinguishes unrequested, empty, and unavailable trade evidence in core roadmap inventory', async () => {
  const box = await sandbox()
  const root = await box.project.mkdir('repo')
  await box.project.write(
    'repo/.ki.toml',
    '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/repo"\n\n[skills.ki-work]\nadapter = "roadmap"\n\n[skills.ki-work-roadmap]\n'
  )
  await box.project.write(
    'repo/docs/roadmap/KI-TOOL-CLI-001-test.md',
    '---\nid: KI-TOOL-CLI-001\ntitle: Test\ntheme: cli\nhorizon: next\nstatus: draft\nblocks: []\nblocked_by: []\nbaseline_ref: null\ncreated_at: 2026-09-01T00:00:00Z\nupdated_at: 2026-09-01T00:00:00Z\n---\n\n## Goal\n\nTest inventory.\n\n## Context\n\nFixture.\n\n## Boundary\n\nNone.\n\n## Discussion\n\n### Test\n\nFixture.\n'
  )
  let calls = 0
  const context = {
    configurationDirectory: `${box.config.path}/ki`,
    stateDirectory: `${box.state.path}/ki`,
    workingDirectory: box.project.path,
    homeDirectory: box.home.path,
    now: Date.now,
    locateTrades: async () => {
      calls += 1
      return []
    }
  }
  const selection = { repositories: [root] }

  const skipped = await listRoadmapItems(context, selection, {})
  expect(calls).toBe(0)
  expect(skipped.results[0]).toMatchObject({ tradeInventory: 'not-requested' })
  expect(skipped.results[0]).not.toHaveProperty('trades')

  const empty = await listRoadmap(context, selection, {})
  expect(calls).toBe(1)
  expect(empty.results[0]).toMatchObject({ tradeInventory: 'available', trades: [] })

  await roadmapStatisticsForSelection(context, selection)
  expect(calls).toBe(1)

  const unavailable = await listRoadmap(
    { ...context, locateTrades: async () => Promise.reject(new Error('trade discovery unavailable')) },
    selection,
    {}
  )
  expect(unavailable.results[0]).toMatchObject({
    tradeInventory: 'unavailable',
    trades: [],
    tradeDiagnostic: 'trade discovery unavailable'
  })
})
