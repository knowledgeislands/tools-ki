import { lstat, realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

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
    judgment: { prompt: value.prompt }
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
    test('expands literal and glob selections through supported plan listing', async () => {
      const box = await sandbox()
      await box.project.write('repos/a/.ki-config.toml', '# a\n')
      await box.project.write('repos/a/nested/.ki-config.toml', '# nested\n')
      await box.project.write('repos/b/.ki-config.toml', '# b\n')
      await box.project.mkdir('empty')
      const root = await realpath(box.project.path)

      const immediate = await box.run(['ki', 'repo', '--repo', 'repos/a', 'plan', 'list'])
      const recursive = await box.run(['ki', 'repo', '--repo', 'repos/**', 'plan', 'list'])
      const absolute = await box.run(['ki', 'repo', '--repo', `${box.project.path}/repos/?`, 'plan', 'list'])
      const character = await box.run(['ki', 'repo', '--repo', 'repos/?', 'plan', 'list'])
      const missingBase = await box.run(['ki', 'repo', '--repo', 'missing/*', 'plan', 'list'])
      const unmatched = await box.run(['ki', 'repo', '--repo', 'empty/*', 'plan', 'list'])
      const duplicate = await box.run(['ki', 'repo', '--repo', 'repos/a', '--repo', 'repos/a', 'plan', 'list'])

      expect(immediate.output).toContain(`Repository: ${root}/repos/a`)
      expect(recursive.output).toContain(`Repository: ${root}/repos/a/nested`)
      expect(absolute.output).toContain(`Repository: ${root}/repos/a`)
      expect(character.output).toContain(`Repository: ${root}/repos/b`)
      expect(missingBase.output).toContain('has no existing directory')
      expect(unmatched.output).toContain('matched no repositories')
      expect(duplicate.output).toContain('selects duplicate repository')
    })

    test('expands mGit standard, nested, and container members through supported plan listing', async () => {
      const box = await sandbox()
      await box.project.write(
        '.mgit-config.toml',
        'version = 1\n\n[members."first"]\ntype = "standard"\nsource = "https://example.test/first.git"\n\n[members."group"]\ntype = "dir"\n\n[members."nested"]\ntype = "nested"\n\n[members."archive.git"]\ntype = "bare"\n'
      )
      await box.project.write('first/.ki-config.toml', '# first\n')
      await box.project.write('group/.mgit-config.toml', 'version = 1\n\n[members."second"]\ntype = "standard"\n')
      await box.project.write('group/second/.ki-config.toml', '# second\n')
      await box.project.write('nested/main/.ki-config.toml', '# nested\n')

      const result = await box.run('ki repo plan list')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('Repository:')
      expect(result.output).toContain('/group/second')
      expect(result.output).toContain('/nested/main')
    })

    test('reports every malformed mGit selection through supported plan listing', async () => {
      const box = await sandbox()
      const documents: readonly [string, number][] = [
        ['version = 1\n', 0],
        ['version = [\n', 2],
        ['[members."repo"]\ntype = "standard"\n', 2],
        ['version = 1\nmembers = []\n', 2],
        ['version = 1\n\n[members."../escape"]\ntype = "standard"\n', 2],
        ['version = 1\n\n[members."repo"]\ntype = "standard"\nsource = 1\n', 2],
        ['version = 1\n\n[members."repo"]\ntype = "unknown"\n', 2]
      ]

      for (const [document, exitCode] of documents) {
        await box.project.write('.mgit-config.toml', document)
        expect((await box.run('ki repo plan list')).exitCode).toBe(exitCode)
      }
    })
    test('runs audit independently for every preflighted explicit target', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.root.write('second/.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      const first = await realpath(`${box.root.path}/first`)
      const second = await realpath(`${box.root.path}/second`)

      const result = await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'audit'])

      expect(result.exitCode).toBe(0)
      expect(result.output.match(/ki repo audit: clean \(1 skills\)/g)).toHaveLength(2)
    })

    test('conforms every explicit target independently after all targets preflight', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.root.write('second/.ki-config.toml', '["example/harness:ki-example"]\n')
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
      await box.root.write('first/.ki-config.toml', '["example/harness:ki-example"]\n')
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

      const result = await box.run(['ki', 'repo', '--repo', first, '--repo', `${box.root.path}/not-a-repository`, 'conform'])

      expect(result).toEqual({ exitCode: 2, output: 'ki: error: --repo must name a repository containing .ki-config.toml\n' })
      await expect(lstat(`${first}/marker.txt`)).rejects.toThrow()
    })

    test('retains an earlier mutation when a later selected target fails', async () => {
      const box = await sandbox()
      await box.root.write('first/.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.root.write('second/.ki-config.toml', '["example/harness:ki-example"]\n')
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
