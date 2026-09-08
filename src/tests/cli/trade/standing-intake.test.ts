import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const home = (identity: string): string => `https://github.com/${identity}`
const sourceHome = home('example/source')
const receiverHome = home('example/receiver')
const commit = 'a'.repeat(40)

const configuration = (
  identity: string,
  peer: string,
  direction: 'export' | 'import',
  options: { readonly subtype?: boolean; readonly standing?: string } = {}
): string =>
  [
    '[repo]',
    'harnesses = ["example/harness"]',
    '',
    '[skills.ki-repo]',
    `repository = ${JSON.stringify(home(identity))}`,
    'title = "Standing intake fixture"',
    'description = "Standing intake fixture."',
    'repo_code = "TEST"',
    '',
    '[skills.ki-trades]',
    ...(options.subtype
      ? ['', '[skills.ki-trades.subtypes.knowledge]', 'shared-maintenance = "Shared maintenance evidence."']
      : []),
    '',
    `[skills.ki-trades.routes.${JSON.stringify(peer)}]`,
    `${direction} = ["knowledge"]`,
    ...(options.standing
      ? [
          '',
          `[skills.ki-trades.routes.${JSON.stringify(peer)}.standing.${direction}]`,
          `knowledge = [${JSON.stringify(options.standing)}]`
        ]
      : []),
    ''
  ].join('\n')

const fixture = async () => {
  const box = await sandbox()
  const source = await realpath(box.project.path)
  const receiver = await box.project.mkdir('receiver')
  await box.project.write('.ki.toml', configuration('example/source', 'example/receiver', 'export'))
  await box.project.write('docs/source.md', '# Source\n\n## Finding\n')
  await box.project.write('receiver/.ki.toml', configuration('example/receiver', 'example/source', 'import'))
  await box.project.write('receiver/docs/capture file.md', '# Capture\n\n## Source analysis\n')
  await box.project.write('receiver/docs/double.md', '# Double\n\n')
  await box.project.write('receiver/docs/plain.md', '# Plain')
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      '',
      '[repositories.project]',
      `repository = ${JSON.stringify(sourceHome)}`,
      `path = ${JSON.stringify(source)}`,
      '',
      '[repositories.receiver]',
      `repository = ${JSON.stringify(receiverHome)}`,
      `path = ${JSON.stringify(receiver)}`,
      ''
    ].join('\n')
  )
  box.setRunner(async (commandName, arguments_) => {
    if (commandName === 'git' && arguments_[2] === 'cat-file') return { exitCode: 0, output: '' }
    return { exitCode: 1, output: 'unsupported command' }
  })
  return { box }
}

describe('[ki trade standing intake]', () => {
  test('defines reciprocal grants and appends one commit-pinned receiver-local capture', async () => {
    const { box } = await fixture()

    const exported = await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--subtype',
      'shared-maintenance'
    ])
    box.cd('receiver')
    const defined = await box.run([
      'ki',
      'trade',
      'subtypes',
      'add',
      'shared-maintenance',
      '--description',
      'Shared maintenance evidence.'
    ])
    const imported = await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'shared-maintenance'
    ])
    await box.run([
      'ki',
      'trade',
      'subtypes',
      'add',
      'another-subtype',
      '--description',
      'A second receiver-owned subtype.'
    ])
    box.cd('..')
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--subtype',
      'another-subtype'
    ])
    expect((await box.run('ki trade standing list')).output).toContain(
      `export knowledge shared-maintenance ${receiverHome}: active`
    )
    box.cd('receiver')
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'another-subtype'
    ])
    const listedSubtypes = await box.run('ki trade subtypes list')
    const checked = await box.run([
      'ki',
      'trade',
      'standing',
      'check',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'shared-maintenance'
    ])
    const captured = await box.run(
      [
        'ki',
        'trade',
        'standing',
        'capture',
        sourceHome,
        '--subtype',
        'shared-maintenance',
        '--source-ref',
        `${commit}:docs/source.md#finding`,
        '--capture',
        'docs/capture file.md#source-analysis'
      ],
      { now: () => Date.UTC(2026, 8, 8, 9, 30, 0) }
    )

    expect(exported).toEqual({
      exitCode: 0,
      output: `ki trade standing add: export knowledge shared-maintenance ${sourceHome} -> ${receiverHome}\n`
    })
    expect(defined.exitCode).toBe(0)
    expect(imported.exitCode).toBe(0)
    expect(listedSubtypes.output).toContain('shared-maintenance: Shared maintenance evidence.')
    expect(checked.output).toContain(`import knowledge shared-maintenance ${sourceHome}: active`)
    expect(captured.output).toMatch(
      /^ki trade standing capture: captured STI-[0-9a-f]{8} in docs\/capture file\.md\n$/u
    )
    const contents = await box.project.read('receiver/docs/capture file.md')
    expect(contents).toContain('<!-- ki-trades:standing-intake -->\n```toml')
    expect(contents).toContain('schema = "ki-trades/standing-intake/v1"')
    expect(contents).toContain(`source = ${JSON.stringify(sourceHome)}`)
    expect(contents).toContain(`source_ref = ${JSON.stringify(`${commit}:docs/source.md#finding`)}`)
    expect(contents).toContain(`receiver = ${JSON.stringify(receiverHome)}`)
    expect(contents).toContain('subtype = "shared-maintenance"')
    expect(contents).toContain('captured_at = "2026-09-08T09:30:00Z"')
    expect(contents).toContain('capture = "docs/capture file.md#source-analysis"')
    for (const capturePath of ['docs/double.md#double', 'docs/plain.md#plain']) {
      expect(
        (
          await box.run(
            [
              'ki',
              'trade',
              'standing',
              'capture',
              sourceHome,
              '--subtype',
              'shared-maintenance',
              '--source-ref',
              `${commit}:docs/source.md#finding`,
              '--capture',
              capturePath
            ],
            { now: () => Date.UTC(2026, 8, 8, 9, 30, 0) }
          )
        ).exitCode
      ).toBe(0)
    }

    const removed = await box.run([
      'ki',
      'trade',
      'standing',
      'remove',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'shared-maintenance'
    ])
    expect(removed.exitCode).toBe(0)
    await box.run([
      'ki',
      'trade',
      'standing',
      'remove',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'another-subtype'
    ])
    expect((await box.run('ki trade standing list')).output).toContain('grants (0)')
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'capture',
          sourceHome,
          '--subtype',
          'shared-maintenance',
          '--source-ref',
          `${commit}:docs/source.md#finding`,
          '--capture',
          'docs/capture file.md#source-analysis'
        ])
      ).output
    ).toContain('not declared locally')
    expect((await box.run(['ki', 'trade', 'subtypes', 'remove', 'shared-maintenance'])).exitCode).toBe(0)
    expect((await box.run(['ki', 'trade', 'subtypes', 'remove', 'another-subtype'])).exitCode).toBe(0)
  })

  test('keeps one-sided and invalid grants closed without touching a peer', async () => {
    const { box } = await fixture()
    box.cd('receiver')
    expect((await box.run('ki trade subtypes list')).output).toContain('subtypes (0)')
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'capture',
          sourceHome,
          '--subtype',
          'shared-maintenance',
          '--source-ref',
          `${commit}:docs/source.md#finding`,
          '--capture',
          'docs/capture file.md#source-analysis'
        ])
      ).output
    ).toContain('not defined by the receiver')
    expect(
      (await box.run(['ki', 'trade', 'subtypes', 'add', 'Bad_Subtype', '--description', 'Invalid'])).output
    ).toContain('lower-case hyphenated identifier')
    expect(
      (await box.run(['ki', 'trade', 'subtypes', 'add', 'shared-maintenance', '--description', ''])).output
    ).toContain('--description is required and must be non-empty')
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'add',
          sourceHome,
          '--direction',
          'import',
          '--subtype',
          'shared-maintenance'
        ])
      ).output
    ).toContain('not defined by the receiver')

    await box.run([
      'ki',
      'trade',
      'subtypes',
      'add',
      'shared-maintenance',
      '--description',
      'Shared maintenance evidence.'
    ])
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'shared-maintenance'
    ])
    expect((await box.run('ki trade standing list --incomplete')).output).toContain('awaiting reciprocal')
    expect((await box.run('ki trade standing check')).output).toContain('GRANTS=1 ACTIVE=0')
    expect(
      (await box.run(['ki', 'trade', 'routes', 'remove', sourceHome, '--direction', 'import', '--kind', 'knowledge']))
        .output
    ).toContain('used by standing subtypes shared-maintenance')
    expect((await box.run(['ki', 'trade', 'subtypes', 'remove', 'shared-maintenance'])).output).toContain(
      `used by standing imports from ${sourceHome}`
    )
    expect((await box.run(['ki', 'trade', 'standing', 'check', receiverHome])).output).toContain(
      'is not declared locally'
    )
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'capture',
          sourceHome,
          '--subtype',
          'shared-maintenance',
          '--source-ref',
          'not-a-ref',
          '--capture',
          '../peer.md#finding'
        ])
      ).output
    ).toContain('awaiting reciprocal')
    await box.project.write(
      '.ki.toml',
      configuration('example/source', 'example/receiver', 'export').split('[skills.ki-trades.routes')[0] as string
    )
    expect((await box.run('ki trade standing list --incomplete')).output).toContain('awaiting sender')
  })

  test('refuses malformed, unresolved, or non-local capture targets after an exact grant activates', async () => {
    const { box } = await fixture()
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--subtype',
      'shared-maintenance'
    ])
    box.cd('receiver')
    await box.run([
      'ki',
      'trade',
      'subtypes',
      'add',
      'shared-maintenance',
      '--description',
      'Shared maintenance evidence.'
    ])
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'remove',
          sourceHome,
          '--direction',
          'import',
          '--subtype',
          'shared-maintenance'
        ])
      ).output
    ).toContain('is not declared locally')
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      sourceHome,
      '--direction',
      'import',
      '--subtype',
      'shared-maintenance'
    ])
    const capture = (sourceRef: string, target: string) =>
      box.run([
        'ki',
        'trade',
        'standing',
        'capture',
        sourceHome,
        '--subtype',
        'shared-maintenance',
        '--source-ref',
        sourceRef,
        '--capture',
        target
      ])

    expect((await capture('not-a-ref', 'docs/capture file.md#source-analysis')).output).toContain(
      'source-ref must use <40-hex-commit>:<path>#<anchor>'
    )
    box.setRunner(async () => ({ exitCode: 1, output: 'missing' }))
    expect(
      (await capture(`${commit}:docs/source.md#finding`, 'docs/capture file.md#source-analysis')).output
    ).toContain(`source commit ${commit} does not resolve`)
    box.setRunner(async (_commandName, arguments_) => ({
      exitCode: (arguments_[4] as string).endsWith('^{commit}') ? 0 : 1,
      output: ''
    }))
    expect(
      (await capture(`${commit}:docs/source.md#finding`, 'docs/capture file.md#source-analysis')).output
    ).toContain(`source path docs/source.md does not resolve at ${commit}`)
    box.setRunner(async () => ({ exitCode: 0, output: '' }))
    expect((await capture(`${commit}:docs/source.md#finding`, 'capture-without-anchor')).output).toContain(
      'capture must use <relative-markdown-path>#<anchor>'
    )
    expect((await capture(`${commit}:docs/source.md#finding`, '../peer.md#finding')).output).toContain(
      'must name a Markdown file inside the current repository'
    )
    expect((await capture(`${commit}:docs/source.md#finding`, '/tmp/peer.md#finding')).output).toContain(
      'must name a Markdown file inside the current repository'
    )
    expect((await capture(`${commit}:docs/source.md#finding`, 'docs/missing.md#finding')).output).toContain(
      'must be an existing regular file'
    )
    expect(await box.project.read('docs/source.md')).toBe('# Source\n\n## Finding\n')
  })

  test('validates subtype and standing declarations before they become executable authority', async () => {
    const { box } = await fixture()
    const receiverHeader = configuration('example/receiver', 'example/source', 'import').split(
      '[skills.ki-trades]'
    )[0] as string
    const inspect = async (declaration: string) => {
      await box.project.write('receiver/.ki.toml', `${receiverHeader}[skills.ki-trades]\n${declaration}\n`)
      box.cd('receiver')
      const result = await box.run('ki trade subtypes list')
      box.cd('..')
      return result
    }
    const rejected: readonly [string, string][] = [
      ['subtypes = "bad"', 'subtypes] must be a table'],
      ['[skills.ki-trades.subtypes.work]\nthing = "Unsupported"', 'standing intake is knowledge-only'],
      ['[skills.ki-trades.subtypes]\nknowledge = "bad"', 'must be a subtype-to-description table'],
      ['[skills.ki-trades.subtypes.knowledge]\n"Bad Subtype" = "Invalid"', 'lower-case hyphenated identifier'],
      ['[skills.ki-trades.subtypes.knowledge]\nvalid-subtype = 1', 'non-empty receiver-owned description'],
      ['[skills.ki-trades.subtypes.knowledge]\nvalid-subtype = " "', 'non-empty receiver-owned description'],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\nstanding = "bad"',
        'standing must be a table'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.other]\nknowledge = ["valid-subtype"]',
        'standing direction other is unsupported'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\nstanding = { import = "bad" }',
        'standing import must be a table containing knowledge'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nwork = ["valid-subtype"]',
        'standing import kind work is unsupported'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = []',
        'must be a non-empty subtype array'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = "bad"',
        'must be a non-empty subtype array'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = [1]',
        'must be a non-empty subtype array'
      ],
      [
        '[skills.ki-trades.subtypes.knowledge]\nvalid-subtype = "Valid"\n[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = ["valid-subtype", "valid-subtype"]',
        'must not repeat a subtype'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = ["Bad_Subtype"]',
        'must be lower-case hyphenated'
      ],
      [
        '[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = ["unknown-subtype"]',
        'is not defined by the receiver'
      ],
      [
        '[skills.ki-trades.subtypes.knowledge]\nvalid-subtype = "Valid"\n[skills.ki-trades.routes."example/source"]\nexport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = ["valid-subtype"]',
        'requires an ordinary knowledge import route'
      ]
    ]
    for (const [declaration, message] of rejected) expect((await inspect(declaration)).output).toContain(message)
    expect((await inspect('[skills.ki-trades.subtypes]')).exitCode).toBe(0)
    expect(
      (
        await inspect(
          '[skills.ki-trades.subtypes.knowledge]\nzeta-subtype = "Zeta"\nalpha-subtype = "Alpha"\n[skills.ki-trades.routes."example/source"]\nimport = ["knowledge"]\n[skills.ki-trades.routes."example/source".standing.import]\nknowledge = ["zeta-subtype", "alpha-subtype"]'
        )
      ).exitCode
    ).toBe(0)
  })

  test('guards duplicate, self, absent, and export-side mutations', async () => {
    const { box } = await fixture()
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'add',
          sourceHome,
          '--direction',
          'export',
          '--subtype',
          'shared-maintenance'
        ])
      ).output
    ).toContain('must differ from the local repository')
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'add',
          home('example/other'),
          '--direction',
          'export',
          '--subtype',
          'shared-maintenance'
        ])
      ).output
    ).toContain('requires an ordinary knowledge export route')
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--subtype',
      'shared-maintenance'
    ])
    await box.run([
      'ki',
      'trade',
      'standing',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--subtype',
      'another-subtype'
    ])
    expect((await box.run('ki trade standing list --incomplete')).output).toContain('unknown subtype')
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'remove',
          receiverHome,
          '--direction',
          'export',
          '--subtype',
          'missing-subtype'
        ])
      ).output
    ).toContain('is not declared locally')
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'remove',
          receiverHome,
          '--direction',
          'export',
          '--subtype',
          'shared-maintenance'
        ])
      ).exitCode
    ).toBe(0)
    expect(
      (
        await box.run([
          'ki',
          'trade',
          'standing',
          'remove',
          receiverHome,
          '--direction',
          'export',
          '--subtype',
          'another-subtype'
        ])
      ).exitCode
    ).toBe(0)
    box.cd('receiver')
    await box.run([
      'ki',
      'trade',
      'subtypes',
      'add',
      'shared-maintenance',
      '--description',
      'Shared maintenance evidence.'
    ])
    expect(
      (await box.run(['ki', 'trade', 'subtypes', 'add', 'shared-maintenance', '--description', 'Duplicate'])).output
    ).toContain('is already defined locally')
    expect((await box.run(['ki', 'trade', 'subtypes', 'remove', 'missing-subtype'])).output).toContain(
      'is not defined locally'
    )
  })
})
