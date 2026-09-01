import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const repository = (identity: string, agora = ''): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = ${JSON.stringify(identity)}\n${agora}`

const home = (id: string, members: Record<string, string> = {}, owner = 'https://github.com/example/home'): string =>
  `[skills.ki-agora.homes.${id}]\nowner = ${JSON.stringify(owner)}\npurpose = "Shared delivery"\nmembers = { ${Object.entries(
    members
  )
    .map(([identity, role]) => `${JSON.stringify(identity)} = ${JSON.stringify(role)}`)
    .join(', ')} }\n`

const membership = (id: string, homeIdentity: string, role: string): string =>
  `[skills.ki-agora.memberships.${id}]\nhome = ${JSON.stringify(homeIdentity)}\nrole = ${JSON.stringify(role)}\n`

const localRegistry = (
  entries: readonly { readonly key: string; readonly identity: string; readonly root: string }[]
): string =>
  [
    'schema = 1',
    ...(entries.length ? [] : ['repositories = {}']),
    ...entries.flatMap((entry) => [
      '',
      `[repositories.${JSON.stringify(entry.key)}]`,
      `repository = ${JSON.stringify(entry.identity)}`,
      `path = ${JSON.stringify(entry.root)}`
    ]),
    ''
  ].join('\n')

const registered = async (
  box: Sandbox,
  declarations: readonly {
    readonly path: string
    readonly identity: string
    readonly agora?: string
  }[]
): Promise<Record<string, string>> => {
  const roots: Record<string, string> = {}
  for (const declaration of declarations) {
    await box.project.write(`${declaration.path}/.ki.toml`, repository(declaration.identity, declaration.agora))
    roots[declaration.path] = await box.project.mkdir(declaration.path)
  }
  await box.state.write(
    'ki/registry.toml',
    localRegistry(
      declarations.map((declaration) => ({
        key: declaration.path,
        identity: declaration.identity,
        root: roots[declaration.path] as string
      }))
    )
  )
  return roots
}

describe('[ki agora audit]', () => {
  test('audits every declared profile or one explicit profile with deterministic healthy totals', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    await registered(box, [
      { path: 'home', identity: homeIdentity, agora: home('team', { [memberIdentity]: 'maintainer' }) },
      { path: 'member', identity: memberIdentity, agora: membership('team', homeIdentity, 'maintainer') }
    ])

    const healthy =
      '╭─ KI AGORA AUDIT\n├─ profiles (1)\n│  ╰─ team [healthy] FINDINGS=0\n╰─ summary: PROFILES=1 HEALTHY=1 UNHEALTHY=0 FINDINGS=0\n'
    expect(await box.run('ki agora audit')).toEqual({ exitCode: 0, output: healthy })
    expect(await box.run('ki agora audit team')).toEqual({ exitCode: 0, output: healthy })
    expect(await box.run('ki agora audit estate')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORA AUDIT\n├─ profiles (1)\n│  ╰─ estate [healthy] FINDINGS=0\n╰─ summary: PROFILES=1 HEALTHY=1 UNHEALTHY=0 FINDINGS=0\n'
    })
  })

  test('reports mixed health, preserves resolver diagnostics, and rejects unknown selectors', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const missingIdentity = 'https://github.com/example/missing'
    await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: `${home('healthy')}\n${home('broken', { [missingIdentity]: 'reviewer' })}`
      }
    ])

    expect(await box.run('ki agora audit')).toEqual({
      exitCode: 1,
      output: `╭─ KI AGORA AUDIT\n├─ profiles (2)\n│  ├─ broken [unhealthy] FINDINGS=1\n│  │  ╰─ Agora broken member ${missingIdentity} is not registered locally\n│  ╰─ healthy [healthy] FINDINGS=0\n╰─ summary: PROFILES=2 HEALTHY=1 UNHEALTHY=1 FINDINGS=1\n`
    })
    expect(await box.run('ki agora audit broken')).toEqual({
      exitCode: 1,
      output: `╭─ KI AGORA AUDIT\n├─ profiles (1)\n│  ╰─ broken [unhealthy] FINDINGS=1\n│     ╰─ Agora broken member ${missingIdentity} is not registered locally\n╰─ summary: PROFILES=1 HEALTHY=0 UNHEALTHY=1 FINDINGS=1\n`
    })
    expect(await box.run('ki agora audit unknown')).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora unknown is not declared by a registered Agora home\n'
    })
    expect(await box.run('ki agora audit UPPER')).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora name must use lower-case letters, numbers, and hyphens\n'
    })
  })

  test('reports duplicate owners and malformed declarations without aborting the audit', async () => {
    const box = await sandbox()
    const firstIdentity = 'https://github.com/example/first'
    const secondIdentity = 'https://github.com/example/second'
    await registered(box, [
      { path: 'first', identity: firstIdentity, agora: home('team', {}, firstIdentity) },
      { path: 'second', identity: secondIdentity, agora: home('team', {}, secondIdentity) }
    ])

    expect(await box.run('ki agora audit team')).toEqual({
      exitCode: 1,
      output:
        '╭─ KI AGORA AUDIT\n├─ profiles (1)\n│  ╰─ team [unhealthy] FINDINGS=1\n│     ╰─ Agora team is declared by multiple owners: https://github.com/example/first, https://github.com/example/second\n╰─ summary: PROFILES=1 HEALTHY=0 UNHEALTHY=1 FINDINGS=1\n'
    })

    const malformed = await sandbox()
    const badIdentity = 'https://github.com/example/bad'
    const shapeIdentity = 'https://github.com/example/shape'
    await registered(malformed, [
      { path: 'bad', identity: badIdentity, agora: '[skills.ki-agora]\nhomes = { bad = [] }\n' },
      { path: 'shape', identity: shapeIdentity, agora: '[skills.ki-agora]\nhomes = []\n' }
    ])
    const result = await malformed.run('ki agora audit')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('bad [unhealthy] FINDINGS=1')
    expect(result.output).toContain('Agora bad home declaration must be a table')
    expect(result.output).toContain('estate findings (1)')
    expect(result.output).toContain('[skills.ki-agora].homes must be a table')
    expect(result.output).toContain('summary: PROFILES=1 HEALTHY=0 UNHEALTHY=1 FINDINGS=2')
  })

  test('attributes unavailable members to profiles and unrelated unavailable repositories to the estate', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const firstIdentity = 'https://github.com/example/first'
    const secondIdentity = 'https://github.com/example/second'
    const roots = await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', { [firstIdentity]: 'maintainer', [secondIdentity]: 'reviewer' })
      }
    ])
    const firstRoot = `${box.project.path}/missing-first`
    const secondRoot = `${box.project.path}/missing-second`
    const unrelatedRoot = `${box.project.path}/missing-unrelated`
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        { key: 'home', identity: homeIdentity, root: roots['home'] as string },
        { key: 'first', identity: firstIdentity, root: firstRoot },
        { key: 'second', identity: secondIdentity, root: secondRoot },
        { key: 'unrelated', identity: 'https://github.com/example/unrelated', root: unrelatedRoot }
      ])
    )

    const result = await box.run('ki agora audit')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('team [unhealthy] FINDINGS=2')
    expect(result.output).toContain(`registered repository ${firstRoot} must be an existing physical directory`)
    expect(result.output).toContain(`registered repository ${secondRoot} must be an existing physical directory`)
    expect(result.output).toContain('estate findings (1)')
    expect(result.output).toContain(`registered repository ${unrelatedRoot} must be an existing physical directory`)
    expect(result.output).toContain('summary: PROFILES=1 HEALTHY=0 UNHEALTHY=1 FINDINGS=3')

    const estate = await box.run('ki agora audit estate')
    expect(estate.exitCode).toBe(1)
    expect(estate.output).toContain('estate [unhealthy] FINDINGS=3')
    expect(estate.output).toContain('summary: PROFILES=1 HEALTHY=0 UNHEALTHY=1 FINDINGS=3')
  })

  test('reports an empty declared profile set as healthy', async () => {
    const box = await sandbox()
    await box.state.write('ki/registry.toml', localRegistry([]))

    expect(await box.run('ki agora audit')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORA AUDIT\n├─ profiles (0)\n│  ╰─ none\n╰─ summary: PROFILES=0 HEALTHY=0 UNHEALTHY=0 FINDINGS=0\n'
    })
  })
})
