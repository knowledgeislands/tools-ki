// Fixtures for the Capital-governed territory model: members declare only their `capital`, while one
// Capital checkout carries the territory membership.

export const home = (identity: string): string => `https://github.com/${identity}`
export const capitalHome = home('example/capital')

export interface TerritoryFixture {
  /** Capital identity; defaults to `example/capital`. */
  readonly identity?: string
  readonly name?: string
  /** Defaults to the Capital alone. */
  readonly members?: readonly string[]
}

const list = (values: readonly string[]): string => `[${values.map((value) => JSON.stringify(value)).join(', ')}]`

/** Code-point order, matching the Capital's `territory_members` validation rather than locale collation. */
const sorted = (values: Iterable<string>): readonly string[] =>
  [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))

const declarationHeader = (repository: string, capital: string): readonly string[] => [
  '[repo]',
  'backpacks = ["example/backpack"]',
  '',
  '[skills.ki-repo-project]',
  '',
  '[skills.ki-repo]',
  'repo_type = "project"',
  'primary_shape = "ki-repo-project"',
  `repository = ${JSON.stringify(repository)}`,
  'title = "Test repository"',
  `capital = ${JSON.stringify(capital)}`,
  'description = "Territory fixture."',
  'repo_code = "TEST"'
]

/** A territory member: it names its Capital. */
export const memberConfiguration = (identity: string, options: { readonly capital?: string } = {}): string =>
  [...declarationHeader(home(identity), options.capital ?? capitalHome), ''].join('\n')

/** A territory Capital: it names itself and lists its members. */
export const capitalConfiguration = (territory: TerritoryFixture = {}): string => {
  const repository = home(territory.identity ?? 'example/capital')
  return [
    ...declarationHeader(repository, repository),
    `territory_name = ${JSON.stringify(territory.name ?? 'Example territory')}`,
    `territory_members = ${list(sorted(territory.members ?? [repository]))}`,
    ''
  ].join('\n')
}
