import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

interface CapitalFixture {
  readonly identity: string
  readonly key: string
  readonly prefix?: string
  readonly aliases?: string
}

/** Writes each Capital (with one member for the first) and registers them all. */
const estate = async (box: Sandbox, capitals: readonly CapitalFixture[]) => {
  const entries: string[] = ['schema = 1']
  for (const [index, capital] of capitals.entries()) {
    const directory = capital.identity.split('/')[1] as string
    const path = await box.project.mkdir(directory)
    const members = index === 0 ? [home(capital.identity), home('example/member')] : [home(capital.identity)]
    const extra = [
      ...(capital.prefix === undefined ? [] : [`territory_prefix = ${JSON.stringify(capital.prefix)}`]),
      ...(capital.aliases === undefined ? [] : [`territory_aliases = ${capital.aliases}`])
    ]
    await box.project.write(
      `${directory}/.ki.toml`,
      capitalConfiguration({ identity: capital.identity, members: members.sort() }).replace(
        'territory_name =',
        `${extra.map((line) => `${line}\n`).join('')}territory_name =`
      )
    )
    entries.push(
      `[repositories.${JSON.stringify(capital.key)}]`,
      `repository = ${JSON.stringify(home(capital.identity))}`,
      `path = ${JSON.stringify(path)}`
    )
  }
  const member = await box.project.mkdir('member')
  await box.project.write(
    'member/.ki.toml',
    memberConfiguration('example/member', { capital: home(capitals[0]?.identity as string) })
  )
  entries.push(
    '[repositories."member"]',
    `repository = ${JSON.stringify(home('example/member'))}`,
    `path = ${JSON.stringify(member)}`
  )
  await box.state.write('ki/registry.toml', entries.join('\n'))
}

const selected = (box: Sandbox, selector: string, command = ['show', '--verbose']) =>
  box.run(['ki', 'territory', ...command.slice(0, 1), '-t', selector, ...command.slice(1)])

describe('territory aliases', () => {
  test('a declared alias selects exactly what the canonical handle selects', async () => {
    const box = await sandbox()
    await estate(box, [
      {
        identity: 'example/knowledge-islands',
        key: 'ki-principal',
        prefix: 'knowledge-islands',
        aliases: '["ki", "demo"]'
      },
      { identity: 'example/sample', key: 'sample-team', aliases: '[]' }
    ])

    for (const command of [['show'], ['show', '--verbose'], ['roots', '--null'], ['audit']]) {
      const canonical = await selected(box, 'knowledge-islands', command)
      expect(canonical.exitCode).toBe(0)
      for (const alias of ['ki', 'demo']) expect(await selected(box, alias, command)).toEqual(canonical)
    }
    expect((await selected(box, 'ki', ['show'])).stdout).toContain('knowledge-islands')
    expect((await box.run('ki territory list')).stdout).not.toMatch(/\bdemo\b/)
    expect((await box.run('ki territory roots -t sample-team')).exitCode).toBe(0)

    const opened: (readonly string[])[] = []
    box.setRunner(async (_command, args) => {
      opened.push(args)
      return { exitCode: 0, output: '' }
    })
    for (const flag of ['-t', '--territory'])
      expect(
        (await box.run(['ki', 'repo', flag, 'ki', '-f', 'member', 'open', '--target', 'vscode', '--no-stores']))
          .exitCode
      ).toBe(0)
    expect(opened).toHaveLength(2)
    expect(opened[0]).toEqual(opened[1])
    const registered = await box.run('ki registry -t knowledge-islands add')
    expect(registered.exitCode).toBe(0)
    expect(await box.run('ki registry -t ki add')).toEqual(registered)

    // A prefixed Capital's registry key, an undeclared spelling and a retired selector stay unselectable.
    for (const selector of ['ki-principal', 'KI', 'agora']) expect((await selected(box, selector)).exitCode).toBe(2)
  })

  test('rejects malformed aliases and aliases on a non-Capital', async () => {
    const box = await sandbox()
    for (const aliases of ['"ki"', '[1]', '[""]', '[" ki"]', '["Ki"]', '["k_i"]', '["ki", "ki"]']) {
      await estate(box, [{ identity: 'example/capital', key: 'capital', prefix: 'team', aliases }])
      const result = await box.run('ki territory list')
      expect(result.exitCode).toBe(2)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('territory_aliases must')
    }
    await estate(box, [{ identity: 'example/capital', key: 'capital', aliases: '["team"]' }])
    await box.project.write(
      'member/.ki.toml',
      `${memberConfiguration('example/member').replace('repo_code = "TEST"', 'repo_code = "TEST"\nterritory_aliases = []')}`
    )
    const member = await box.run('ki territory roots -t team')
    expect(member.exitCode).toBe(2)
    expect(member.stderr).toContain('territory_aliases are permitted only in a territory Capital')
  })

  test('fails closed on every collision in the shared selector namespace, before any selection', async () => {
    for (const [capitals, message] of [
      [
        [
          { identity: 'example/one', key: 'one', aliases: '["shared"]' },
          { identity: 'example/two', key: 'two', aliases: '["shared"]' }
        ],
        'territory alias shared of two collides with an alias of one'
      ],
      [
        [
          { identity: 'example/one', key: 'one', prefix: 'team' },
          { identity: 'example/two', key: 'two', aliases: '["team"]' }
        ],
        'territory alias team of two collides with the handle of team'
      ],
      [
        [
          { identity: 'example/one', key: 'one' },
          { identity: 'example/two', key: 'two', prefix: 'sample-team', aliases: '["one"]' }
        ],
        'territory alias one of sample-team collides with the handle of one'
      ],
      [
        [{ identity: 'example/one', key: 'one', prefix: 'team', aliases: '["team"]' }],
        'territory alias team of team collides with the handle of team'
      ]
    ] as const) {
      const box = await sandbox()
      await estate(box, capitals)
      for (const args of [
        ['ki', 'territory', 'list'],
        ['ki', 'territory', 'roots', '--estate'],
        ['ki', 'territory', 'roots', '-t', 'one']
      ]) {
        const result = await box.run(args)
        expect(result.exitCode).toBe(2)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain(message)
      }
    }
  })
})
