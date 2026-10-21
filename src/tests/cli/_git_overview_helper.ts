// Test-only archive of the canonical ki-git session, CLEAN catalogue and type contract.
// Source: knowledgeislands/ki-agentic-harness at b91fa71dba7ea902e7c1fa8eefa9d515e226a741.
// Each archived source is byte-exact; SHA-256 provenance is verified before installation.
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import type { Sandbox } from './_cli_helper.ts'

const archive =
  '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'
const provenance: Record<string, string> = {
  'scripts/rubric/contexts/git.ts': 'b54cffb35c65436d0edde9cc94f848dd190b0d5b68b0164e248ff3f751df8048',
  'scripts/rubric/items/clean.ts': 'af8f04dbe10c4ca9613387a6a4c3618158df62ef45de8b8612f8be546c8e4ac6',
  'scripts/shared/rubric.ts': 'bcd03279b7ccccf217ad56d0ebb92fa7d973a983a1bb2f52b84ad5c919404c6c'
}

export const gitDeclaration = '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-git]\n'

export const installGitCatalogue = async (box: Sandbox, writer = false): Promise<void> => {
  await box.setupExampleHarness({ name: 'ki-git' })
  const base = 'ki/harnesses/example/harness/skills/ki-git'
  const files: Record<string, string> = JSON.parse(gunzipSync(Buffer.from(archive, 'base64')).toString())
  for (const [path, content] of Object.entries(files)) {
    if (createHash('sha256').update(content).digest('hex') !== provenance[path])
      throw new Error(`fixture provenance: ${path}`)
    await box.data.write(`${base}/${path}`, content)
  }
  await box.data.write(
    `${base}/scripts/rubric/items/index.ts`,
    `
import { appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createGitSession } from '../contexts/git.ts'
import { CLEAN } from './clean.ts'
// A fixture-only warning keeps the existing attention-only results renderer open,
// so --reporter-levels all exposes canonical PASS and INFO outcomes as well.
const observer = { code: 'OBSERVER', title: 'Observer', description: 'Output observer', standard: 'fixture.md', selectContext: x => x,
  items: [{ code: 'OBSERVER-1', title: 'Observation sentinel', description: 'Expose selected output levels', sources: ['fixture.md'], mechanical: { level: 'WARN', remediation: { class: 'diagnostic', guidance: 'Fixture only' }, audit: { phase: 'INSPECT', run: () => [{ status: 'VIOLATION', message: 'fixture observation sentinel' }] } } }] }
const fixture = {
  code: 'FIXTURE', title: 'Independent write fixture', description: 'Exercises post-write re-audit.', standard: 'fixture.md',
  selectContext: context => context,
  items: [{ code: 'FIXTURE-1', title: 'Fixture marker', description: 'A separate automatic write.', sources: ['fixture.md'],
    mechanical: { level: 'WARN', remediation: { class: 'automatic' },
      audit: { phase: 'INSPECT', run: context => [{ status: existsSync(context.repository + '/marker.txt') ? 'PASS' : 'VIOLATION', message: 'fixture marker' }] },
      conform: { phase: 'PRIMARY', run: context => context.propose() }
    }
  }]
}
export default {
  contract: 1, name: 'ki-git', concern: 'Archived canonical CLEAN contract', families: [CLEAN, observer, ...(${writer} ? [fixture] : [])],
  createSession: async options => {
    await appendFile(options.userHome + '/overview-observations.jsonl', JSON.stringify({ mode: options.mode, repository: options.repository, supplied: Object.hasOwn(options, 'gitOverview'), document: options.gitOverview }) + '\\n')
    const session = createGitSession(options)
    let write = false
    return { ...session,
      subjects: [...session.subjects.filter(subject => subject.families.includes('CLEAN')).map(subject => ({ ...subject, families: ['CLEAN'] })), { families: ['OBSERVER'], context: () => ({}) }, ...(${writer} ? [{ families: ['FIXTURE'], context: () => ({ repository: options.repository, propose: () => { write = true } }) }] : [])],
      proposal: () => ({ writes: write ? [{ path: 'marker.txt', content: 'fixture\\n', create: true }] : [] })
    }
  }
}`
  )
}

export const facts = (path: string, extra: Record<string, unknown> = {}) => ({
  label: 'checkout "quoted" \\ path',
  path,
  state: 'clean',
  bare: false,
  branch: 'main',
  detached: false,
  upstream: { state: 'tracking', name: 'origin/main', ahead: 0, behind: 0 },
  changes: { staged: 0, modified: 0, untracked: 0, conflicted: 0 },
  stashes: 0,
  last_commit_age_days: 1,
  last_fetch_age_days: 7,
  default_branch: 'main',
  worktrees: { linked: 0, prunable: 0, detached: 0 },
  obsolete_branches: [],
  findings: [],
  ...extra
})

export const overview = (...repositories: readonly unknown[]) => ({
  tool: 'mgit',
  command: 'overview',
  version: '0.18.0',
  stale_days: 30,
  repositories,
  summary: { clean: repositories.length, failed: 0 },
  future: { untouched: ['escaped "', null, true] }
})

export const gitFixture = async (writer = false) => {
  const box = await (await import('./_cli_helper.ts')).sandbox()
  await installGitCatalogue(box, writer)
  await box.project.write('.ki.toml', gitDeclaration)
  const root = await realpath(box.project.path)
  return { box, root }
}

export const observations = async (
  box: Sandbox
): Promise<readonly { mode: string; repository: string; supplied: boolean; document?: unknown }[]> =>
  (await box.home.read('overview-observations.jsonl'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
