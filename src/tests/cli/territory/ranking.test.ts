import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

const SYSTEM_HARNESS = home('knowledgeislands/ki-agentic-harness')

const capital = async (
  box: Sandbox,
  directory: string,
  options: { readonly name: string; readonly prefix: string; readonly members?: readonly string[] }
) => {
  const identity = home(`example/${directory}`)
  const members = [identity, ...(options.members ?? [])].sort((left, right) => (left < right ? -1 : 1))
  const path = await box.project.mkdir(directory)
  await box.project.write(
    `${directory}/.ki.toml`,
    capitalConfiguration({ identity: `example/${directory}`, name: options.name, members }).replace(
      'territory_name =',
      `territory_prefix = ${JSON.stringify(options.prefix)}\nterritory_name =`
    )
  )
  return { key: directory, repository: identity, path }
}
const member = async (box: Sandbox, directory: string, capitalIdentity: string) => {
  const path = await box.project.mkdir(directory)
  await box.project.write(
    `${directory}/.ki.toml`,
    memberConfiguration(`example/${directory}`, { capital: capitalIdentity })
  )
  return { key: directory, repository: home(`example/${directory}`), path }
}
const rank = (box: Sandbox, body: string) => box.config.write('ki/config.toml', body)

/**
 * Three territories whose path, handle and derived orders all differ, an Alpha member that sorts
 * last by path, and a registered repository no Capital declares.
 */
const fixture = async () => {
  const box = await sandbox()
  const system = await capital(box, 'a-sys-principal', { name: 'Sys', prefix: 'sys', members: [SYSTEM_HARNESS] })
  const alpha = await capital(box, 'b-alpha-principal', {
    name: 'Alpha',
    prefix: 'alpha',
    members: [home('example/z-member')]
  })
  const beta = await capital(box, 'c-beta-principal', { name: 'Beta', prefix: 'beta' })
  const alphaMember = await member(box, 'z-member', alpha.repository)
  const loose = await member(box, 'y-loose', alpha.repository)
  const entries = [system, alpha, beta, alphaMember, loose]
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      ...entries.flatMap((entry) => [
        `[repositories.${JSON.stringify(entry.key)}]`,
        `repository = ${JSON.stringify(entry.repository)}`,
        `path = ${JSON.stringify(entry.path)}`
      ])
    ].join('\n')
  )
  return { box, system: system.path, alpha: alpha.path, beta: beta.path, member: alphaMember.path, loose: loose.path }
}
const lines = (...paths: readonly string[]) => `${paths.join('\n')}\n`
const listed = async (box: Sandbox) =>
  [...(await box.run('ki territory list')).stdout.matchAll(/─ ([a-z]+):/gu)].map((match) => match[1])

describe('territory ranking', () => {
  test('without a ranking keeps the derived territory order and the estate path order', async () => {
    const { box, system, alpha, beta, member, loose } = await fixture()
    expect((await box.run('ki territory roots --principals')).stdout).toBe(lines(system, alpha, beta))
    expect(await listed(box)).toEqual(['sys', 'alpha', 'beta'])
    expect((await box.run('ki territory roots --estate')).stdout).toBe(lines(system, alpha, beta, loose, member))
    await rank(box, '[harnesses]\nids = []\n')
    expect((await box.run('ki territory roots --principals')).stdout).toBe(lines(system, alpha, beta))
    await rank(box, '[territories]\n')
    expect((await box.run('ki territory roots --principals')).stdout).toBe(lines(system, alpha, beta))
  })

  test('leads every multi-territory order with the ranked territories and leaves the rest derived', async () => {
    const { box, system, alpha, beta, member, loose } = await fixture()
    await rank(box, '[territories]\nranking = ["beta", "alpha"]\n')
    expect((await box.run('ki territory roots --principals')).stdout).toBe(lines(beta, alpha, system))
    expect(await listed(box)).toEqual(['beta', 'alpha', 'sys'])
    // Ranked territories' members by path within each, then every unranked root in path order.
    const estate = lines(beta, alpha, member, system, loose)
    expect((await box.run('ki territory roots --estate')).stdout).toBe(estate)
    expect((await box.run('ki territory roots --estate --filter z- --filter c-')).stdout).toBe(lines(beta, member))
    // One territory keeps its path order.
    expect((await box.run('ki territory roots -t alpha')).stdout).toBe(lines(alpha, member))
    const calls: (readonly string[])[] = []
    box.setRunner(async (command, args) => {
      calls.push([command, ...args])
      return { exitCode: 0, output: '' }
    })
    expect((await box.run('ki repo --estate open --target vscode --no-stores')).exitCode).toBe(0)
    expect(calls).toEqual([['code', '--new-window', ...estate.trim().split('\n')]])
    calls.length = 0
    expect((await box.run('ki territory open --principals --target zed')).exitCode).toBe(0)
    // Zed prepends each opened folder, so the launch order is the reverse of the project list.
    expect(calls).toEqual([['zed', '-n'], ...[system, alpha, beta].map((root) => ['zed', '-e', root])])
  })

  test('warns about ranked handles no registered Capital declares without failing', async () => {
    const { box, system, alpha, beta } = await fixture()
    await rank(box, '[territories]\nranking = ["ghost", "beta"]\n')
    const roots = await box.run('ki territory roots --principals')
    expect(roots).toMatchObject({ exitCode: 0, stdout: lines(beta, system, alpha) })
    expect(roots.stderr).toBe('ki: warning: territory ranking names ghost, which no registered Capital declares\n')
    expect((await box.run('ki territory list')).stderr).toContain('names ghost')
    expect((await box.run('ki territory roots -t beta')).stderr).toBe('')
    await box.project.write('estate.code-workspace', JSON.stringify({ folders: [] }))
    const inspected = await box.run([
      'ki',
      'territory',
      'inspect',
      '--principals',
      '--target',
      'vscode',
      '--workspace',
      join(box.project.path, 'estate.code-workspace')
    ])
    expect(inspected.stderr).toContain('names ghost')
  })

  test('rejects a malformed ranking as a configuration error', async () => {
    const { box } = await fixture()
    for (const [body, message] of [
      ['territories = "beta"\n', 'ki configuration territories must be a TOML table'],
      ['[territories]\norder = ["beta"]\n', 'ki configuration territories has unrecognised key order'],
      [
        '[territories]\nranking = "beta"\n',
        'ki configuration territories.ranking must be an array of territory handles'
      ],
      [
        '[territories]\nranking = ["Beta"]\n',
        'ki configuration territories.ranking must be an array of territory handles'
      ],
      ['[territories]\nranking = [1]\n', 'ki configuration territories.ranking must be an array of territory handles'],
      ['[territories]\nranking = ["beta", "beta"]\n', 'ki configuration territories.ranking repeats beta']
    ] as const) {
      await rank(box, body)
      const result = await box.run('ki territory roots --principals')
      expect(result).toMatchObject({ exitCode: 1, stdout: '' })
      expect(result.stderr).toContain(message)
    }
  })

  test('leaves an unreadable configuration to its own reader and keeps the derived order', async () => {
    const { box, system, alpha, beta } = await fixture()
    await rank(box, 'not = [valid\n')
    expect((await box.run('ki territory roots --principals')).stdout).toBe(lines(system, alpha, beta))
    await rm(join(box.config.path, 'ki/config.toml'))
    await box.config.mkdir('ki/config.toml')
    expect((await box.run('ki territory roots --principals')).stdout).toBe(lines(system, alpha, beta))
  })
})
