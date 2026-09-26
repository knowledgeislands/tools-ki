import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'

/**
 * The variable the published cross-surface binding standard resolves before its
 * `$XDG_CONFIG_HOME/ki/mcp-servers.yaml` default.
 */
const MCP_SOURCE_VARIABLE = 'KI_MCP_SOURCE'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads `config.toml` tolerantly, because every command now passes through here: a missing,
 * irregular or unparseable file stays the harness registry reader's fault to report on the paths
 * that depend on it, rather than stopping unrelated commands on a half-configured host. A present
 * `[mcp]` table is then validated strictly, so a typed key never resolves by accident.
 */
const readConfiguredMcpInventory = async (configurationDirectory: string): Promise<string | undefined> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  // lstat reports a symbolic link as a link, so this one test also refuses the indirection the
  // harness registry reader refuses.
  if (!state?.isFile()) return undefined
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) return undefined
  const mcp = parsed['mcp']
  if (mcp === undefined) return undefined
  if (!isRecord(mcp)) throw new KiError('ki configuration mcp must be a TOML table', 1)
  for (const key of Object.keys(mcp))
    if (key !== 'inventory') throw new KiError(`ki configuration mcp has unrecognised key ${key}`, 1)
  const inventory = mcp['inventory']
  if (typeof inventory !== 'string' || !inventory) throw new KiError('ki configuration mcp must declare inventory', 1)
  if (!isAbsolute(inventory)) throw new KiError('ki configuration mcp inventory must be an absolute path', 1)
  return inventory
}

/**
 * Adopts the configured canonical MCP inventory as `KI_MCP_SOURCE`.
 *
 * The standard resolves an explicit `KI_MCP_SOURCE` first, so configuration only fills the gap an
 * inherited variable leaves — an empty value counts as unset exactly as the standard's resolver
 * treats it. The named file is deliberately not required to exist: reporting an absent or invalid
 * inventory is a binding check's result, not a reason to refuse every other command.
 *
 * The environment is mutated in place so that one assignment reaches both directions. `main.ts`
 * hands `createContext` the real `process.env`, which makes `context.environment` that same object
 * in production: a spawned child inherits the value through the runner, and a skill rubric
 * catalogue — dynamically imported rather than spawned — reads it from `process.env`. A test's
 * injected environment is a separate object, so it stays isolated from the real one.
 */
export const adoptMcpInventory = async (environment: Environment, configurationDirectory: string): Promise<void> => {
  const inventory = await readConfiguredMcpInventory(configurationDirectory)
  if (inventory === undefined || environment[MCP_SOURCE_VARIABLE]) return
  environment[MCP_SOURCE_VARIABLE] = inventory
}
