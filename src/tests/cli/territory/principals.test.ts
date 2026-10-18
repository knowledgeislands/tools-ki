import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'
import { capitalConfiguration, home, memberConfiguration } from '../_territory_helper.ts'

const SYSTEM_HARNESS = home('knowledgeislands/ki-agentic-harness')

const capital = async (
  box: Sandbox,
  directory: string,
  options: { readonly name: string; readonly prefix?: string; readonly members?: readonly string[] }
) => {
  const identity = home(`example/${directory}`)
  const members = [identity, ...(options.members ?? [])].sort((left, right) => (left < right ? -1 : 1))
  const path = await box.project.mkdir(directory)
  await box.project.write(
    `${directory}/.ki.toml`,
    capitalConfiguration({ identity: `example/${directory}`, name: options.name, members }).replace(
      'territory_name =',
      `${options.prefix ? `territory_prefix = ${JSON.stringify(options.prefix)}\n` : ''}territory_name =`
    )
  )
  return { key: directory, repository: identity, path }
}
const register = async (box: Sandbox, entries: readonly { key: string; repository: string; path: string }[]) =>
  box.state.write(
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
/** Four Capitals whose path, key and title orders all disagree with the principals order. */
const fixture = async () => {
  const box = await sandbox()
  const system = await capital(box, 'a-zeta-principal', { name: 'Zeta System', members: [SYSTEM_HARNESS] })
  const alpha = await capital(box, 'd-alpha-principal', { name: 'Alpha' })
  const betaTwo = await capital(box, 'b-beta-principal', { name: 'Beta', prefix: 'beta-two' })
  const betaOne = await capital(box, 'c-beta-principal', { name: 'Beta', prefix: 'beta-one' })
  const memberPath = await box.project.mkdir('member')
  await box.project.write('member/.ki.toml', memberConfiguration('example/member', { capital: alpha.repository }))
  const member = { key: 'member', repository: home('example/member'), path: memberPath }
  const entries = [system, alpha, betaTwo, betaOne, member]
  await register(box, entries)
  return { box, entries, ordered: [system.path, alpha.path, betaOne.path, betaTwo.path] }
}

describe('principals selection', () => {
  test('selects only Capitals, the system Capital first and the rest by territory name then handle', async () => {
    const { box, ordered } = await fixture()
    const roots = await box.run('ki territory roots --principals --null')
    expect(roots.exitCode).toBe(0)
    expect(roots.stdout).toBe(`${ordered.join('\0')}\0`)
    const shown = await box.run('ki territory show --principals')
    expect(shown.output).toContain('principals: Territory Capitals')
    expect(shown.output).toContain('REPOSITORIES=4')
    expect(shown.output).not.toContain('member')
    expect((await box.run('ki territory audit --principals')).output).toContain('principals: healthy')
    expect((await box.run('ki territory roots --principals -f d-alpha -f c-beta')).stdout).toBe(
      `${ordered[1]}\n${ordered[2]}\n`
    )
    const unmatched = await box.run('ki territory roots --principals -f member')
    expect(unmatched).toMatchObject({ exitCode: 2, stdout: '' })
    expect(unmatched.stderr).toBe(
      'ki: error: repository selection matched no repositories\nnext: compare --repo, --territory and --filter with the repositories ki registry list shows\n'
    )
  })

  test('orders names alone when no Capital holds the canonical Harness and skips unavailable checkouts', async () => {
    const { box, entries, ordered } = await fixture()
    await rm(ordered[0] as string, { recursive: true })
    expect((await box.run('ki territory roots --principals')).stdout).toBe(`${ordered.slice(1).join('\n')}\n`)
    await register(box, entries.slice(4))
    expect((await box.run('ki territory roots --principals')).exitCode).toBe(2)
  })

  test('opens every target in principals order so each editor lists the system Capital first', async () => {
    const { box, ordered } = await fixture()
    const calls: (readonly string[])[] = []
    box.setRunner(async (command, args) => {
      calls.push([command, ...args])
      return { exitCode: 0, output: '' }
    })
    const opened = await box.run('ki territory open --principals --target zed')
    expect(opened.output).toContain('ki territory open principals --target zed: opened 4 repositories')
    // Zed prepends each opened folder, so the launch order is the reverse of the project list.
    expect(calls).toEqual([['zed', '-n'], ...[...ordered].reverse().map((root) => ['zed', '-e', root])])
    calls.length = 0
    expect((await box.run('ki territory open --principals --target vscode')).exitCode).toBe(0)
    expect(calls).toEqual([['code', '--new-window', ...ordered]])
    calls.length = 0
    expect((await box.run('ki territory open --principals --target delta')).exitCode).toBe(0)
    expect(calls).toEqual(ordered.map((root) => ['delta', 'open', root]))
    calls.length = 0
    expect((await box.run('ki repo --principals open --target vscode --no-stores')).exitCode).toBe(0)
    expect(calls).toEqual([['code', '--new-window', ...ordered]])
  })

  test('inspects a projection and serves repository, registry and trade selection', async () => {
    const { box, ordered } = await fixture()
    await box.project.write('principals.code-workspace', JSON.stringify({ folders: ordered.map((path) => ({ path })) }))
    const inspected = await box.run([
      'ki',
      'territory',
      'inspect',
      '--principals',
      '--target',
      'vscode',
      '--workspace',
      join(box.project.path, 'principals.code-workspace')
    ])
    expect(inspected.exitCode).toBe(0)
    expect(inspected.output).toContain('status: exact')
    const added = await box.run('ki registry --principals add --dry-run')
    expect(added.exitCode).toBe(0)
    expect((await box.run('ki repo --principals trade list')).exitCode).toBe(0)
  })

  test('conflicts with every other primary scope and is rejected where selectors do not apply', async () => {
    const { box } = await fixture()
    for (const command of [
      'ki territory roots --principals --estate',
      'ki territory roots --principals -t beta-one',
      'ki territory show --principals --estate',
      'ki repo --principals --estate open --target vscode',
      'ki repo --principals --repo . open --target vscode',
      'ki registry --principals -t beta-one add --dry-run',
      'ki registry --principals list',
      'ki registry --principals remove member'
    ])
      expect((await box.run(command)).exitCode).toBe(2)
    expect((await box.run('ki repo --principals --estate open --target vscode')).stderr).toContain(
      '--repo, --territory, --estate, and --principals cannot be used together'
    )
    expect((await box.run('ki territory roots --principals --estate')).stderr).toContain(
      'select exactly one of --territory, --estate, or --principals'
    )
    expect((await box.run('ki registry --principals remove member')).stderr).toContain(
      'does not accept --territory, --estate, --principals, or --filter'
    )
    expect(
      (
        await box.run(
          'ki repo --principals init --title title --description description --repo-code EXAMPLE --runtime chatgpt-codex --visibility private'
        )
      ).stderr
    ).toContain('ki repo init does not accept --repo, --territory, --estate, or --principals')
  })
})
