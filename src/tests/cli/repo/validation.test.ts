import { rm, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type SandboxArea, sandbox } from '../_cli_helper.ts'

// Builds a full direct `scripts/rubric/items/index.ts` catalogue. Most tests use a
// compact literal which this fixture expands into the real family/item contract;
// dedicated catalogue tests below exercise the unabridged shape.
const rubric = (families: string, skill = 'ki-example'): string => `
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

const rubricWithSession = (session: string): string =>
  `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'session validation',
  createSession: () => (${session}),
  families: [{
    code: 'F',
    title: 'Family',
    description: 'Test family.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: []
  }]
}
`
describe('[ki repo validation]', () => {
  describe('altered installed providers', () => {
    test('refuses a rubric module replaced by a symlink after install', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      const base = 'ki/harnesses/example/harness/skills/ki-example'
      await box.data.write(`${base}/scripts/rubric/notes.ts`, '// alternate target\n')
      const rubricModulePath = `${box.data.path}/${base}/scripts/rubric/items/index.ts`
      await rm(rubricModulePath)
      await symlink(`${box.data.path}/${base}/scripts/rubric/notes.ts`, rubricModulePath)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must not be a symlink')
    })

    test('refuses a skill whose SKILL.md frontmatter was broken after install', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]') })
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', 'no frontmatter here\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must declare frontmatter')
    })
  })

  describe('malformed rubric definitions', () => {
    test.each([
      [
        'invalid override levels',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', remediation: { class: 'diagnostic', guidance: 'Diagnose.' }, overrideLevels: ['CRITICAL'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'overrideLevels must contain only FAIL or WARN'
      ],
      [
        'repeated override levels',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', remediation: { class: 'diagnostic', guidance: 'Diagnose.' }, overrideLevels: ['WARN', 'WARN'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'repeats an override level'
      ],
      [
        'a non-boolean heuristic',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', heuristic: 'yes', audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'heuristic must be boolean'
      ],
      [
        'an invalid conform-on status',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', conformOn: ['VIOLATION'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'conformOn must contain unique INFO statuses'
      ],
      [
        'repeated conform-on statuses',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', conformOn: ['INFO', 'INFO'], audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'conformOn must contain unique INFO statuses'
      ],
      [
        'a mechanical aspect that is not a table',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: null }] }]`,
        'mechanical aspect must be a table'
      ],
      [
        'a conform aspect that is not a table',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', mechanical: { level: 'FAIL', remediation: { class: 'automatic' }, audit: { phase: 'PRIMARY', run: async () => [] }, conform: null } }] }]`,
        'conform must be a table'
      ],
      [
        'a judgment aspect that is not a table',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', judgment: null }] }]`,
        'judgment must be a table'
      ],
      [
        'an empty sources list',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', sources: [], mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'must have a non-empty sources array'
      ],
      [
        'an empty source entry',
        `[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', sources: [''], mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } }] }]`,
        'must have a non-empty sources array'
      ]
    ])('rejects %s', async (_case, families, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(families) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test.each([
      [
        'missing remediation',
        "mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } }",
        'must declare automatic, diagnostic, or guarded remediation'
      ],
      [
        'automatic without conform',
        "mechanical: { level: 'FAIL', remediation: { class: 'automatic' }, audit: { phase: 'PRIMARY', run: async () => [] } }",
        'automatic remediation must have a conform action'
      ],
      [
        'diagnostic with conform',
        "mechanical: { level: 'FAIL', remediation: { class: 'diagnostic', guidance: 'Diagnose.' }, audit: { phase: 'PRIMARY', run: async () => [] }, conform: { phase: 'PRIMARY', run: async () => {} } }",
        'diagnostic remediation must not have a conform action'
      ],
      [
        'guarded without judgment',
        "mechanical: { level: 'FAIL', remediation: { class: 'guarded', guidance: 'Choose.' }, audit: { phase: 'PRIMARY', run: async () => [] } }",
        'guarded remediation must have a judgment aspect'
      ],
      ['incomplete judgment', "judgment: { prompt: 'Review it.' }", 'judgment must have an evidence scope']
    ])('rejects v1 rubric metadata with %s', async (_case, aspect, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ code: 'EXAMPLE-1', title: 'Example', ${aspect} }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test.each([
      [
        'a malformed scope',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: null, createSession: async () => ({}), families: [] }`,
        'rubric definition scope must be a table'
      ],
      [
        'a user-home scope without paths',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'user-home' }, createSession: async () => ({}), families: [] }`,
        'user-home scope must declare paths'
      ],
      [
        'a user-home scope with repeated paths',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'user-home', paths: ['.managed', '.managed'] }, createSession: async () => ({}), families: [] }`,
        'user-home scope repeats a path'
      ],
      [
        'a user-home scope with an unsafe path',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'user-home', paths: ['../managed'] }, createSession: async () => ({}), families: [] }`,
        'user-home scope paths must be safe relative paths'
      ],
      [
        'an unrecognised scope kind',
        `export default { contract: 1, name: 'ki-example', concern: 'test', scope: { kind: 'workspace', paths: ['managed'] }, createSession: async () => ({}), families: [] }`,
        'user-home scope must declare paths'
      ],
      [
        'a family with no description',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', standard: 'standard.md', selectContext: () => ({}), items: [] }] }`,
        'rubric family F must have a description'
      ],
      [
        'a family with no standard',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', selectContext: () => ({}), items: [] }] }`,
        'rubric family F must name its standard'
      ],
      [
        'a family with no context selector',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', standard: 'standard.md', items: [] }] }`,
        'rubric family F must have a selectContext function'
      ],
      [
        'a repeated family code',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', standard: 'standard.md', selectContext: () => ({}), items: [] }, { code: 'F', title: 'Other', description: 'Other.', standard: 'standard.md', selectContext: () => ({}), items: [] }] }`,
        'rubric repeats family F'
      ],
      [
        'a definition with no concern',
        `export default { contract: 1, name: 'ki-example', createSession: async () => ({}), families: [] }`,
        'rubric catalogue must name its concern'
      ],
      [
        'an item with no description',
        `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [{ code: 'F', title: 'Family', description: 'Family.', standard: 'standard.md', selectContext: () => ({}), items: [{ code: 'EXAMPLE-1', title: 'Example', sources: ['standard.md'], mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } }] }] }`,
        'rubric item EXAMPLE-1 must have a description'
      ]
    ])('rejects %s', async (_case, source, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: source })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test.each([
      ['a non-table session', 'null', 'rubric context must return a session table'],
      [
        'no subjects array',
        `{ subjects: null, proposal: () => ({ writes: [] }) }`,
        'rubric session must contain a subjects array'
      ],
      ['no proposal function', `{ subjects: [], proposal: null }`, 'rubric session must provide a proposal function'],
      [
        'a non-table subject',
        `{ subjects: [null], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 must be a table'
      ],
      [
        'a subject with no context function',
        `{ subjects: [{ families: ['F'] }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 must provide a context function'
      ],
      [
        'a subject naming an undeclared family',
        `{ subjects: [{ families: ['UNKNOWN'], context: () => ({}) }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 families must name only declared rubric families'
      ],
      [
        'a subject repeating a family',
        `{ subjects: [{ families: ['F', 'F'], context: () => ({}) }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 repeats a family'
      ],
      [
        'a subject with a non-string label',
        `{ subjects: [{ families: ['F'], context: () => ({}), subject: 42 }], proposal: () => ({ writes: [] }) }`,
        'rubric subject 0 has an invalid subject label'
      ]
    ])('rejects a rubric context with %s', async (_case, session, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubricWithSession(session) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test('rejects a rubric module with no default export', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: '// missing default export\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue default export is not a table')
    })

    test('rejects an audit function returning non-array outcomes', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => ({ status: 'INFO' }) }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must return an outcomes array')
    })

    test('rejects a conform returning a non-array writes field', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => ({ writes: 'not an array' }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric session proposal must return a writes array')
    })

    test('rejects an audit outcome that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [null] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('audit outcome 0 must be a table')
    })

    test('rejects a conform write that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => ({ writes: [null] }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric session proposal write 0 must have string path and content')
    })

    test('rejects an audit outcome missing a status', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'invalid', message: 'x' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid status')
    })

    test('rejects an audit outcome missing a message', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'INFO' }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must have a message')
    })

    test('rejects an audit outcome with an undeclared level', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric:
          rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', level: 'WARN', message: 'x' }] }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('uses an undeclared level')
    })

    test('rejects an audit outcome that sets a level outside a violation', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric:
          rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'INFO', level: 'WARN', message: 'x' }] }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('sets a level outside VIOLATION')
    })

    test('rejects a rubric module whose native module fails to import', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: 'this is not valid javascript syntax {{{\n' })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue could not be imported')
    })

    test('rejects a conform that does not return a writes table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => null }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric session proposal must return a table')
    })

    test('rejects a conform write entry with a non-string path or content', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'VIOLATION', message: 'x' }],
            conform: async () => ({ writes: [{ path: 1, content: 'x' }] }) }]
        }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must have string path and content')
    })

    test.each([
      [
        'a non-boolean create flag',
        `{ writes: [{ path: 'governed.txt', content: 'x', create: 'yes' }] }`,
        'create must be boolean'
      ],
      ['a non-array commands field', `{ writes: [], commands: 'not an array' }`, 'proposal commands must be an array'],
      ['a non-table command', `{ writes: [], commands: [null] }`, 'command 0 must have a program and arguments'],
      [
        'an invalid command program',
        `{ writes: [], commands: [{ program: '../false', arguments: [] }] }`,
        'command 0 must have a program and arguments'
      ],
      [
        'a command argument with a NUL byte',
        `{ writes: [], commands: [{ program: 'false', arguments: ['a\\0b'] }] }`,
        'arguments must be strings without NUL bytes'
      ],
      [
        'a non-string command argument',
        `{ writes: [], commands: [{ program: 'false', arguments: [1] }] }`,
        'arguments must be strings without NUL bytes'
      ]
    ])('rejects %s in a conform proposal', async (_case, proposal, expected) => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric:
          rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
          audit: async () => [{ status: 'VIOLATION', message: 'x' }], conform: async () => (${proposal}) }] }]`)
      })

      const result = await box.run('ki repo conform')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test('rejects a rubric item with an invalid level', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'CRITICAL', phase: 'PRIMARY',
            audit: async () => [] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid level')
    })

    test('rejects a rubric item with an invalid phase', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'NEVER',
            audit: async () => [] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid phase')
    })

    test('rejects a rubric item whose conform is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{
            code: 'EXAMPLE-1', title: 'Example',
            mechanical: {
              level: 'FAIL',
              remediation: { class: 'automatic' },
              audit: { phase: 'PRIMARY', run: async () => [] },
              conform: { phase: 'PRIMARY', run: 'not a function' }
            }
          }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('conform must have a run function')
    })

    test('rejects a rubric definition whose declared skill does not match the installed capability', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[]', 'ki-other') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue name does not match the installed capability')
    })

    test('rejects an audit outcome with a non-string subject', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY',
            audit: async () => [{ status: 'INFO', message: 'x', subject: 7 }] }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has an invalid subject')
    })

    test('orders mechanical items across families by phase, then family, then item position', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      const item = (
        code: string,
        phase: string
      ) => `{ kind: 'mechanical', code: '${code}', title: '${code}', level: 'FAIL', phase: '${phase}',
        audit: async () => [{ status: 'INFO', message: '${code}' }] }`
      await box.setupExampleHarness({
        rubric: rubric(`[
          { code: 'FC', title: 'C', items: [${item('C1', 'INSPECT')}] },
          { code: 'FB', title: 'B', items: [${item('B1', 'PREPARE')}] },
          { code: 'FA', title: 'A', items: [${item('A1', 'PREPARE')}, ${item('A2', 'PREPARE')}] }
        ]`)
      })

      const result = await box.run('ki repo audit --reporter-levels info')

      const first = result.output.indexOf('[B1 (B1)] — B1')
      const second = result.output.indexOf('[A1 (A1)] — A1')
      const third = result.output.indexOf('[A2 (A2)] — A2')
      const fourth = result.output.indexOf('[C1 (C1)] — C1')
      expect([first, second, third, fourth].every((index) => index >= 0)).toBe(true)
      expect(first).toBeLessThan(second)
      expect(second).toBeLessThan(third)
      expect(third).toBeLessThan(fourth)
    })

    test('rejects a rubric item whose audit is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [{ kind: 'mechanical', code: 'EXAMPLE-1', title: 'Example', level: 'FAIL', phase: 'PRIMARY', audit: 'not a function' }]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('audit must have a run function')
    })

    test('rejects a rubric item that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', title: 'Family', items: [null] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item must be a table')
    })

    test('rejects a rubric item with no code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', title: 'Example' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item must have a code')
    })

    test('rejects a rubric item with no title', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'EXAMPLE-1' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item EXAMPLE-1 must have a title')
    })

    test('rejects a rubric definition that repeats an item code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{
          code: 'F', title: 'Family',
          items: [
            { kind: 'judgment', code: 'EXAMPLE-1', title: 'One', prompt: 'a' },
            { kind: 'judgment', code: 'EXAMPLE-1', title: 'Two', prompt: 'b' }
          ]
        }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric repeats code EXAMPLE-1')
    })

    test('rejects a judgment item with no prompt', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(
          `[{ code: 'F', title: 'Family', items: [{ kind: 'judgment', code: 'J-1', title: 'Judgment' }] }]`
        )
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item J-1 judgment must have a prompt')
    })

    test('rejects a rubric item with neither aspect', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: rubric(`[{ code: 'F', title: 'Family', items: [{ kind: 'unknown', code: 'X-1', title: 'X' }] }]`)
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric item X-1 must be mechanical, judgment, or both')
    })

    test('rejects a rubric family that is not a table', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric('[null]') })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family must be a table')
    })

    test('rejects a rubric family with no code', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ title: 'Family', items: [] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family must have a code')
    })

    test('rejects a rubric family with no title', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', items: [] }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family F must have a title')
    })

    test('rejects a rubric family whose items is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({ rubric: rubric(`[{ code: 'F', title: 'Family', items: 'not an array' }]`) })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric family F must have an items array')
    })

    test('rejects a rubric definition with an unsupported contract version', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 2, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue has an unsupported contract version')
    })

    test('rejects a rubric definition whose createSession is not a function', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: 'not a function', families: [] }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue must have a createSession function')
    })

    test('rejects a rubric definition whose families is not an array', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
      await box.setupExampleHarness({
        rubric: `export default { contract: 1, name: 'ki-example', concern: 'test', createSession: async () => ({}), families: 'not an array' }`
      })

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('rubric catalogue must have a families array')
    })
  })

  describe('skill resolution', () => {
    const installSkillsHarness = async (
      data: SandboxArea,
      specs: readonly {
        readonly name: string
        readonly deps: readonly string[]
        readonly optionalDeps?: readonly string[]
      }[]
    ): Promise<void> => {
      for (const { name, deps, optionalDeps = [] } of specs) {
        const base = `ki/harnesses/example/harness/skills/${name}`
        const list = `[${deps.join(', ')}]`
        const skillMarkdown = `---
name: ${name}
ki-depends-on: ${list}
${optionalDeps.length ? `ki-optional-depends-on: [${optionalDeps.join(', ')}]\n` : ''}---
`
        await data.write(`${base}/SKILL.md`, skillMarkdown)
        await data.write(
          `${base}/scripts/rubric/items/index.ts`,
          rubric(
            `[{ code: 'F', title: 'Family', items: [{ kind: 'mechanical', code: 'R-1', title: 'Order', level: 'FAIL', phase: 'PRIMARY', audit: async () => [{ status: 'INFO', message: '${name}' }] }] }]`,
            name
          )
        )
      }
    }

    test('audits declared skills in dependency order', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      const declarations = `["example/harness:ki-feature"]

["example/harness:ki-foundation"]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit --reporter-levels info')

      expect(result.exitCode).toBe(0)
      expect(result.output.indexOf('example/harness:ki-foundation')).toBeLessThan(
        result.output.indexOf('example/harness:ki-feature')
      )
      expect(result.output).toContain('[Order (R-1)] — ki-foundation')
      expect(result.output).toContain('[Order (R-1)] — ki-feature')
    })

    test('uses a stable topological order independent of declaration and dependency-list order', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-a-feature', deps: ['ki-z-foundation', 'ki-y-foundation'] },
        { name: 'ki-b-independent', deps: [] },
        { name: 'ki-y-foundation', deps: [] },
        { name: 'ki-z-foundation', deps: [] }
      ])
      const declarations = `["example/harness:ki-z-foundation"]

["example/harness:ki-a-feature"]

["example/harness:ki-y-foundation"]

["example/harness:ki-b-independent"]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit --reporter-levels info')
      const positions = ['ki-b-independent', 'ki-y-foundation', 'ki-z-foundation', 'ki-a-feature'].map((name) =>
        result.output.indexOf(`example/harness:${name}`)
      )

      expect(result.exitCode).toBe(0)
      expect(positions.every((position) => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((left, right) => left - right))
    })

    test('refuses a declared skill whose dependency is undeclared', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await box.project.write('.ki-config.toml', '["example/harness:ki-feature"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('requires declared dependency ki-foundation')
    })

    test('loads an optional dependency only when it is declared', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-delegation', deps: [] },
        { name: 'ki-batch', deps: [], optionalDeps: ['ki-delegation'] }
      ])
      await box.project.write('.ki-config.toml', '["example/harness:ki-batch"]\n')

      const absent = await box.run('ki repo audit --skill ki-batch --reporter-levels info')
      await box.project.write('.ki-config.toml', '["example/harness:ki-batch"]\n["example/harness:ki-delegation"]\n')
      const active = await box.run('ki repo audit --skill ki-batch --reporter-levels info')

      expect(absent.exitCode).toBe(0)
      expect(absent.output).toContain('[Order (R-1)] — ki-batch')
      expect(active.exitCode).toBe(0)
      expect(active.output.indexOf('example/harness:ki-delegation')).toBeLessThan(
        active.output.indexOf('example/harness:ki-batch')
      )
    })

    test('refuses a dependency cycle between declared skills', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-first', deps: ['ki-second'] },
        { name: 'ki-second', deps: ['ki-first'] }
      ])
      const declarations = `["example/harness:ki-first"]

["example/harness:ki-second"]
`
      await box.project.write('.ki-config.toml', declarations)

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has a dependency cycle')
    })

    test('refuses --skill naming a skill not among the declared skills', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [{ name: 'ki-foundation', deps: [] }])
      await box.project.write('.ki-config.toml', '["example/harness:ki-foundation"]\n')

      const result = await box.run('ki repo audit --skill ki-nonexistent')

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('--skill must name one declared resolved skill')
    })

    test('refuses a declared skill not available from any installed harness', async () => {
      const box = await sandbox()
      await box.project.write('.ki-config.toml', '["example/harness:ki-missing"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('requires installed harness example/harness')
    })

    test('refuses a declared skill missing from its installed provider', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.project.write('.ki-config.toml', '["example/harness:ki-missing"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('installed harness example/harness does not provide declared skill ki-missing')
    })

    test('uses the declared provider when another installed harness provides the same skill', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [{ name: 'ki-shared', deps: [] }])
      const base = 'ki/harnesses/other/harness/skills/ki-shared'
      await box.data.write(`${base}/SKILL.md`, '---\nname: ki-shared\nki-depends-on: []\n---\n')
      await box.project.write('.ki-config.toml', '["example/harness:ki-shared"]\n')

      const result = await box.run('ki repo audit')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('example/harness:ki-shared')
      expect(result.output).not.toContain('other/harness:ki-shared')
    })

    test('selecting one skill by --skill pulls in its declared dependency', async () => {
      const box = await sandbox()
      await installSkillsHarness(box.data, [
        { name: 'ki-foundation', deps: [] },
        { name: 'ki-feature', deps: ['ki-foundation'] }
      ])
      await box.project.write(
        '.ki-config.toml',
        '["example/harness:ki-feature"]\n\n["example/harness:ki-foundation"]\n'
      )

      const result = await box.run('ki repo audit --skill example/harness:ki-feature --reporter-levels info')

      expect(result.exitCode).toBe(0)
      expect(result.output.indexOf('example/harness:ki-foundation')).toBeLessThan(
        result.output.indexOf('example/harness:ki-feature')
      )
    })
  })
})
