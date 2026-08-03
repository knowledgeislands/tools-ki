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

  test('surfaces malformed route and record evidence through CLI operations', async () => {
    const { box } = await configuredPair()
    await box.project.write('.ki-config.toml', '[not valid TOML\n')
    const invalidToml = await box.run('ki handoffs routes list')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', []).replace('peers = []', 'peers = [1]'))
    const invalidPeers = await box.run('ki handoffs routes list')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', ['example/receiver']))
    const firstRoute = await box.run('ki handoffs routes add example/another')
    const secondRoute = await box.run('ki handoffs routes add example/third')
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
    const outboundPath = `-/_HANDOFFS/example/receiver/${id}.md`
    const outbound = await box.project.read(outboundPath)
    await box.project.write(outboundPath, outbound.replace('title: "Title"', 'title: "Title'))
    box.cd('receiver')
    const malformedQuotedField = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    box.cd('..')
    await box.project.write(outboundPath, outbound.replace('## Constraints\n\nConstraints', '## Constraints\n\n'))
    box.cd('receiver')
    const missingPayload = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    box.cd('..')
    await box.project.write(outboundPath, outbound)
    box.cd('receiver')
    await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    const inboundPath = `receiver/+/_HANDOFFS/example/source/${id}.md`
    const inbound = await box.project.read(inboundPath)
    await box.project.write(inboundPath, inbound.replace('status: received', 'status: parked'))
    box.cd('..')
    const missingRationale = await box.run(['ki', 'handoffs', 'release', id])
    box.cd('receiver')
    await box.project.write(inboundPath, inbound)
    box.cd('..')
    const receivedCannotRelease = await box.run(['ki', 'handoffs', 'release', id])

    expect(invalidToml.output).toContain('must be valid TOML')
    expect(invalidPeers.output).toContain('.peers must be a canonical address array')
    expect(firstRoute.exitCode).toBe(0)
    expect(secondRoute.exitCode).toBe(0)
    expect(malformedQuotedField.output).toContain('has invalid handoff frontmatter')
    expect(missingPayload.output).toContain('must carry non-empty Context, Submission, and Constraints sections')
    expect(missingRationale.output).toContain('requires rationale for status parked')
    expect(receivedCannotRelease).toEqual({ exitCode: 2, output: `ki: error: handoff ${id} cannot be released while receiver status is received\n` })
  })

  test('handles missing registered configuration and handoff paths without treating them as peer state', async () => {
    const { box, source, receiver } = await configuredPair()
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, `${box.root.path}/missing`]))
    const emptyEstate = await box.run('ki handoffs list')
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
    const missingInbound = await box.run(['ki', 'handoffs', 'release', id])
    const badDirection = await box.run('ki handoffs list --direction sideways')

    expect(emptyEstate).toEqual({ exitCode: 0, output: 'ki handoffs list\n  none\n' })
    expect(missingInbound).toEqual({ exitCode: 2, output: `ki: error: receiver has not recorded an inbound handoff ${id}\n` })
    expect(badDirection).toEqual({ exitCode: 2, output: 'ki: error: --direction accepts inbound or outbound\n' })
  })

  test('reports an empty reciprocal sender directory without creating peer state', async () => {
    const { box } = await configuredPair()
    box.cd('receiver')
    const result = await box.run('ki handoffs receive --from example/source')

    expect(result).toEqual({ exitCode: 0, output: 'ki handoffs receive\n' })
  })

  test('rejects malformed command grammar and incomplete local route declarations', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    await box.project.write('.ki-config.toml', repositoryConfiguration('', undefined))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', ['example/source']))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))

    const missingIdentity = await box.run('ki handoffs routes add example/receiver')
    const added = await box.run('ki handoffs routes add example/receiver --identity example/source')
    const mismatchedIdentity = await box.run('ki handoffs routes add example/another --identity example/other')
    const selfRoute = await box.run('ki handoffs routes add example/source')
    const absentRoute = await box.run('ki handoffs routes remove example/another')
    const undeclaredRoute = await box.run('ki handoffs routes check example/another')
    const emptyTitle = await box.run([
      'ki',
      'handoffs',
      'new',
      '--to',
      'example/receiver',
      '--title',
      '   ',
      '--source-ref',
      'source',
      '--context',
      'context',
      '--submission',
      'submission',
      '--constraints',
      'constraints'
    ])
    const invalidId = await box.run('ki handoffs receive --from example/source --id HND-invalid')
    const invalidRepository = await box.run('ki handoffs list --repo Example/receiver')

    expect(missingIdentity).toEqual({
      exitCode: 2,
      output: 'ki: error: ki handoffs routes add requires --identity when the local handoff identity is not configured\n'
    })
    expect(added.exitCode).toBe(0)
    expect(mismatchedIdentity).toEqual({ exitCode: 2, output: 'ki: error: --identity must match the configured local handoff identity\n' })
    expect(selfRoute).toEqual({ exitCode: 2, output: 'ki: error: handoff route peer must differ from the local identity\n' })
    expect(absentRoute).toEqual({ exitCode: 2, output: 'ki: error: handoff route example/another is not declared locally\n' })
    expect(undeclaredRoute).toEqual({ exitCode: 2, output: 'ki: error: handoff route example/another is not declared locally\n' })
    expect(emptyTitle).toEqual({ exitCode: 2, output: 'ki: error: --title is required and must be non-empty\n' })
    expect(invalidId).toEqual({ exitCode: 2, output: 'ki: error: --id must use HND- followed by a lower-case UUID\n' })
    expect(invalidRepository).toEqual({ exitCode: 2, output: 'ki: error: --repo must use canonical lower-case owner/repository form\n' })
  })

  test('reports unusable local configuration and inactive registered-estate routes', async () => {
    const unbootstrapped = await sandbox()
    await unbootstrapped.project.write('.ki-config.toml', repositoryConfiguration('example/source', []))
    const missingUserConfiguration = await unbootstrapped.run('ki handoffs routes list')

    const { box, source, receiver } = await configuredPair()
    await box.config.write('ki/config.toml', 'not valid TOML')
    const invalidUserConfiguration = await box.run('ki handoffs routes list')
    await box.config.write('ki/config.toml', localConfiguration([receiver]))
    const unregisteredLocalRepository = await box.run('ki handoffs routes list')
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))
    await box.project.write('.ki-config.toml', '["knowledgeislands/ki-agentic-harness:ki-repo"]\ntitle = "Test"\n')
    const missingDeclaration = await box.run('ki handoffs routes list')
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration('example/source', ['example/receiver']).replace('peers = ["example/receiver"]', 'peers = ["example/receiver"]\nunknown = true')
    )
    const unknownDeclarationField = await box.run('ki handoffs routes list')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', ['example/source']))
    const selfPeer = await box.run('ki handoffs routes list')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', ['example/missing']))
    const missingPeer = await box.run('ki handoffs routes check')

    expect(missingUserConfiguration).toEqual({ exitCode: 1, output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n' })
    expect(invalidUserConfiguration.output).toContain('ki configuration is invalid:')
    expect(unregisteredLocalRepository).toEqual({
      exitCode: 2,
      output: 'ki: error: current KI repository is not registered in the local KI repository estate\n'
    })
    expect(missingDeclaration.output).toContain('does not declare [knowledgeislands/ki-agentic-harness:ki-handoffs]')
    expect(unknownDeclarationField.output).toContain('has unrecognised key unknown')
    expect(selfPeer.output).toContain('.peers must not include its identity')
    expect(missingPeer).toEqual({ exitCode: 0, output: 'ki handoffs routes check\n  example/missing: missing peer\n' })
  })

  test('rejects malformed peer evidence and enforces terminal handoff payload checks', async () => {
    const { box } = await configuredPair()
    const created = await box.run(
      'ki handoffs new --to example/receiver --title Title --source-ref source --context context --submission submission --constraints constraints'
    )
    const id = /HND-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const outboundPath = `-/_HANDOFFS/example/receiver/${id}.md`
    const outbound = await box.project.read(outboundPath)

    await box.project.write(outboundPath, outbound.replace('sender: example/source', 'sender: example/other'))
    box.cd('receiver')
    const mismatchedSender = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    box.cd('..')
    await box.project.write(outboundPath, outbound)
    box.cd('receiver')
    const missingRequested = await box.run('ki handoffs receive --from example/source --id HND-00000000-0000-0000-0000-000000000000')
    const received = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    const inboundPath = `receiver/+/_HANDOFFS/example/source/${id}.md`
    const inbound = await box.project.read(inboundPath)

    await box.project.write(inboundPath, inbound.replace('status: received', 'status: adopted'))
    box.cd('..')
    const missingAdoption = await box.run(['ki', 'handoffs', 'release', id])
    box.cd('receiver')
    await box.project.write(inboundPath, inbound.replace('status: received', 'status: superseded\nrationale: "later work"'))
    box.cd('..')
    const missingSupersession = await box.run(['ki', 'handoffs', 'release', id])
    box.cd('receiver')
    await box.project.write(
      inboundPath,
      inbound
        .replace('status: received', 'status: adopted\nadopted_as: "KI-RECEIVER-FND-001"')
        .replace('title: "Title"', 'title: "Changed"')
        .replace(`# ${id}: Title`, `# ${id}: Changed`)
    )
    box.cd('..')
    const changedPayload = await box.run(['ki', 'handoffs', 'release', id])
    box.cd('receiver')
    await box.project.write(inboundPath, inbound.replace('status: received', 'status: adopted\nadopted_as: "KI-RECEIVER-FND-001"'))
    const prematurePrune = await box.run(['ki', 'handoffs', 'prune', id])

    expect(mismatchedSender.output).toContain('does not match the active handoff route')
    expect(missingRequested).toEqual({
      exitCode: 2,
      output: 'ki: error: outbound handoff HND-00000000-0000-0000-0000-000000000000 was not found for example/receiver\n'
    })
    expect(received.exitCode).toBe(0)
    expect(missingAdoption.output).toContain('requires adopted_as for status adopted')
    expect(missingSupersession.output).toContain('requires superseded_by for status superseded')
    expect(changedPayload.output).toContain('does not preserve the sender payload')
    expect(prematurePrune).toEqual({
      exitCode: 2,
      output: `ki: error: handoff ${id} cannot be pruned before sender release is observable\n`
    })
  })

  test('rejects peer records whose filename differs from their declared handoff identity', async () => {
    const { box } = await configuredPair()
    const created = await box.run(
      'ki handoffs new --to example/receiver --title Title --source-ref source --context context --submission submission --constraints constraints'
    )
    const id = /HND-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const outbound = await box.project.read(`-/_HANDOFFS/example/receiver/${id}.md`)
    await box.project.write('-/_HANDOFFS/example/receiver/HND-00000000-0000-0000-0000-000000000000.md', outbound)

    const result = await box.run('ki handoffs list')

    expect(result.output).toContain(`filename must match handoff id ${id}`)
  })

  test('rejects every malformed sender envelope that a receiver can observe', async () => {
    const { box } = await configuredPair()
    const created = await box.run(
      'ki handoffs new --to example/receiver --title Title --source-ref source --context context --submission submission --constraints constraints'
    )
    const id = /HND-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const path = `-/_HANDOFFS/example/receiver/${id}.md`
    const outbound = await box.project.read(path)
    box.cd('receiver')

    await box.project.write(path, 'not a handoff')
    const missingFrontmatter = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    await box.project.write(path, outbound.replace('id: ' + id, 'id: HND-invalid'))
    const invalidIdentifier = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    await box.project.write(path, outbound.replace('sender: example/source', 'sender: Example/source'))
    const invalidAddress = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    await box.project.write(path, outbound.replace('source_ref: "source"\n', ''))
    const missingRequiredField = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    await box.project.write(path, outbound.replace('created_at:', 'created_at: invalid #'))
    const invalidTimestamp = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    await box.project.write(path, outbound.replace('source_ref: "source"', 'extra: value'))
    const unknownField = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    await box.project.write(path, outbound.replace('title: "Title"', 'title: "Title"\ntitle: "Again"'))
    const repeatedField = await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])

    expect(missingFrontmatter.output).toContain('must use YAML frontmatter')
    expect(invalidIdentifier.output).toContain('handoff id must use HND-')
    expect(invalidAddress.output).toContain('handoff address must use canonical')
    expect(missingRequiredField.output).toContain('must declare non-empty handoff field source_ref')
    expect(invalidTimestamp.output).toContain('has invalid created_at timestamp')
    expect(unknownField.output).toContain('has unrecognised handoff field extra')
    expect(repeatedField.output).toContain('repeats handoff field title')
  })

  test('rejects malformed receiver evidence and ambiguous or nonlocal records', async () => {
    const { box, source, receiver } = await configuredPair()
    const duplicate = await box.project.mkdir('duplicate')
    await box.project.write('duplicate/.ki-config.toml', repositoryConfiguration('example/receiver', ['example/source']))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, duplicate]))
    const ambiguous = await box.run('ki handoffs routes check')
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))
    const missingRoute = await box.run(
      'ki handoffs new --to example/another --title Title --source-ref source --context context --submission submission --constraints constraints'
    )
    const unknownOutbound = await box.run('ki handoffs release HND-00000000-0000-0000-0000-000000000000')
    const created = await box.run(
      'ki handoffs new --to example/receiver --title Title --source-ref source --context context --submission submission --constraints constraints'
    )
    const id = /HND-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'handoffs', 'receive', '--from', 'example/source', '--id', id])
    const inboundPath = `receiver/+/_HANDOFFS/example/source/${id}.md`
    const inbound = await box.project.read(inboundPath)
    await box.project.write(inboundPath, inbound.replace('status: received', 'status: unknown'))
    box.cd('..')
    const invalidStatus = await box.run(['ki', 'handoffs', 'release', id])
    box.cd('receiver')
    await box.project.write(inboundPath, inbound.replace('status: received', 'status: adopted\nadopted_as: "KI-RECEIVER-FND-001"\nreviewed_at: invalid'))
    box.cd('..')
    const invalidReviewedAt = await box.run(['ki', 'handoffs', 'release', id])

    expect(ambiguous).toEqual({ exitCode: 0, output: 'ki handoffs routes check\n  example/receiver: ambiguous peer\n' })
    expect(missingRoute).toEqual({ exitCode: 2, output: 'ki: error: handoff route example/another is not declared locally\n' })
    expect(unknownOutbound).toEqual({
      exitCode: 2,
      output: 'ki: error: outbound handoff HND-00000000-0000-0000-0000-000000000000 was not found in the current repository\n'
    })
    expect(invalidStatus.output).toContain('has invalid receiver status')
    expect(invalidReviewedAt.output).toContain('has invalid reviewed_at timestamp')
  })

  test('keeps lookup, ownership, and estate traversal local to the invoking repository', async () => {
    const { box } = await configuredPair()
    const first = await box.run(
      'ki handoffs new --to example/receiver --title First --source-ref source --context context --submission submission --constraints constraints'
    )
    const second = await box.run(
      'ki handoffs new --to example/receiver --title Second --source-ref source --context context --submission submission --constraints constraints'
    )
    const firstId = /HND-[0-9a-f-]+/u.exec(first.output)?.[0] as string
    const secondId = /HND-[0-9a-f-]+/u.exec(second.output)?.[0] as string
    await box.project.write('-/_HANDOFFS/not-a-peer', 'not a peer directory')
    await box.run(['ki', 'handoffs', 'show', firstId])
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/other', ['example/receiver']))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', ['example/other']))
    const foreignOutbound = await box.run(['ki', 'handoffs', 'release', firstId])

    box.cd('receiver')
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/other-receiver', ['example/other']))
    const foreignInbound = await box.run(['ki', 'handoffs', 'prune', secondId])

    expect(foreignOutbound).toEqual({ exitCode: 2, output: `ki: error: outbound handoff ${firstId} is not owned by the current repository\n` })
    expect(foreignInbound).toEqual({ exitCode: 2, output: `ki: error: inbound handoff ${secondId} was not found in the current repository\n` })
  })
})
