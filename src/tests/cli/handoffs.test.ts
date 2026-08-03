import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const handoffIdentity = 'knowledgeislands/ki-agentic-harness:ki-handoffs'

const repositoryConfiguration = (identity: string, peers: readonly string[] | undefined): string =>
  [
    '["knowledgeislands/ki-agentic-harness:ki-repo"]',
    'title = "Test repository"',
    'description = "Handoff fixture."',
    'repo_code = "TEST"',
    '',
    `["${handoffIdentity}"]`,
    ...(peers === undefined ? [] : [`identity = "${identity}"`, `peers = [${peers.map((peer) => JSON.stringify(peer)).join(', ')}]`]),
    ''
  ].join('\n')

const localConfiguration = (repositories: readonly string[]): string =>
  [
    'schema = 1',
    '',
    '[agents]',
    'ids = []',
    '',
    '[harnesses]',
    'ids = []',
    '',
    '[skills]',
    '',
    '[repositories]',
    'paths = [',
    ...repositories.map((path) => `  ${JSON.stringify(path)},`),
    ']',
    ''
  ].join('\n')

const configuredPair = async () => {
  const box = await sandbox()
  const source = await realpath(box.project.path)
  const receiver = await box.project.mkdir('receiver')
  await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', ['example/receiver']))
  await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', ['example/source']))
  await box.config.write('ki/config.toml', localConfiguration([source, receiver]))
  return { box, source, receiver }
}

describe('[ki handoffs]', () => {
  test('initialises a declared local route identity, reports reciprocal state, and removes only the local peer declaration', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    await box.project.write('.ki-config.toml', repositoryConfiguration('', undefined))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', ['example/source']))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))

    const added = await box.run('ki handoffs routes add example/receiver --identity example/source')
    const listed = await box.run('ki handoffs routes list')
    const checked = await box.run('ki handoffs routes check example/receiver')
    const removed = await box.run('ki handoffs routes remove example/receiver')

    expect(added).toEqual({ exitCode: 0, output: 'ki handoffs routes add: example/source -> example/receiver\n' })
    expect(listed).toEqual({ exitCode: 0, output: 'ki handoffs routes list\nIdentity: example/source\nRoutes:\n  example/receiver [active]\n' })
    expect(checked).toEqual({ exitCode: 0, output: 'ki handoffs routes check\n  example/receiver: active\n' })
    expect(removed).toEqual({ exitCode: 0, output: 'ki handoffs routes remove: example/source -> example/receiver\n' })
    expect(await box.project.read('receiver/.ki-config.toml')).toContain('peers = ["example/source"]')
    expect(await box.project.read('.ki-config.toml')).toContain('peers = []')
  })

  test('creates, receives, displays, releases, and prunes a handoff while each command writes only its local repository', async () => {
    const { box } = await configuredPair()
    const created = await box.run(
      [
        'ki',
        'handoffs',
        'new',
        '--to',
        'example/receiver',
        '--title',
        'Route contract',
        '--source-ref',
        'KI-TOOL-CLI-012',
        '--context',
        'The host needs an executable contract.',
        '--submission',
        'Adopt the route command surface.',
        '--constraints',
        'The receiver keeps roadmap authority.'
      ],
      { now: () => Date.UTC(2026, 7, 3, 12, 0, 0) }
    )
    const id = /HND-[0-9a-f-]+/u.exec(created.output)?.[0]
    expect(created).toMatchObject({ exitCode: 0 })
    expect(id).toMatch(/^HND-[0-9a-f]{8}-/u)
    const outbound = await box.project.read(`-/_HANDOFFS/example/receiver/${id}.md`)

    box.cd('receiver')
    const received = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id as string])
    const repeated = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id as string])
    const inbound = await box.project.read(`receiver/+/_HANDOFFS/example/source/${id}.md`)
    await box.project.write(
      `receiver/+/_HANDOFFS/example/source/${id}.md`,
      inbound.replace('status: received', 'status: adopted\nadopted_as: "KI-RECEIVER-FND-001"')
    )
    box.cd('..')
    const listed = await box.run('ki handoffs list --repo example/receiver --direction inbound --status adopted')
    const shown = await box.run(['ki', 'handoffs', 'show', id as string])
    const released = await box.run(['ki', 'handoffs', 'release', id as string])
    await expect(box.project.read(`-/_HANDOFFS/example/receiver/${id}.md`)).rejects.toThrow()
    expect(await box.project.read(`receiver/+/_HANDOFFS/example/source/${id}.md`)).toContain('status: adopted')
    box.cd('receiver')
    const pruned = await box.run(['ki', 'handoffs', 'prune', id as string])

    expect(created.output).toBe(`ki handoffs new: created ${id} for example/receiver\n`)
    expect(received).toEqual({ exitCode: 0, output: `ki handoffs receive\n  received ${id}\n` })
    expect(repeated).toEqual({ exitCode: 0, output: `ki handoffs receive\n  existing ${id}\n` })
    expect(listed).toEqual({ exitCode: 0, output: `ki handoffs list\n  example/receiver inbound ${id} [adopted] Route contract\n` })
    expect(shown.output).toContain(`Repository: example/source [outbound]\n${outbound.trimEnd()}`)
    expect(shown.output).toContain(`Repository: example/receiver [inbound]`)
    expect(released).toEqual({ exitCode: 0, output: `ki handoffs release: released ${id}\n` })
    expect(pruned).toEqual({ exitCode: 0, output: `ki handoffs prune: pruned ${id}\n` })
    await expect(box.project.read(`receiver/+/_HANDOFFS/example/source/${id}.md`)).rejects.toThrow()
  })

  test('refuses route and lifecycle operations without reciprocal terminal evidence or local ownership', async () => {
    const { box } = await configuredPair()
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', []))
    const nonreciprocal = await box.run([
      'ki',
      'handoffs',
      'new',
      '--to',
      'example/receiver',
      '--title',
      'Title',
      '--source-ref',
      'SOURCE',
      '--context',
      'Context',
      '--submission',
      'Submission',
      '--constraints',
      'Constraints'
    ])
    const check = await box.run('ki handoffs routes check')
    const unknown = await box.run('ki handoffs show HND-00000000-0000-0000-0000-000000000000')
    const badAddress = await box.run('ki handoffs routes add Example/Receiver')

    expect(nonreciprocal).toEqual({ exitCode: 2, output: 'ki: error: handoff route example/receiver is nonreciprocal\n' })
    expect(check).toEqual({ exitCode: 0, output: 'ki handoffs routes check\n  example/receiver: nonreciprocal\n' })
    expect(unknown).toEqual({
      exitCode: 2,
      output: 'ki: error: handoff HND-00000000-0000-0000-0000-000000000000 was not found in the registered repository estate\n'
    })
    expect(badAddress).toEqual({ exitCode: 2, output: 'ki: error: handoff peer must use canonical lower-case owner/repository form\n' })
  })

  test('rejects malformed local declarations and premature receiver lifecycle cleanup', async () => {
    const { box } = await configuredPair()
    await box.project.write('.ki-config.toml', repositoryConfiguration('Example/source', ['example/receiver']))
    const invalidIdentity = await box.run('ki handoffs routes list')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', ['example/receiver', 'example/receiver']))
    const repeatedPeer = await box.run('ki handoffs routes list')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', ['example/receiver']))
    const created = await box.run([
      'ki',
      'handoffs',
      'new',
      '--to',
      'example/receiver',
      '--title',
      'Title',
      '--source-ref',
      'SOURCE',
      '--context',
      'Context',
      '--submission',
      'Submission',
      '--constraints',
      'Constraints'
    ])
    const id = /HND-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    const premature = await box.run(['ki', 'handoffs', 'prune', id])

    expect(invalidIdentity.exitCode).toBe(2)
    expect(invalidIdentity.output).toContain('.identity must use canonical')
    expect(repeatedPeer.exitCode).toBe(2)
    expect(repeatedPeer.output).toContain('.peers must be unique and lexical')
    expect(premature).toEqual({ exitCode: 2, output: `ki: error: handoff ${id} cannot be pruned while receiver status is received\n` })
  })
})
