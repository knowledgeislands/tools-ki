import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

const SYSTEM_BACKPACK = home('knowledgeislands/ki-agent-backpack')

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

/**
 * Three territories, Sys, Alpha and Beta, each derived, path and handle order putting Sys first,
 * an Alpha member that sorts last by path, and the store's register beside them in the project.
 */
const fixture = async () => {
  const box = await sandbox()
  const system = await capital(box, 'a-sys-principal', { name: 'Sys', prefix: 'sys', members: [SYSTEM_BACKPACK] })
  const alpha = await capital(box, 'b-alpha-principal', {
    name: 'Alpha',
    prefix: 'alpha',
    members: [home('example/z-member')]
  })
  const beta = await capital(box, 'c-beta-principal', { name: 'Beta', prefix: 'beta' })
  const member = await box.project.mkdir('z-member')
  await box.project.write('z-member/.ki.toml', memberConfiguration('example/z-member', { capital: alpha.repository }))
  const entries = [system, alpha, beta, { key: 'z-member', repository: home('example/z-member'), path: member }]
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
  const store = join(box.project.path, 'store')
  box.setEnv({ MCP_CAIRN_STORE: store })
  return { box, store, system: system.path, alpha: alpha.path, beta: beta.path, member }
}

const REGISTER = 'store/roster/territories'
/** One territory's record in the store's register, its front matter given line by line. */
const record = (box: Sandbox, code: string, ...fields: readonly string[]) =>
  box.project.write(
    `${REGISTER}/${code}/_index.md`,
    `---\nki-id: territory:${code}\nki-document-type: territory\n${fields.join('\n')}\nki-status: active\n---\n\n# ${code}\n`
  )
const rank = (box: Sandbox, body: string) => box.config.write('ki/config.toml', body)
const lines = (...paths: readonly string[]) => `${paths.join('\n')}\n`
const principals = async (box: Sandbox) => box.run('ki territory roots --principals')
const listed = async (box: Sandbox) =>
  [...(await box.run('ki territory list')).stdout.matchAll(/─ ([a-z]+):/gu)].map((match) => match[1])

describe('territory ranking from the Cairn store', () => {
  test("reads each territory's rank from the store's register before the configuration copy", async () => {
    const { box, system, alpha, beta, member } = await fixture()
    await rank(box, '[territories]\nranking = ["alpha", "beta"]\n')
    await record(box, 'b', 'ki-handle: beta', 'ki-glyph: 🫂', 'ki-rank: 1')
    await record(box, 'a', 'ki-handle: alpha', 'ki-rank: 2')
    // A territory whose Capital this machine does not hold is in the register, and passes without a warning.
    await record(box, 'g', 'ki-handle: ghost', 'ki-rank: 3')
    const roots = await principals(box)
    expect(roots).toMatchObject({ exitCode: 0, stdout: lines(beta, alpha, system), stderr: '' })
    expect(await listed(box)).toEqual(['beta', 'alpha', 'sys'])
    const estate = lines(beta, alpha, member, system)
    expect((await box.run('ki territory roots --estate')).stdout).toBe(estate)
    // Repository selection orders an estate the same way.
    const calls: (readonly string[])[] = []
    box.setRunner(async (command, args) => {
      calls.push([command, ...args])
      return { exitCode: 0, output: '' }
    })
    expect((await box.run('ki repo --estate open --target vscode --no-stores')).exitCode).toBe(0)
    expect(calls).toEqual([['code', '--new-window', ...estate.trim().split('\n')]])
    // The rig's Cairn configuration names the store where MCP_CAIRN_STORE does not.
    box.setEnv({ MCP_CAIRN_STORE: '' })
    await box.config.write('cairn/config.toml', `[store]\npath = ${JSON.stringify(join(box.project.path, 'store'))}\n`)
    expect((await principals(box)).stdout).toBe(lines(beta, alpha, system))
  })

  test('falls back to the configuration copy without a store, a register or a ranked record', async () => {
    const { box, store, system, alpha, beta } = await fixture()
    await rank(box, '[territories]\nranking = ["alpha", "beta"]\n')
    // No store named anywhere.
    box.setEnv({ MCP_CAIRN_STORE: undefined })
    expect((await principals(box)).stdout).toBe(lines(alpha, beta, system))
    // A store with no register.
    box.setEnv({ MCP_CAIRN_STORE: store })
    expect((await principals(box)).stdout).toBe(lines(alpha, beta, system))
    // An empty register, a stray file and a folder without its record rank nothing.
    await box.project.write(`${REGISTER}/territories.md`, '# Territories\n')
    await box.project.mkdir(`${REGISTER}/x`)
    expect((await principals(box)).stdout).toBe(lines(alpha, beta, system))
    // Records that settle no rank or no handle yet leave their territories to the configuration.
    await record(box, 'a', 'ki-handle: alpha')
    await record(box, 'b', 'ki-handle: beta', 'ki-rank: null')
    await record(box, 'f', 'ki-handle: null', 'ki-rank: 1')
    await record(box, 's', 'ki-rank: 2')
    expect(await principals(box)).toMatchObject({ stdout: lines(alpha, beta, system), stderr: '' })
    // One ranked record leads; the rest keep their configuration order after it.
    await record(box, 's', 'ki-handle: sys', 'ki-rank: 2')
    expect((await principals(box)).stdout).toBe(lines(system, alpha, beta))
  })

  test('orders equal ranks by code and keeps the first rank of a repeated handle', async () => {
    const { box, system, alpha, beta } = await fixture()
    await record(box, 'z', 'ki-handle: beta', 'ki-rank: 1')
    await record(box, 'y', 'ki-handle: alpha', 'ki-rank: 1')
    await record(box, 'w', 'ki-handle: sys', 'ki-rank: 3')
    await record(box, 'x', 'ki-handle: alpha', 'ki-rank: 4')
    expect((await principals(box)).stdout).toBe(lines(alpha, beta, system))
    await record(box, 'x', 'ki-handle: alpha', 'ki-rank: 2')
    await record(box, 'y', 'ki-handle: alpha', 'ki-rank: 5')
    expect((await principals(box)).stdout).toBe(lines(beta, alpha, system))
  })

  test('warns about a malformed record and ranks its territory from configuration', async () => {
    const { box, store, system, alpha, beta } = await fixture()
    await rank(box, '[territories]\nranking = ["alpha"]\n')
    await record(box, 'b', 'ki-handle: beta', 'ki-rank: 1')
    const path = join(store, 'roster/territories/a/_index.md')
    for (const [text, reason] of [
      ['# Alpha\n', 'no front matter'],
      ['---\nki-id: [territory\n---\n', 'front matter is not valid YAML'],
      ['---\n- territory:a\n---\n', 'front matter holds no fields'],
      ['---\nki-id: territory:alpha\nki-handle: alpha\nki-rank: 2\n---\n', 'ki-id is not territory:a'],
      ['---\nki-id: territory:a\nki-handle: alpha\nki-rank: 0\n---\n', 'ki-rank is not a positive integer'],
      ['---\nki-id: territory:a\nki-handle: alpha\nki-rank: 1.5\n---\n', 'ki-rank is not a positive integer'],
      ['---\nki-id: territory:a\nki-handle: alpha\nki-rank: "2"\n---\n', 'ki-rank is not a positive integer'],
      ['---\nki-id: territory:a\nki-handle: Alpha\nki-rank: 2\n---\n', 'ki-handle is not a territory handle'],
      ['---\nki-id: territory:a\nki-handle: 7\nki-rank: 2\n---\n', 'ki-handle is not a territory handle']
    ] as const) {
      await box.project.write(`${REGISTER}/a/_index.md`, text)
      const roots = await principals(box)
      expect(roots).toMatchObject({ exitCode: 0, stdout: lines(beta, alpha, system) })
      expect(roots.stderr).toBe(
        `ki: warning: territory register record ${path}: ${reason}; its territory keeps its configuration rank\n`
      )
    }
    // Repository selection reports nothing, as it reports no ranking warning, and still orders by the register.
    const calls: (readonly string[])[] = []
    box.setRunner(async (command, args) => {
      calls.push([command, ...args])
      return { exitCode: 0, output: '' }
    })
    const opened = await box.run('ki repo --principals open --target vscode --no-stores')
    expect(opened).toMatchObject({ exitCode: 0, stderr: '' })
    expect(calls).toEqual([['code', '--new-window', beta, alpha, system]])
  })

  test('warns about an unreadable Cairn configuration and reads it only for a ranked selection', async () => {
    const { box, system, alpha, beta } = await fixture()
    await rank(box, '[territories]\nranking = ["beta"]\n')
    box.setEnv({ MCP_CAIRN_STORE: undefined })
    await box.config.write('cairn/config.toml', '[store\n')
    const roots = await principals(box)
    expect(roots).toMatchObject({ exitCode: 0, stdout: lines(beta, system, alpha) })
    expect(roots.stderr).toMatch(
      /^ki: warning: .*cairn\/config\.toml is not valid TOML: .*; territories keep their configuration ranking\n$/su
    )
    expect(await box.run('ki territory roots -t alpha')).toMatchObject({ exitCode: 0, stderr: '' })
  })
})
