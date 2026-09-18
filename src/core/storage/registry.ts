import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import { canonicalHarnessIdentifier } from '../harness/index.ts'
import { harnessIdentifier } from './harness-paths.ts'

const sha256 = /^[a-f0-9]{64}$/

export interface HarnessRelease {
  readonly id: string
  readonly url: string
  readonly sha256: string
  readonly auth?: 'github-cli'
}

/**
 * The one harness every KI installation can acquire without user-managed
 * registry configuration. The Git commit and archive digest together are the
 * immutable acquisition evidence; additional harnesses remain opt-in.
 */
export const canonicalHarnessRelease: HarnessRelease = {
  id: canonicalHarnessIdentifier,
  url: 'https://codeload.github.com/knowledgeislands/ki-agentic-harness/tar.gz/bcdc991946a81bb59f207ee47dba24c138f60abb',
  sha256: '04247d3522b77ee884c30536a463a382de512a7cfbfc5a2654ee7c3ac22e5edf'
}

type RegistryValue = Record<string, unknown> & { readonly harnesses?: unknown }

const isRecord = (value: unknown): value is RegistryValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringField = (source: Record<string, unknown>, field: string, description: string): string => {
  const value = source[field]
  if (typeof value !== 'string' || !value) throw new KiError(`${description} must declare ${field}`, 1)
  return value
}

const githubCodeloadPath = (identifier: string, path: string): boolean => {
  const [owner, repository] = identifier.split('/') as [string, string]
  const prefix = `/${owner}/${repository}/tar.gz/`
  const revision = path.slice(prefix.length)
  return path.startsWith(prefix) && Boolean(revision) && !revision.includes('/')
}

const parseReleaseAuthentication = (
  value: unknown,
  identifier: string,
  url: URL,
  description: string
): 'github-cli' | undefined => {
  if (value === undefined) return undefined
  if (value !== 'github-cli') throw new KiError(`${description} auth must be github-cli`, 1)
  if (url.hostname !== 'codeload.github.com' || !githubCodeloadPath(identifier, url.pathname)) {
    throw new KiError(
      `${description} github-cli authentication requires https://codeload.github.com/${identifier}/tar.gz/<revision>`,
      1
    )
  }
  return value
}

const parseRelease = (value: unknown, index: number): HarnessRelease => {
  const description = `harnesses[${index}]`
  if (!isRecord(value)) throw new KiError(`${description} must be a table`, 1)
  const id = stringField(value, 'id', description)
  if (!harnessIdentifier.test(id)) throw new KiError(`${description} id must be an owner/name identifier`, 1)
  const url = stringField(value, 'url', description)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new KiError(`${description} url must be an HTTPS URL`, 1)
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password)
    throw new KiError(`${description} url must be an HTTPS URL without credentials`, 1)
  const digest = stringField(value, 'sha256', description)
  if (!sha256.test(digest)) throw new KiError(`${description} sha256 must be lowercase SHA-256`, 1)
  return { id, url, sha256: digest, auth: parseReleaseAuthentication(value['auth'], id, parsedUrl, description) }
}

export const readHarnessRegistry = async (configurationDirectory: string): Promise<readonly HarnessRelease[]> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return [canonicalHarnessRelease]
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('ki configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('ki configuration must be valid TOML', 1)
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new KiError('ki configuration must be a TOML table', 1)
  const configuration = parsed as Record<string, unknown> & { harnesses?: unknown }
  if (configuration.harnesses === undefined) return [canonicalHarnessRelease]
  if (!isRecord(configuration.harnesses)) throw new KiError('ki configuration harnesses must be a TOML table', 1)
  const harnesses = configuration.harnesses as Record<string, unknown> & { ids?: unknown; releases?: unknown }
  if (harnesses.releases === undefined) {
    if (
      !Array.isArray(harnesses.ids) ||
      harnesses.ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))
    ) {
      throw new KiError('ki configuration harnesses.ids must be an array of harness identifiers', 1)
    }
    return [canonicalHarnessRelease]
  }
  if (!Array.isArray(harnesses.releases))
    throw new KiError('ki configuration harnesses.releases must be an array of release entries', 1)
  const releases = harnesses.releases.map(parseRelease)
  const identities = new Set<string>([canonicalHarnessIdentifier])
  for (const release of releases) {
    if (release.id === canonicalHarnessIdentifier) {
      throw new KiError(
        `harness registry must not override the built-in canonical harness ${canonicalHarnessIdentifier}`,
        1
      )
    }
    if (identities.has(release.id)) throw new KiError(`harness registry repeats ${release.id}`, 1)
    identities.add(release.id)
  }
  return [canonicalHarnessRelease, ...releases]
}

/**
 * Reads the configuration a harness record will have to rewrite, so a caller can refuse before it
 * removes anything. Uninstall reaches `recordInstalledHarness` without going through
 * `installHarness`, so this is the first strict read of `config.toml` on that path.
 */
export const requireWritableHarnessRegistry = async (configurationDirectory: string): Promise<void> => {
  await configuredHarnessIds(configurationDirectory)
}

const configuredHarnessIds = async (configurationDirectory: string): Promise<readonly string[] | undefined> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('ki configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('ki configuration must be valid TOML', 1)
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new KiError('ki configuration must be a TOML table', 1)
  if (parsed.harnesses === undefined) return []
  if (!isRecord(parsed.harnesses)) throw new KiError('ki configuration harnesses must be a TOML table', 1)
  const ids = (parsed.harnesses as { readonly ids?: unknown }).ids
  if (ids === undefined) return []
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))) {
    throw new KiError('ki configuration harnesses.ids must be an array of harness identifiers', 1)
  }
  return ids
}

export const recordInstalledHarness = async (
  configurationDirectory: string,
  identifier: string,
  installed: boolean
): Promise<void> => {
  // Unreachable because installHarness rejects an identifier it cannot match against the registry,
  // and the uninstall and reinstall actions both call requireHarnessIdentifier before reaching here.
  /* v8 ignore next */
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const identifiers = await configuredHarnessIds(configurationDirectory)
  if (identifiers === undefined) return
  const next = new Set(identifiers)
  if (installed) next.add(identifier)
  else next.delete(identifier)
  const path = join(configurationDirectory, 'config.toml')
  const contents = await readFile(path, 'utf8')
  const ids = ['ids = [', ...[...next].sort().map((id) => `  ${JSON.stringify(id)},`), ']'].join('\n')
  const section = /\[harnesses\]\n([\s\S]*?)(?=\n\[|$)/
  const match = section.exec(contents)
  const updated = match
    ? contents.replace(section, (_whole, body: string) => {
        const existing = /ids\s*=\s*\[[\s\S]*?\](?=\n|$)/.exec(body)
        const nextBody = existing ? body.replace(existing[0], ids) : `${ids}\n${body}`
        return `[harnesses]\n${nextBody}`
      })
    : `${contents.trimEnd()}\n\n[harnesses]\n${ids}\n`
  await writeFile(path, updated, 'utf8')
}
