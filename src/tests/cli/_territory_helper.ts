// Trade fixtures for the Capital-governed territory model: members declare only their `capital`
// (and optionally a bare `[skills.ki-trades]`), while one Capital checkout carries the territory
// membership and the channel, standing and subtype policy every route resolves through.
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { sandbox } from './_cli_helper.ts'

type Box = Awaited<ReturnType<typeof sandbox>>
type Kind = 'work' | 'knowledge'

export const home = (identity: string): string => `https://github.com/${identity}`
export const capitalHome = home('example/capital')

export interface ChannelFixture {
  readonly id?: string
  readonly from: readonly string[]
  readonly to: readonly string[]
  readonly kinds: readonly Kind[]
}

export interface StandingFixture {
  readonly subtype: string
  readonly from: readonly string[]
  readonly to: readonly string[]
}

export interface TerritoryFixture {
  /** Capital identity; defaults to `example/capital`. */
  readonly identity?: string
  readonly name?: string
  /** Defaults to the Capital plus every repository a channel or standing grant names. */
  readonly members?: readonly string[]
  readonly channels?: readonly ChannelFixture[]
  readonly subtypes?: Readonly<Record<string, string>>
  readonly standing?: readonly StandingFixture[]
  /** Raw TOML appended after the generated policy, for malformed-policy cases. */
  readonly policy?: string
}

const list = (values: readonly string[]): string => `[${values.map((value) => JSON.stringify(value)).join(', ')}]`

/** Code-point order, matching the Capital's `members` validation rather than locale collation. */
const sorted = (values: Iterable<string>): readonly string[] =>
  [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))

const declarationHeader = (repository: string, capital: string): readonly string[] => [
  '[repo]',
  'harnesses = ["example/harness"]',
  '',
  '[skills.ki-repo-project]',
  '',
  '[skills.ki-repo]',
  'repo_type = "project"',
  'primary_shape = "ki-repo-project"',
  `repository = ${JSON.stringify(repository)}`,
  'title = "Test repository"',
  `capital = ${JSON.stringify(capital)}`,
  'description = "Trade fixture."',
  'repo_code = "TEST"'
]

/** A territory member: it names its Capital and, unless `trades` is false, declares a bare ki-trades table. */
export const memberConfiguration = (
  identity: string,
  options: { readonly capital?: string; readonly trades?: boolean; readonly mapBonus?: number | string } = {}
): string =>
  [
    ...declarationHeader(home(identity), options.capital ?? capitalHome),
    ...(options.trades === false
      ? []
      : [
          '',
          '[skills.ki-trades]',
          ...(options.mapBonus === undefined ? [] : [`map_bonus = ${JSON.stringify(options.mapBonus)}`])
        ]),
    ''
  ].join('\n')

/** A territory Capital: it names itself, lists its members and publishes the trade policy. */
export const capitalConfiguration = (territory: TerritoryFixture = {}): string => {
  const repository = home(territory.identity ?? 'example/capital')
  const channels = territory.channels ?? []
  const standing = territory.standing ?? []
  const members =
    territory.members ??
    sorted([repository, ...[...channels, ...standing].flatMap((entry) => [...entry.from, ...entry.to])])
  return [
    ...declarationHeader(repository, repository),
    '',
    '[skills.ki-repo.territory]',
    `name = ${JSON.stringify(territory.name ?? 'Example territory')}`,
    `members = ${list(members)}`,
    '',
    '[skills.ki-trades]',
    ...(territory.subtypes
      ? [
          '',
          '[skills.ki-trades.territory.subtypes]',
          ...Object.entries(territory.subtypes).map(([name, description]) => `${name} = ${JSON.stringify(description)}`)
        ]
      : []),
    ...channels.flatMap((channel, index) => [
      '',
      '[[skills.ki-trades.territory.channels]]',
      `id = ${JSON.stringify(channel.id ?? `channel-${index + 1}`)}`,
      'purpose = "Fixture channel."',
      `from = ${list(channel.from)}`,
      `to = ${list(channel.to)}`,
      `kinds = ${list(channel.kinds)}`
    ]),
    ...standing.flatMap((grant) => [
      '',
      '[[skills.ki-trades.territory.standing]]',
      `subtype = ${JSON.stringify(grant.subtype)}`,
      `from = ${list(grant.from)}`,
      `to = ${list(grant.to)}`
    ]),
    ...(territory.policy ? ['', territory.policy] : []),
    ''
  ].join('\n')
}

/** Writes a Capital checkout below the sandbox project and returns its physical root. */
export const writeCapital = async (
  box: Box,
  territory: TerritoryFixture = {},
  directory = 'capital'
): Promise<string> => {
  const root = await box.project.mkdir(directory)
  await box.project.write(`${directory}/.ki.toml`, capitalConfiguration(territory))
  return root
}

/** Registers each root under its basename, taking the repository identity from its declaration. */
export const registerEstate = async (box: Box, roots: readonly string[]): Promise<void> => {
  const entries = await Promise.all(
    roots.map(async (path) => {
      const declaration = await readFile(join(path, '.ki.toml'), 'utf8').catch(() => '')
      const repository =
        /\nrepository = "([^"]+)"/u.exec(`\n${declaration}`)?.[1] ?? `https://github.com/example/${basename(path)}`
      return { key: basename(path), repository, path }
    })
  )
  await box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      ...(entries.length ? [] : ['repositories = {}']),
      ...entries.flatMap((entry) => [
        '',
        `[repositories.${JSON.stringify(entry.key)}]`,
        `repository = ${JSON.stringify(entry.repository)}`,
        `path = ${JSON.stringify(entry.path)}`
      ]),
      ''
    ].join('\n')
  )
}
