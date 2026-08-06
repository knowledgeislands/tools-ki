import { expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

test('repo audit strips complete terminal control sequences from finding messages', async () => {
  const box = await sandbox()
  await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
  await box.setupExampleHarness({
    rubric: `
export default {
  contract: 1,
  name: 'ki-example',
  concern: 'rendering test',
  createSession: () => ({
    subjects: [{ families: ['F'], context: () => ({}) }],
    proposal: () => ({ writes: [] })
  }),
  families: [{
    code: 'F',
    title: 'Family',
    description: 'Exercises finding rendering.',
    standard: 'standard.md',
    selectContext: (context) => context,
    items: [{
      code: 'EXAMPLE-1',
      title: 'Example',
      description: 'Emits terminal styling in a finding.',
      sources: ['standard.md'],
      mechanical: {
        level: 'FAIL',
        remediation: { class: 'diagnostic', guidance: 'Diagnose the reported evidence.' },
        audit: {
          phase: 'PRIMARY',
          run: () => [
            {
              status: 'INFO',
              message: 'default user model pinned: claude-fable-5\\u001b[1m; \\u001b]8;;https://example.test\\u0007linked\\u001b]8;;\\u0007\\nfirst continuation'
            },
            { status: 'INFO', message: 'second line\\nsecond continuation' }
          ]
        }
      }
    }]
  }]
}
`
  })

  const result = await box.run('ki repo audit --reporter-levels info')

  expect(result.exitCode).toBe(0)
  expect(result.output.match(/default user model pinned: claude-fable-5; linked/g)).toHaveLength(1)
  expect(result.output).toContain('first continuation')
  expect(result.output).toContain('second continuation')
  expect(result.output).not.toContain('\x1b')
  expect(result.output).not.toContain('[1m]')
})
