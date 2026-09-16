import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { makeCapture } from '../_chatgpt_helper.ts'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

interface AdapterSkill {
  readonly name: string
  readonly adapter: string
  readonly actions: readonly string[]
  readonly repositoryProperties?: readonly string[]
  readonly invocationProperties?: readonly string[]
  readonly extra?: readonly string[]
}

const installSkills = async (box: Sandbox, skills: readonly AdapterSkill[]): Promise<void> => {
  await box.setupCanonicalHarness()
  for (const skill of skills) {
    await box.data.write(
      `ki/harnesses/knowledgeislands/ki-agentic-harness/skills/environment/${skill.name}/SKILL.md`,
      [
        '---',
        `name: ${skill.name}`,
        'ki-depends-on: []',
        `ki-acquire-adapter: ${skill.adapter}`,
        `ki-acquire-actions: [${skill.actions.join(', ')}]`,
        `ki-acquire-repository-properties: [${(skill.repositoryProperties ?? []).join(', ')}]`,
        `ki-acquire-invocation-properties: [${(skill.invocationProperties ?? []).join(', ')}]`,
        'ki-acquire-capabilities: [source-read]',
        'ki-acquire-omissions: [provider-omission]',
        'ki-acquire-mutation-boundary: read-only',
        'ki-acquire-checkpoint: generation',
        'ki-acquire-reset-scopes: [adapter, source, component, rebuild]',
        ...(skill.extra ?? []),
        '---',
        ''
      ].join('\n')
    )
  }
}

const repository = async (
  box: Sandbox,
  skills: readonly { readonly name: string; readonly configuration?: readonly string[] }[] = []
): Promise<void> => {
  await box.project.write(
    '.ki.toml',
    [
      '[repo]',
      'harnesses = ["knowledgeislands/ki-agentic-harness"]',
      '',
      '[skills.ki-repo]',
      'repository = "https://github.com/example/acquisition-target"',
      '',
      ...skills.flatMap((skill) => [`[skills.${skill.name}]`, ...(skill.configuration ?? []), ''])
    ].join('\n')
  )
}

const chatgpt: AdapterSkill = {
  name: 'ki-acquire-chatgpt',
  adapter: 'chatgpt',
  actions: ['import'],
  repositoryProperties: ['capture_path', 'output_path'],
  invocationProperties: ['capture', 'output']
}

const granola: AdapterSkill = {
  name: 'ki-acquire-granola',
  adapter: 'granola',
  actions: ['import', 'status', 'reconcile', 'reset'],
  repositoryProperties: ['folder_ids', 'duplicate_folder_ids', 'unfoldered', 'residual'],
  invocationProperties: ['refresh-transcripts']
}

describe('[ki acquire adapter selection]', () => {
  test('lists zero, available, enabled, and missing-executable adapters', async () => {
    const empty = await sandbox()
    await installSkills(empty, [])
    await repository(empty)
    const zero = await empty.run('ki acquire list')
    expect(zero.exitCode).toBe(0)
    expect(zero.output).toContain('No acquisition adapters are published')

    const box = await sandbox()
    await installSkills(box, [chatgpt, granola, { ...chatgpt, name: 'ki-acquire-claude', adapter: 'claude' }])
    await repository(box, [{ name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }])
    const result = await box.run('ki acquire list')
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('granola · enabled')
    expect(result.output).toContain('chatgpt · available')
    expect(result.output).toContain('claude · invalid')
    expect(result.output).toContain('Executable: missing')
    expect(result.output).toContain('ki skill add ki-acquire-chatgpt')
    expect(result.output).toContain('declare [skills.ki-acquire-chatgpt] in .ki.toml')
  })

  test('infers exactly one adapter and rejects ambiguous, unknown, unresolved, or unsupported selections', async () => {
    const captureBox = await sandbox()
    const capture = await makeCapture(captureBox.root.path)
    const output = join(captureBox.root.path, 'inferred.kep')
    await installSkills(captureBox, [chatgpt])
    await repository(captureBox, [
      {
        name: 'ki-acquire-chatgpt',
        configuration: [`capture_path = ${JSON.stringify(capture.path)}`, `output_path = ${JSON.stringify(output)}`]
      }
    ])
    const inferred = await captureBox.run('ki acquire import --dry-run')
    expect(inferred.exitCode, inferred.output).toBe(0)
    expect(inferred.output).toContain('KEP plan:')

    const multiple = await sandbox()
    await installSkills(multiple, [chatgpt, granola])
    await repository(multiple, [
      { name: 'ki-acquire-chatgpt' },
      { name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }
    ])
    const ambiguous = await multiple.run('ki acquire import')
    expect(ambiguous.exitCode).toBe(2)
    expect(ambiguous.output).toContain('adapter selection is ambiguous (chatgpt, granola)')
    expect((await multiple.run('ki acquire import --adapter granola --all')).output).toContain(
      '--adapter and --all are mutually exclusive'
    )
    expect((await multiple.run('ki acquire import --adapter unknown')).output).toContain('unknown; run ki acquire list')
    expect((await multiple.run('ki acquire status --adapter chatgpt')).output).toContain('does not support status')

    const unresolved = await sandbox()
    await installSkills(unresolved, [])
    await repository(unresolved, [{ name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }])
    const unresolvedList = await unresolved.run('ki acquire list')
    expect(unresolvedList.output).toContain('granola · invalid')
    expect(unresolvedList.output).toContain('declared acquisition skill is unresolved')

    const none = await sandbox()
    await installSkills(none, [])
    await repository(none)
    expect((await none.run('ki acquire import')).output).toContain('no acquisition adapter is enabled')
    expect((await none.run('ki acquire import --all')).output).toContain(
      'no enabled acquisition adapter supports import'
    )
  })

  test('rejects duplicate published adapter identities', async () => {
    const box = await sandbox()
    await installSkills(box, [granola, { ...granola, name: 'ki-acquire-granola-alternate' }])
    await repository(box, [
      { name: 'ki-acquire-granola', configuration: ['unfoldered = true'] },
      { name: 'ki-acquire-granola-alternate', configuration: ['unfoldered = true'] }
    ])
    const result = await box.run('ki acquire list')
    expect(result.output).toContain('granola · invalid')
    expect(result.output).toContain('adapter is published by both')
    expect(result.output).toContain('remove duplicate acquisition adapter declaration')
  })

  test('allows common options with --all and rejects adapter invocation properties before execution', async () => {
    const box = await sandbox()
    const capture = await makeCapture(box.root.path)
    const output = join(box.root.path, 'all.kep')
    await installSkills(box, [chatgpt])
    await repository(box, [
      {
        name: 'ki-acquire-chatgpt',
        configuration: [`capture_path = ${JSON.stringify(capture.path)}`, `output_path = ${JSON.stringify(output)}`]
      }
    ])
    const all = await box.run('ki acquire import --all --dry-run --since 2026-01-01')
    expect(all.exitCode, all.output).toBe(0)
    expect(all.output).toContain('Dry run: no files written.')
    const override = await box.run('ki acquire import --all --refresh-transcripts')
    expect(override.exitCode).toBe(2)
    expect(override.output).toContain('--refresh-transcripts cannot be combined with --all')
    const inferredOverride = await box.run('ki acquire import --capture capture --output out')
    expect(inferredOverride.exitCode).toBe(2)
    expect(inferredOverride.output).toContain('requires explicit --adapter <name>')
  })

  test('validates ChatGPT persistent configuration and claimed unsupported actions', async () => {
    const missing = await sandbox()
    await installSkills(missing, [{ ...chatgpt, actions: ['import', 'status', 'reset'] }])
    await repository(missing, [{ name: 'ki-acquire-chatgpt' }])
    expect((await missing.run('ki acquire import --adapter chatgpt')).output).toContain(
      'requires --capture and --output'
    )
    expect((await missing.run('ki acquire status --adapter chatgpt')).output).toContain(
      'has no executable status implementation'
    )
    expect((await missing.run('ki acquire reset --adapter chatgpt')).output).toContain(
      'has no executable reset implementation'
    )

    const malformed = await sandbox()
    await installSkills(malformed, [chatgpt])
    await repository(malformed, [
      { name: 'ki-acquire-chatgpt', configuration: ['capture_path = true', 'output_path = "out.kep"'] }
    ])
    expect((await malformed.run('ki acquire import --adapter chatgpt')).output).toContain(
      'capture_path must be non-empty string'
    )

    const relative = await sandbox()
    const capture = await makeCapture(relative.root.path)
    await installSkills(relative, [chatgpt])
    await repository(relative, [
      {
        name: 'ki-acquire-chatgpt',
        configuration: [`capture_path = ${JSON.stringify(capture.path)}`, 'output_path = "relative.kep"']
      }
    ])
    const result = await relative.run('ki acquire import --adapter chatgpt --dry-run')
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain(join(relative.project.path, 'relative.kep'))
  })

  test('reports invalid metadata and repository properties without contacting an adapter', async () => {
    const badMetadata = await sandbox()
    await installSkills(badMetadata, [{ ...granola, extra: ['ki-acquire-extra: invalid'] }])
    await repository(badMetadata, [{ name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }])
    const metadata = await badMetadata.run('ki acquire list')
    expect(metadata.output).toContain('granola · invalid')
    expect(metadata.output).toContain('unsupported field ki-acquire-extra')

    const badConfiguration = await sandbox()
    await installSkills(badConfiguration, [granola])
    await repository(badConfiguration, [
      { name: 'ki-acquire-granola', configuration: ['unfoldered = true', 'unknown = true'] }
    ])
    const configuration = await badConfiguration.run('ki acquire import --adapter granola')
    expect(configuration.exitCode).toBe(2)
    expect(configuration.output).toContain('unsupported property unknown')
  })

  test.each([
    {
      name: 'missing field',
      mutate: (value: string) => value.replace('ki-acquire-checkpoint: generation\n', ''),
      expected: 'missing field ki-acquire-checkpoint'
    },
    {
      name: 'malformed list',
      mutate: (value: string) =>
        value.replace('ki-acquire-actions: [import, status, reconcile, reset]', 'ki-acquire-actions: import'),
      expected: 'list fields must use flow-list syntax'
    },
    {
      name: 'repeated list value',
      mutate: (value: string) =>
        value.replace('ki-acquire-actions: [import, status, reconcile, reset]', 'ki-acquire-actions: [import, import]'),
      expected: 'list fields must not repeat values'
    },
    {
      name: 'empty actions',
      mutate: (value: string) =>
        value.replace('ki-acquire-actions: [import, status, reconcile, reset]', 'ki-acquire-actions: []'),
      expected: 'actions must be a non-empty list'
    },
    {
      name: 'unknown action',
      mutate: (value: string) =>
        value.replace('ki-acquire-actions: [import, status, reconcile, reset]', 'ki-acquire-actions: [publish]'),
      expected: 'actions must be a non-empty list'
    },
    {
      name: 'mutable provider',
      mutate: (value: string) =>
        value.replace('ki-acquire-mutation-boundary: read-only', 'ki-acquire-mutation-boundary: write'),
      expected: 'mutation boundary must be read-only'
    },
    {
      name: 'invalid adapter',
      mutate: (value: string) => value.replace('ki-acquire-adapter: granola', 'ki-acquire-adapter: Granola'),
      expected: 'adapter must be lower-case hyphenated ID'
    },
    {
      name: 'invalid checkpoint',
      mutate: (value: string) =>
        value.replace('ki-acquire-checkpoint: generation', 'ki-acquire-checkpoint: Detail/Transcript'),
      expected: 'checkpoint must be lower-case hyphenated ID'
    },
    {
      name: 'invalid property',
      mutate: (value: string) =>
        value.replace('ki-acquire-capabilities: [source-read]', 'ki-acquire-capabilities: [Source Read]'),
      expected: 'property and capability values must be lower-case hyphenated IDs'
    }
  ])('lists $name acquisition metadata as invalid', async ({ mutate, expected }) => {
    const box = await sandbox()
    await installSkills(box, [granola])
    const path = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/environment/ki-acquire-granola/SKILL.md'
    await box.data.write(path, mutate(await box.data.read(path)))
    await repository(box, [{ name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }])
    const result = await box.run('ki acquire list')
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain(expected)
  })

  test('rejects repeated skill frontmatter fields before adapter discovery', async () => {
    const box = await sandbox()
    await installSkills(box, [granola])
    const path = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/environment/ki-acquire-granola/SKILL.md'
    await box.data.write(
      path,
      (await box.data.read(path)).replace(
        'name: ki-acquire-granola',
        'name: ki-acquire-granola\nname: ki-acquire-granola'
      )
    )
    await repository(box)
    const result = await box.run('ki acquire list')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('repeats frontmatter field name')
  })

  test('removes provider-first grammar', async () => {
    const box = await sandbox()
    await installSkills(box, [granola])
    await repository(box, [{ name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }])
    const result = await box.run('ki acquire granola import')
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain("unknown subcommand 'granola'")
  })

  test('distinguishes invalid published metadata from declared but unresolved providers', async () => {
    const invalid = await sandbox()
    await installSkills(invalid, [
      { ...granola, extra: ['ki-acquire-extra: invalid'] },
      {
        name: 'ki-custom-acquisition',
        adapter: 'custom',
        actions: ['import'],
        extra: ['ki-acquire-extra: invalid']
      }
    ])
    await repository(invalid)
    const listed = await invalid.run('ki acquire list')
    expect(listed.exitCode, listed.output).toBe(0)
    expect(listed.output).toContain('Configuration: not-declared')
    expect(listed.output).toContain('ki-custom-acquisition · invalid')

    const unresolved = await sandbox()
    await installSkills(unresolved, [granola])
    await repository(unresolved, [{ name: 'ki-acquire-granola', configuration: ['unfoldered = true'] }])
    await unresolved.project.write(
      '.ki.toml',
      (await unresolved.project.read('.ki.toml')).replace(
        'harnesses = ["knowledgeislands/ki-agentic-harness"]',
        'harnesses = ["other/harness"]'
      )
    )
    const result = await unresolved.run('ki acquire list')
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('granola · invalid')
    expect(result.output).toContain('does not declare provider Harness')
    expect(result.output).toContain('declare knowledgeislands/ki-agentic-harness')
  })
})
