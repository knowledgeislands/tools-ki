import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../core/errors.ts'
import { configuredAgents, inspectUserConfiguration } from './configuration.ts'
import { inspectLocalsTable, isRecord, type LocalDevelopmentConfiguration } from './internal.ts'

/**
 * The host-local file that owns remembered harness checkouts. Checkout paths differ between hosts,
 * so they live in the state directory rather than in the portable, often chezmoi-managed `config.toml`.
 */
export const localSourcesPath = (stateDirectory: string): string => join(stateDirectory, 'locals.toml')

export interface LocalSourcesInspection {
  readonly path: string
  /** `missing` until the host-local file exists; its locals are then the `config.toml` entries awaiting their move. */
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly locals: readonly LocalDevelopmentConfiguration[]
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

const renderLocalSources = (locals: readonly LocalDevelopmentConfiguration[]): string =>
  `${locals
    .toSorted((left, right) => left.harness.localeCompare(right.harness))
    .map((local) => `[locals.${JSON.stringify(local.harness)}]\npath = ${JSON.stringify(local.path)}\n`)
    .join('\n')}`

const writeLocalSources = async (
  stateDirectory: string,
  locals: readonly LocalDevelopmentConfiguration[]
): Promise<void> => {
  await mkdir(stateDirectory, { recursive: true })
  await writeFile(localSourcesPath(stateDirectory), renderLocalSources(locals), 'utf8')
}

/**
 * Once the host-local file exists it is the only authority, and `config.toml` entries are ignored
 * with a warning. Before then those entries are reported as awaiting their one-time move.
 */
export const inspectLocalSources = async (
  configurationDirectory: string,
  stateDirectory: string
): Promise<LocalSourcesInspection> => {
  const path = localSourcesPath(stateDirectory)
  const configuration = await inspectUserConfiguration(configurationDirectory)
  const legacy = configuration.legacyLocals
  const state = await lstat(path).catch(() => undefined)
  if (!state)
    return {
      path,
      state: 'missing',
      locals: legacy,
      warnings: legacy.length
        ? [`locals in ${configuration.path} await their move to ${path}; ki bootstrap or ki dev local set moves them`]
        : [],
      errors: []
    }
  const warnings: string[] = []
  const errors: string[] = []
  let parsed: unknown = {}
  if (!state.isFile() || state.isSymbolicLink()) errors.push(`${path} must be a regular file`)
  else {
    try {
      parsed = parse(await readFile(path, 'utf8'))
    } catch {
      errors.push(`${path} must be valid TOML`)
    }
  }
  // A parsed TOML document is always a table; the fallback only guards a future parser change.
  /* v8 ignore next */
  const table = isRecord(parsed) ? parsed : {}
  for (const key of Object.keys(table)) {
    if (key !== 'locals') warnings.push(`${path} has unrecognised key ${key}`)
  }
  const locals = inspectLocalsTable(table['locals'], errors, warnings)
  if (legacy.length) warnings.push(`locals in ${configuration.path} are ignored; ${path} holds this host's checkouts`)
  return errors.length
    ? { path, state: 'invalid', locals: [], warnings, errors }
    : { path, state: 'valid', locals, warnings, errors }
}

/** The effective local sources, refusing an invalid host-local file rather than falling back. */
export const requireLocalSources = async (
  configurationDirectory: string,
  stateDirectory: string
): Promise<readonly LocalDevelopmentConfiguration[]> => {
  const sources = await inspectLocalSources(configurationDirectory, stateDirectory)
  if (sources.state === 'invalid')
    throw new KiError(`local harness sources are invalid: ${sources.errors.join('; ')}`, 1)
  return sources.locals
}

/**
 * Copies valid `config.toml` locals into the host-local file once, when it does not yet exist.
 * `config.toml` is left untouched, so removing the host-local file repeats the move.
 */
export const migrateLocalSources = async (configurationDirectory: string, stateDirectory: string): Promise<number> => {
  if (await lstat(localSourcesPath(stateDirectory)).catch(() => undefined)) return 0
  const configuration = await inspectUserConfiguration(configurationDirectory)
  if (configuration.state !== 'valid' || !configuration.legacyLocals.length) return 0
  await writeLocalSources(stateDirectory, configuration.legacyLocals)
  return configuration.legacyLocals.length
}

/** Remembers one harness checkout in the host-local file, moving any `config.toml` entries first. */
export const setLocalBootstrapHarness = async (
  configurationDirectory: string,
  stateDirectory: string,
  homeDirectory: string,
  local: LocalDevelopmentConfiguration
): Promise<void> => {
  await configuredAgents({ homeDirectory, configurationDirectory })
  await migrateLocalSources(configurationDirectory, stateDirectory)
  const locals = await requireLocalSources(configurationDirectory, stateDirectory)
  await writeLocalSources(stateDirectory, [...locals.filter((candidate) => candidate.harness !== local.harness), local])
}

/** Refuses a remembered checkout that is missing on this host instead of guessing another source. */
export const rememberedCheckout = async (local: LocalDevelopmentConfiguration): Promise<string> => {
  if (!(await lstat(local.path).catch(() => undefined)))
    throw new KiError(
      `remembered checkout for ${local.harness} is missing at ${local.path}; remember another with ki dev local set ${local.harness} <path>`,
      1
    )
  return local.path
}
