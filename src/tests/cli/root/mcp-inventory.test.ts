import { expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

type Box = Awaited<ReturnType<typeof sandbox>>

const configuration = (mcp?: string): string =>
  `schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n${mcp ? `\n[mcp]\n${mcp}\n` : ''}`

// `ki repo init` reaches the runner with the command environment before it can succeed or fail on
// anything else, so a refusing runner is the cheapest observation of what a spawned child inherits.
const spawnedEnvironment = async (box: Box): Promise<NodeJS.ProcessEnv | undefined> => {
  let spawned: NodeJS.ProcessEnv | undefined
  box.setRunner(async (_command, _arguments, environment) => {
    spawned = environment
    return { exitCode: 1, output: '' }
  })
  await box.run([
    'ki',
    'repo',
    'init',
    '--title',
    'Example repository',
    '--description',
    'Canonical MCP inventory adoption.',
    '--repo-code',
    'EXAMPLE',
    '--repository',
    'https://github.com/example/project',
    '--runtime',
    'claude-code',
    '--visibility',
    'private'
  ])
  return spawned
}

const refusal = async (box: Box): Promise<string> => {
  box.setRunner(async () => ({ exitCode: 1, output: '' }))
  const result = await box.run('ki registry list')
  return `${result.exitCode} ${result.stderr}`
}

test('adopts the configured canonical MCP inventory without requiring the named file', async () => {
  const box = await sandbox()
  const inventory = `${box.home.path}/.local/share/chezmoi/.chezmoidata/mcp-servers.yaml`
  await box.config.write('ki/config.toml', configuration(`inventory = ${JSON.stringify(inventory)}`))

  const spawned = await spawnedEnvironment(box)

  expect(spawned?.['KI_MCP_SOURCE']).toBe(inventory)
  expect(await refusal(box)).toBe('0 ')
})

test('leaves an inherited canonical MCP inventory in place and treats an empty one as unset', async () => {
  const inherited = await sandbox()
  const filled = await sandbox()
  const inventory = '/configured/mcp-servers.yaml'
  await inherited.config.write('ki/config.toml', configuration(`inventory = ${JSON.stringify(inventory)}`))
  await filled.config.write('ki/config.toml', configuration(`inventory = ${JSON.stringify(inventory)}`))
  inherited.setEnv({ KI_MCP_SOURCE: '/inherited/mcp-servers.yaml' })
  filled.setEnv({ KI_MCP_SOURCE: '' })

  const [inheritedEnvironment, filledEnvironment] = [
    await spawnedEnvironment(inherited),
    await spawnedEnvironment(filled)
  ]

  expect(inheritedEnvironment?.['KI_MCP_SOURCE']).toBe('/inherited/mcp-servers.yaml')
  expect(filledEnvironment?.['KI_MCP_SOURCE']).toBe(inventory)
})

test('adopts nothing from an absent, unreadable or mcp-free ki configuration', async () => {
  const absent = await sandbox()
  const free = await sandbox()
  const malformed = await sandbox()
  const irregular = await sandbox()
  await free.config.write('ki/config.toml', configuration())
  await malformed.config.write('ki/config.toml', 'schema = [\n')
  await irregular.config.mkdir('ki/config.toml')

  const environments = [
    await spawnedEnvironment(absent),
    await spawnedEnvironment(free),
    await spawnedEnvironment(malformed),
    await spawnedEnvironment(irregular)
  ]

  expect(environments.map((environment) => environment?.['KI_MCP_SOURCE'])).toEqual([
    undefined,
    undefined,
    undefined,
    undefined
  ])
  expect(await refusal(free)).toBe('0 ')
})

test('rejects an mcp configuration table it cannot resolve to one absolute inventory path', async () => {
  const boxes = await Promise.all([sandbox(), sandbox(), sandbox(), sandbox(), sandbox()])
  const [notTable, unknownKey, missingKey, notString, notAbsolute] = boxes as [Box, Box, Box, Box, Box]
  await notTable.config.write('ki/config.toml', `mcp = 1\n${configuration()}`)
  await unknownKey.config.write('ki/config.toml', configuration('source = "/configured/mcp-servers.yaml"'))
  await missingKey.config.write('ki/config.toml', configuration('# reserved'))
  await notString.config.write('ki/config.toml', configuration('inventory = 1'))
  await notAbsolute.config.write('ki/config.toml', configuration('inventory = "mcp-servers.yaml"'))

  const refusals = []
  for (const box of boxes) refusals.push(await refusal(box))

  expect(refusals).toEqual([
    '1 ki: error: ki configuration mcp must be a TOML table\n',
    '1 ki: error: ki configuration mcp has unrecognised key source\n',
    '1 ki: error: ki configuration mcp must declare inventory\n',
    '1 ki: error: ki configuration mcp must declare inventory\n',
    '1 ki: error: ki configuration mcp inventory must be an absolute path\n'
  ])
})
