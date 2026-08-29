import { lstat, realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// Builds a full direct `scripts/rubric/items/index.ts` catalogue. Most tests use a
// compact literal which this fixture expands into the real family/item contract;
// dedicated catalogue tests below exercise the unabridged shape.
const rubric = (families: string, skill = 'ki-example'): string =>
  `
const item = (value) => {
  if (!value || typeof value !== 'object') return value
  if (value.kind === 'mechanical') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Mechanical test criterion.',
    sources: value.sources ?? ['standard.md'],
    mechanical: {
      level: value.level,
      remediation: value.remediation ?? (value.conform === undefined ? { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' } : { class: 'automatic' }),
      audit: { phase: value.phase, run: value.audit },
      ...(value.conform === undefined ? {} : {
        conform: {
          phase: 'PRIMARY',
          run: async (context) => { context.propose(await value.conform(context)) }
        }
      })
    }
  }
  if (value.kind === 'judgment') return {
    code: value.code,
    title: value.title,
    description: value.description ?? 'Judgment test criterion.',
    sources: value.sources ?? ['standard.md'],
    judgment: { scope: value.scope ?? 'Review the supplied evidence.', prompt: value.prompt, outcomes: value.outcomes ?? ['accepted'], guidance: value.guidance ?? 'Record the selected outcome.' }
  }
  return {
    ...value,
    description: value.description ?? 'Invalid test criterion.',
    sources: value.sources ?? ['standard.md']
  }
}
const family = (value) => !value || typeof value !== 'object' ? value : ({
  ...value,
  description: value.description ?? 'Test family.',
  standard: value.standard ?? 'standard.md',
  selectContext: value.selectContext ?? ((context) => context),
  items: Array.isArray(value.items) ? value.items.map(item) : value.items
})
const families = Array.isArray(${families}) ? (${families}).map(family) : ${families}
export default {
  contract: 1,
  name: '${skill}',
  concern: 'test governance',
  createSession: async ({ repository }) => {
    const proposals = []
    const context = { repository, propose: (proposal) => proposals.push(proposal) }
    return {
      subjects: [{ families: Array.isArray(families) ? families.map(({ code }) => code) : [], context: () => context }],
      proposal: () => proposals.length === 1 ? proposals[0] : ({
        writes: proposals.flatMap(({ writes = [] }) => writes),
        commands: proposals.flatMap(({ commands = [] }) => commands)
      })
    }
  },
  families
}
`
describe('[ki repo target sets]', () => {
  describe('multi-repository target sets', () => {
    test('expands literal and glob selections through supported roadmap listing', async () => {
      const box = await sandbox()
      await box.project.write('repos/a/.ki.toml', '# a\n')
      await box.project.write('repos/a/nested/.ki.toml', '# nested\n')
      await box.project.write('repos/b/.ki.toml', '# b\n')
      await box.project.mkdir('empty')
      const root = await realpath(box.project.path)

      const immediate = await box.run(['ki', 'repo', '--repo', 'repos/a', 'roadmap', 'list'])
      const recursive = await box.run(['ki', 'repo', '--repo', 'repos/**', 'roadmap', 'list'])
      const absolute = await box.run(['ki', 'repo', '--repo', `${box.project.path}/repos/?`, 'roadmap', 'list'])
      const character = await box.run(['ki', 'repo', '--repo', 'repos/?', 'roadmap', 'list'])
      const missingBase = await box.run(['ki', 'repo', '--repo', 'missing/*', 'roadmap', 'list'])
      const unmatched = await box.run(['ki', 'repo', '--repo', 'empty/*', 'roadmap', 'list'])
      const duplicate = await box.run(['ki', 'repo', '--repo', 'repos/a', '--repo', 'repos/a', 'roadmap', 'list'])
      const conflictingSelectors = await box.run([
        'ki',
        'repo',
        '--repo',
        'repos/a',
        '--agora',
        'inventory',
        'roadmap',
        'list'
      ])
      const conflictingEstate = await box.run(['ki', 'repo', '--repo', 'repos/a', '--estate', 'roadmap', 'list'])

      expect(immediate.output).toContain(`(${root}/repos/a)\n├─ roadmap (0)`)
      expect(recursive.output).toContain(`(${root}/repos/a/nested)\n├─ roadmap (0)`)
      expect(absolute.output).toContain(`(${root}/repos/a)\n├─ roadmap (0)`)
      expect(character.output).toContain(`(${root}/repos/b)\n├─ roadmap (0)`)
      expect(missingBase.output).toContain('has no existing directory')
      expect(unmatched.output).toContain('matched no repositories')
      expect(duplicate.output).toContain('selects duplicate repository')
      expect(conflictingSelectors.output).toContain('--repo, --agora, and --estate cannot be used together')
      expect(conflictingEstate.output).toContain('--repo, --agora, and --estate cannot be used together')
    })

    test('expands mGit standard, nested, bare, and child-workspace members', async () => {
      const box = await sandbox()
      await box.project.write(
        '.mgit.toml',
        'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members."first"]\nkind = "repository"\ntype = "standard"\nsource = "https://example.test/first.git"\n\n[groups.default.members."group"]\nkind = "workspace"\n\n[groups.default.members."nested"]\nkind = "repository"\ntype = "nested"\n\n[groups.default.members."archive.git"]\nkind = "repository"\ntype = "bare"\n\n[groups.selected.members."first"]\nkind = "repository"\n\n[groups.selected.members."group"]\nkind = "workspace"\n\n[groups.selected.members."nested"]\nkind = "repository"\n\n[groups.selected.members."archive.git"]\nkind = "repository"\n'
      )
      await box.project.write('first/.ki.toml', '# first\n')
      await box.project.write(
        'group/.mgit.toml',
        'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members."second"]\nkind = "repository"\ntype = "standard"\n'
      )
      await box.project.write('group/second/.ki.toml', '# second\n')
      await box.project.write('nested/main/.ki.toml', '# nested\n')

      const result = await box.run('ki repo roadmap list')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('╭─ KI REPO ROADMAP')
      expect(result.output).toContain('/group/second')
      expect(result.output).toContain('/nested/main')
    })

    test('reports every malformed mGit selection through supported roadmap listing', async () => {
      const box = await sandbox()
      const documents: readonly [string, number][] = [
        ['schema = [\n', 2],
        ['kind = "repository"\n', 2],
        ['schema = 1\nkind = "workspace"\ndefault = "default"\ngroups = []\n', 2],
        [
          'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members."../escape"]\nkind = "repository"\ntype = "standard"\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\nsource = 1\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "unknown"\n',
          2
        ],
        ['schema = 1\nkind = "workspace"\ndefault = "default"\nextra = true\n\n[groups.default]\nmembers = {}\n', 2],
        ['schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default]\nmembers = {}\nextra = true\n', 2],
        ['schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default]\n', 2],
        ['schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members]\nrepo = "invalid"\n', 2],
        ['schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members.repo]\nkind = "invalid"\n', 2],
        [
          'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members.child]\nkind = "workspace"\nextra = true\n',
          2
        ],
        ['schema = 1\nkind = "workspace"\ndefault = "bad group"\n\n[groups.default]\nmembers = {}\n', 2],
        ['schema = 1\nkind = "workspace"\ndefault = "other"\n\n[groups.other]\nmembers = {}\n', 2],
        [
          'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default]\nmembers = {}\n\n[groups."bad group"]\nmembers = {}\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "default"\ngroups.selected = "invalid"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "missing"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n\n[groups.selected]\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n\n[groups.selected]\nmembers = []\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n\n[groups.selected.members]\n"../repo" = { kind = "repository" }\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n\n[groups.selected.members.repo]\nkind = "repository"\nextra = true\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n\n[groups.selected.members.other]\nkind = "repository"\n',
          2
        ],
        [
          'schema = 1\nkind = "workspace"\ndefault = "selected"\n\n[groups.default.members.repo]\nkind = "repository"\ntype = "standard"\n\n[groups.selected.members.repo]\nkind = "workspace"\n',
          2
        ],
        ['schema = 1\nkind = "repository"\nextra = true\n', 2],
        ['schema = 1\nkind = "repository"\nsymlinks = []\n', 2],
        ['schema = 1\nkind = "unknown"\n', 2]
      ]

      for (const [document, exitCode] of documents) {
        await box.project.write('.mgit.toml', document)
        expect((await box.run('ki repo roadmap list')).exitCode).toBe(exitCode)
      }
    })

    test('rejects unsafe manifests and non-workspace child manifests', async () => {
      const unsafe = await sandbox()
      await unsafe.project.mkdir('.mgit.toml')
      const unsafeResult = await unsafe.run('ki repo roadmap list')

      const child = await sandbox()
      await child.project.write(
        '.mgit.toml',
        'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members.child]\nkind = "workspace"\n'
      )
      await child.project.write('child/.mgit.toml', 'schema = 1\nkind = "repository"\n')
      const childResult = await child.run('ki repo roadmap list')

      expect(unsafeResult.exitCode).toBe(2)
      expect(unsafeResult.output).toContain('.mgit.toml must be a regular file')
      expect(childResult.exitCode).toBe(2)
      expect(childResult.output).toContain('child workspace child must contain workspace-kind .mgit.toml')
    })
    // KI-TOOL-CLI-030 decision: an mGit document that names members selects those members and not
    // the repository it sits in, even when that directory carries its own `.ki.toml`. A
    // workspace root's declaration governs the workspace; its members are audited on their own.
    test('selects only the members of an mGit document that also sits in a KI repository', async () => {
      const box = await sandbox()
      await box.project.write(
        '.mgit.toml',
        'schema = 1\nkind = "workspace"\ndefault = "default"\n\n[groups.default.members."first"]\nkind = "repository"\ntype = "standard"\n'
      )
      await box.project.write('.ki.toml', '# workspace root\n')
      await box.project.write('first/.ki.toml', '# first\n')
      const root = await realpath(box.project.path)

      const result = await box.run('ki repo roadmap list')

      expect(result.output).toContain(`(${root}/first)\n├─ roadmap (0)`)
      expect(result.output).not.toContain(`(${root})\n`)
    })

    test('audits the repository a repository-kind mGit manifest sits in', async () => {
      const box = await sandbox()
      await box.project.write(
        '.mgit.toml',
        'schema = 1\nkind = "repository"\n\n[symlinks]\n".claude/skills/ki-example" = "~/harness/skills/ki-example"\n'
      )
      await box.project.write('.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      const root = await realpath(box.project.path)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain(`╭─ KI REPO AUDIT\n│  ├─ 📁 project (${root})`)
      expect(result.output).toContain('PASS · 1 skill')
    })

    test('fails loudly when a repository-kind mGit manifest has no discoverable KI repository', async () => {
      const box = await sandbox()
      await box.project.write(
        '.mgit.toml',
        'schema = 1\nkind = "repository"\n\n[symlinks]\n".claude/skills/ki-example" = "~/harness/skills/ki-example"\n'
      )

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('no KI repository found from the current working directory')
      expect(result.output).not.toContain('PASS=')
    })

    test('runs audit independently for every preflighted explicit target', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.root.write('second/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      const first = await realpath(`${box.root.path}/first`)
      const second = await realpath(`${box.root.path}/second`)

      const result = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'audit', '--progress', 'always'])
      const concise = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'audit', '--concise'])

      expect(result.exitCode).toBe(0)
      expect(result.output.match(/╭─ KI REPO AUDIT\n/g)).toHaveLength(2)
      expect(result.output).toContain(`╭─ KI REPO AUDIT\n│  ├─ 📁 second (${second})`)
      expect(result.output).toContain(
        `╭─ KI REPO AUDIT · MULTI-REPOSITORY SUMMARY\n│  ├─ ✓ first PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0\n│  ╰─ ✓ second PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0\n╰─ totals: PASS=2 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0`
      )
      expect(concise).toEqual({
        exitCode: 0,
        output:
          'summary: KI REPO AUDIT on first PASS · 1 skill\nsummary: KI REPO AUDIT on second PASS · 1 skill\ntotals: KI REPO AUDIT PASS=2 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0\n'
      })
    })

    test('recaps every repository verdict and aggregate finding volume', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.root.write('second/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.root.write('third/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [
          {
            kind: 'mechanical', code: 'WARN-1', title: 'Warning', level: 'WARN', phase: 'PRIMARY',
            audit: async ({ repository }) => repository.endsWith('/second') ? [{ status: 'VIOLATION', message: 'needs attention' }] : []
          },
          {
            kind: 'mechanical', code: 'FAIL-1', title: 'Failure', level: 'FAIL', phase: 'PRIMARY',
            audit: async ({ repository }) => repository.endsWith('/third') ? [{ status: 'VIOLATION', message: 'broken' }] : []
          }
        ] }]`)
      })
      const first = await realpath(`${box.root.path}/first`)
      const second = await realpath(`${box.root.path}/second`)
      const third = await realpath(`${box.root.path}/third`)

      const result = await box.run(['ki', 'repo', '--repo', first, '--repo', second, '--repo', third, 'audit'])

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('╰─ summary: KI REPO AUDIT on first PASS · 1 skill')
      expect(result.output).toContain(
        '╰─ summary: KI REPO AUDIT on second PASS=0 WARN=1 FAIL=0 · FINDINGS: FAIL=0 WARN=1'
      )
      expect(result.output).toContain(
        '╰─ summary: KI REPO AUDIT on third PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=0'
      )
      expect(result.output).toContain(
        `╭─ KI REPO AUDIT · MULTI-REPOSITORY SUMMARY\n│  ├─ ✓ first PASS=1 WARN=0 FAIL=0 · FINDINGS: FAIL=0 WARN=0\n│  ├─ ! second PASS=0 WARN=1 FAIL=0 · FINDINGS: FAIL=0 WARN=1\n│  ╰─ × third PASS=0 WARN=0 FAIL=1 · FINDINGS: FAIL=1 WARN=0\n╰─ totals: PASS=1 WARN=1 FAIL=1 · FINDINGS: FAIL=1 WARN=1`
      )
    })

    test('conforms every explicit target independently after all targets preflight', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.root.write('second/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'MARK-1', title: 'Marker', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/marker.txt') ? [{ status: 'PASS', message: 'present' }] : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'marker.txt', content: 'ok\\n', create: true }] })
        }] }]`)
      })
      const first = await realpath(`${box.root.path}/first`)
      const second = await realpath(`${box.root.path}/second`)

      const result = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'conform'])

      expect(result.exitCode).toBe(0)
      await expect(box.root.read('first/marker.txt')).resolves.toBe('ok\n')
      await expect(box.root.read('second/marker.txt')).resolves.toBe('ok\n')
    })

    test('does not mutate an earlier target when a later target fails preflight', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.root.mkdir('not-a-repository')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'MARK-1', title: 'Marker', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/marker.txt') ? [{ status: 'PASS', message: 'present' }] : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async () => ({ writes: [{ path: 'marker.txt', content: 'ok\\n', create: true }] })
        }] }]`)
      })
      const first = await realpath(`${box.root.path}/first`)

      const result = await box.run([
        'ki',
        'repo',
        '--repo',
        first,
        '--repo',
        `${box.root.path}/not-a-repository`,
        'conform'
      ])

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: --repo must name a repository containing .ki.toml\n'
      })
      await expect(lstat(`${first}/marker.txt`)).rejects.toThrow()
    })

    test('retains an earlier mutation when a later selected target fails', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.root.write('second/.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-example]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{
          kind: 'mechanical', code: 'MARK-1', title: 'Marker', level: 'FAIL', phase: 'PRIMARY',
          audit: async ({ repository }) => {
            const { existsSync } = await import('node:fs')
            return existsSync(repository + '/marker.txt') ? [{ status: 'PASS', message: 'present' }] : [{ status: 'VIOLATION', message: 'missing' }]
          },
          conform: async ({ repository }) => ({ writes: repository.endsWith('/second')
            ? [{ path: 'missing.txt', content: 'nope\\n' }]
            : [{ path: 'marker.txt', content: 'ok\\n', create: true }] })
        }] }]`)
      })
      const first = await realpath(`${box.root.path}/first`)
      const second = await realpath(`${box.root.path}/second`)

      const result = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'conform'])

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('direct conform write target missing.txt must be an existing regular file')
      await expect(box.root.read('first/marker.txt')).resolves.toBe('ok\n')
    })
  })
})
