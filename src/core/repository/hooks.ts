import { lstat, readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { type NativeWrite, prepareWrites, publishWrites } from '../filesystem/publication.ts'
import type { Environment } from '../paths.ts'
import { scrubbedGitEnvironment } from '../runtime/git.ts'
import type { Runner } from '../runtime/runner.ts'
import type { CanonicalHooks } from './canonical-hooks.ts'

// ki-repo owns the canonical bytes. The host owns executable publication,
// bounded Husky retirement, Knip repair and the clone's relative hooksPath.
export const HOOK_DIRECTORY = '.githooks'
const HUSKY_DIRECTORY = '.husky'
const HOOKS = ['pre-commit', 'commit-msg'] as const
const HUSKY_ENTRIES = new Set<string>(['_', ...HOOKS])
const BINDING = `git config core.hooksPath ${HOOK_DIRECTORY}`
const OTHER_LOCKFILES = ['bun.lockb', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']
const EXECUTABLE = 0o755

const HUSKY_PREPARE = /^husky(?:\s+install)?(?:\s*&&\s*(.+))?$/
const LOCK_LINE = /^\s*"husky": (?:"[^"]*"|\["husky@[^"]*",.*\]),?\s*$/

// The lines of the common frame, as ki-principal's committed stubs and this composer write them.
const FOR_TOOLS = /^for tool in ([\w.-]+(?: [\w.-]+)*); do$/
const KNIP_FILES = ['knip.json', 'knip.ts'] as const
const TOOL_PACKAGES: Readonly<Record<string, string>> = { '@commitlint/cli': 'commitlint' }
const KNIP_REMEDY = "point Knip's `husky.config` at the committed hooks by hand, then run `ki repo conform` again"
const JSON_IGNORES = /("ignoreDependencies"\s*:\s*\[)([^\]]*)\]/g
const JSON_EMPTY_IGNORES =
  /,\s*"ignoreDependencies"\s*:\s*\[\s*\]|"ignoreDependencies"\s*:\s*\[\s*\]\s*,\s*|"ignoreDependencies"\s*:\s*\[\s*\]/g
const TS_OPEN = /^(?:export\s+default|const\s+\w+(?:\s*:\s*\w+)?\s*=)\s*\{[ \t]*$/m
const TS_IGNORES = /^([ \t]*)ignoreDependencies:\s*\[([^\]\n]*)\](,?)[ \t]*\r?\n/gm
const TS_HUSKY = /^[ \t]*husky\s*:.*$/m
const STRING_LITERAL = /(['"])((?:(?!\1)[^\\])*)\1/g

export type HookConversionEvent =
  | { readonly kind: 'hook-write'; readonly path: string; readonly dryRun: boolean }
  | { readonly kind: 'hook-remove'; readonly path: string; readonly dryRun: boolean }
  | { readonly kind: 'hook-bind'; readonly from?: string; readonly dryRun: boolean }

type HookBinding = { readonly kind: 'bind'; readonly from?: string }
type ObservedHookBinding = HookBinding | { readonly kind: 'keep'; readonly value: string }

interface HookConversion {
  readonly writes: readonly NativeWrite[]
  readonly removals: readonly string[]
  readonly binding?: HookBinding
}

const refuse = (
  reason: string,
  remedy = 'move the hook content into .githooks/ by hand, then run `ki repo conform` again'
): never => {
  throw new KiError(`hook conversion refused: ${reason}; nothing was changed`, 1, remedy)
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source)
  } catch {
    return undefined
  }
}

const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const commandLines = (lines: readonly string[]): string[] =>
  lines.filter((line) => line.trim() && !line.trim().startsWith('#'))

const readRegular = async (root: string, path: string): Promise<string | undefined> => {
  const state = await lstat(join(root, path)).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile()) refuse(`${path} is not a regular file`)
  return readFile(join(root, path), 'utf8')
}

const huskyEntries = async (root: string): Promise<ReadonlySet<string> | undefined> => {
  const state = await lstat(join(root, HUSKY_DIRECTORY)).catch(() => undefined)
  if (!state) return undefined
  if (!state.isDirectory()) refuse(`${HUSKY_DIRECTORY} is not a directory`)
  const entries = await readdir(join(root, HUSKY_DIRECTORY))
  for (const entry of entries)
    if (!HUSKY_ENTRIES.has(entry)) refuse(`${HUSKY_DIRECTORY}/${entry} has no place in ${HOOK_DIRECTORY}/`)
  return new Set(entries)
}

const nextPrepare = (prepare: unknown, bind: boolean): unknown => {
  if (prepare === undefined) return bind ? BINDING : undefined
  if (typeof prepare !== 'string') return refuse('package.json `prepare` is not a string')
  const match = HUSKY_PREPARE.exec(prepare.trim())
  if (!match)
    return /\bhusky\b/.test(prepare) ? refuse(`package.json \`prepare\` calls Husky as "${prepare}"`) : prepare
  const rest = match[1]
  if (!rest) return BINDING
  if (/\bhusky\b/.test(rest)) refuse(`package.json \`prepare\` calls Husky as "${prepare}"`)
  return rest.startsWith(BINDING) ? rest : `${BINDING} && ${rest}`
}

/**
 * Drops `husky` and binds `prepare`, keeping key order and the manifest's own indentation. A missing
 * `prepare` gains the binding only when Husky was in use and a committed pre-commit hook will exist.
 */
const manifestWrite = (
  source: string,
  inUse: boolean
): { readonly write?: NativeWrite; readonly declared: boolean } => {
  const parsed = parseJson(source)
  if (!isRecord(parsed)) return refuse('package.json is not a JSON object')
  let declared = false
  for (const block of ['dependencies', 'devDependencies']) {
    const dependencies = parsed[block]
    if (isRecord(dependencies) && 'husky' in dependencies) {
      delete dependencies['husky']
      declared = true
    }
  }
  const scripts = isRecord(parsed['scripts']) ? parsed['scripts'] : undefined
  const prepare = nextPrepare(scripts?.['prepare'], inUse || declared)
  const rebound = prepare !== scripts?.['prepare']
  if (!declared && !rebound) return { declared }
  if (scripts) scripts['prepare'] = prepare
  else parsed['scripts'] = { prepare }
  const indent = /^\{\r?\n([ \t]+)"/.exec(source)?.[1]
  const content = `${indent ? JSON.stringify(parsed, null, indent) : JSON.stringify(parsed)}${source.endsWith('\n') ? '\n' : ''}`
  return { declared, write: { path: 'package.json', content } }
}

/** Removes the workspace declaration and package entry; a lockfile only a networked install can rewrite refuses. */
const lockfileWrite = async (root: string): Promise<NativeWrite | undefined> => {
  for (const name of OTHER_LOCKFILES)
    if (await lstat(join(root, name)).catch(() => undefined))
      refuse(`${name} still locks husky; remove husky with its package manager first`)
  const source = await readRegular(root, 'bun.lock')
  if (source === undefined) return undefined
  const lines = source.split('\n')
  const kept: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string
    if (!LOCK_LINE.test(line)) {
      kept.push(line)
      continue
    }
    // A package entry sits between blank lines; keep only one of them.
    if (!kept.at(-1)?.trim() && !lines[index + 1]?.trim()) index++
  }
  if (kept.some((line) => line.includes('"husky'))) refuse('bun.lock names husky beyond its declaration and package')
  return kept.length === lines.length ? undefined : { path: 'bun.lock', content: kept.join('\n') }
}

/** Whether a hook runs the package's tool as a command; the frame's `for tool in` tests do not count. */
const hooksCall = (hooks: readonly string[], dependency: string): boolean => {
  const call = new RegExp(`(?:^|[\\s;&|(])${literal(TOOL_PACKAGES[dependency] ?? dependency)}(?=$|[\\s;&|)])`)
  return hooks.some((hook) =>
    commandLines(hook.split(/\r?\n/)).some((line) => !FOR_TOOLS.test(line.trim()) && call.test(line))
  )
}

/** Removes each named literal from an array's text, with its separator, keeping the array's layout. */
const withoutItems = (items: string, removed: readonly string[]): string =>
  removed.reduce(
    (text, item) => text.replace(new RegExp(`,\\s*${literal(item)}|${literal(item)}\\s*,?\\s*`), ''),
    items
  )

/** Appends `husky` and drops redundant ignores as text, so unrelated bytes keep their layout. */
const knipJsonWrite = (
  source: string,
  hookPaths: readonly string[],
  hooks: readonly string[]
): NativeWrite | undefined => {
  const parsed = parseJson(source)
  if (!isRecord(parsed)) return refuse('knip.json is not a JSON object', KNIP_REMEDY)
  const wanted = { config: hookPaths }
  const husky = parsed['husky']
  if (husky !== undefined && JSON.stringify(husky) !== JSON.stringify(wanted))
    refuse('knip.json configures husky otherwise', KNIP_REMEDY)
  // The plugin is root-only, so the root workspace's ignores are redundant too, and no other workspace's.
  const expected = structuredClone(parsed)
  const workspaces = expected['workspaces']
  const rootWorkspace = isRecord(workspaces) ? workspaces['.'] : undefined
  const redundant: string[] = []
  for (const scope of isRecord(rootWorkspace) ? [expected, rootWorkspace] : [expected]) {
    const ignores: unknown[] = Array.isArray(scope['ignoreDependencies']) ? scope['ignoreDependencies'] : []
    const kept = ignores.filter((entry) => typeof entry !== 'string' || !hooksCall(hooks, entry))
    if (kept.length === ignores.length) continue
    redundant.push(...(ignores.filter((entry) => !kept.includes(entry)) as string[]))
    if (kept.length) scope['ignoreDependencies'] = kept
    else delete scope['ignoreDependencies']
  }
  if (husky !== undefined && !redundant.length) return undefined
  expected['husky'] = wanted
  const literals = unique(redundant).map((entry) => JSON.stringify(entry))
  let content = source
    .replace(JSON_IGNORES, (_, open: string, items: string) => `${open}${withoutItems(items, literals)}]`)
    .replace(JSON_EMPTY_IGNORES, '')
  if (husky === undefined) {
    const close = content.lastIndexOf('}')
    const before = content.slice(0, close).trimEnd()
    const indent = /^\{\r?\n([ \t]+)"/.exec(content)?.[1]
    const member = `"husky": { "config": [${hookPaths.map((path) => JSON.stringify(path)).join(', ')}] }`
    content = `${before}${before.endsWith('{') ? '' : ','}${indent ? `\n${indent}` : ' '}${member}${indent ? '\n' : ' '}${content.slice(close)}`
  }
  if (JSON.stringify(parseJson(content)) !== JSON.stringify(expected))
    refuse('knip.json is laid out in a way the conversion cannot edit', KNIP_REMEDY)
  return { path: 'knip.json', content }
}

/** Puts `husky` first in a recognised `knip.ts` object literal and drops redundant ignores from its one-line array. */
const knipTsWrite = (
  source: string,
  hookPaths: readonly string[],
  hooks: readonly string[]
): NativeWrite | undefined => {
  const unrecognised = (): never => refuse('knip.ts is not an object literal the conversion can edit', KNIP_REMEDY)
  const open = TS_OPEN.exec(source)
  const openEnd = open ? open.index + open[0].length : -1
  const indent = /^\r?\n([ \t]+)\S/.exec(source.slice(openEnd))?.[1]
  if (!open || !indent) return unrecognised()
  const arrays = [...source.matchAll(TS_IGNORES)]
  const mentions = source.match(/\bignoreDependencies\b/g)?.length ?? 0
  if (arrays.length !== mentions || mentions > 1) unrecognised()
  const array = arrays[0]
  if (array && (array[2] as string).replace(STRING_LITERAL, '').replace(/[\s,]/g, '')) unrecognised()
  const items = array ? [...(array[2] as string).matchAll(STRING_LITERAL)] : []
  const kept = items.filter((item) => !hooksCall(hooks, item[2] as string)).map((item) => item[0])
  const quote = /['"]/.exec(source.slice(openEnd))?.[0] ?? "'"
  const member = `husky: { config: [${hookPaths.map((path) => `${quote}${path}${quote}`).join(', ')}] }`
  const husky = TS_HUSKY.exec(source)
  if (husky && husky[0].trim().replace(/,$/, '') !== member) refuse('knip.ts configures husky otherwise', KNIP_REMEDY)
  if (husky && kept.length === items.length) return undefined
  let content = source
  if (array && kept.length !== items.length) {
    const at = array.index
    const before = content.slice(0, at)
    const after = content.slice(at + array[0].length)
    content = kept.length
      ? `${before}${array[1]}ignoreDependencies: [${kept.join(', ')}]${array[3]}\n${after}`
      : // A last member leaves its predecessor's comma behind.
        `${array[3] ? before : before.replace(/,(\s*)$/, '$1')}${after}`
  }
  if (!husky) content = `${content.slice(0, openEnd)}\n${indent}${member},${content.slice(openEnd)}`
  return { path: 'knip.ts', content }
}

/** The Knip configuration that reads the committed hooks, for the first of `knip.json` and `knip.ts`. */
const knipWrite = async (
  root: string,
  hookPaths: readonly string[],
  hooks: readonly string[]
): Promise<NativeWrite | undefined> => {
  for (const name of KNIP_FILES) {
    const source = await readRegular(root, name)
    if (source === undefined) continue
    return name === 'knip.json' ? knipJsonWrite(source, hookPaths, hooks) : knipTsWrite(source, hookPaths, hooks)
  }
  return undefined
}

const readBinding = async (root: string, runner: Runner, environment: Environment): Promise<string> => {
  const result = await runner('git', ['-C', root, 'config', '--get', 'core.hooksPath'], environment)
  return result.exitCode === 0 ? result.output.trim() : ''
}

/** The read-only estate sweep preserves foreign bindings; canonical conform replaces them. */
export const currentBinding = async (
  root: string,
  runner: Runner,
  environment: Environment
): Promise<ObservedHookBinding | undefined> => {
  const value = await readBinding(root, runner, environment)
  if (value && resolve(root, value) === resolve(root, HOOK_DIRECTORY)) return undefined
  if (!value) return { kind: 'bind' }
  return resolve(root, value) === resolve(root, '.husky/_') ? { kind: 'bind', from: value } : { kind: 'keep', value }
}
/** Plans canonical hook publication and bounded migration repairs before any write. */
export const planHookConversion = async (
  root: string,
  runner: Runner,
  environment: Environment,
  canonical: CanonicalHooks | null
): Promise<HookConversion | undefined> => {
  if (canonical === null) return undefined
  const entries = await huskyEntries(root)
  const manifest = await readRegular(root, 'package.json')
  const writes: NativeWrite[] = []
  for (const hook of HOOKS) {
    const path = `${HOOK_DIRECTORY}/${hook}`
    const existing = await readRegular(root, path)
    const state = existing !== undefined ? await lstat(join(root, path)) : undefined
    if (existing !== canonical[hook] || !state || (state.mode & 0o7777) !== EXECUTABLE)
      writes.push({
        path,
        content: canonical[hook],
        mode: EXECUTABLE,
        ...(existing === undefined ? { create: true } : {})
      })
  }
  if (manifest !== undefined) {
    const { write, declared } = manifestWrite(manifest, entries !== undefined)
    if (write) writes.push(write)
    const lockfile = declared ? await lockfileWrite(root) : undefined
    if (lockfile) writes.push(lockfile)
  }
  const committed = HOOKS.map((hook) => ({ path: `${HOOK_DIRECTORY}/${hook}`, content: canonical[hook] }))
  const knip = await knipWrite(
    root,
    committed.map((hook) => hook.path),
    committed.map((hook) => hook.content)
  )
  if (knip) writes.push(knip)
  const value = await readBinding(root, runner, scrubbedGitEnvironment(environment))
  const binding: HookBinding | undefined =
    value === HOOK_DIRECTORY ? undefined : { kind: 'bind', ...(value ? { from: value } : {}) }
  const removals = entries ? [HUSKY_DIRECTORY] : []
  if (!writes.length && !removals.length && !binding) return undefined
  return { writes, removals, ...(binding ? { binding } : {}) }
}

/** Validates every write first, reports each change, then applies them unless this is a dry run. */
export const applyHookConversion = async (
  root: string,
  conversion: HookConversion,
  runner: Runner,
  environment: Environment,
  dryRun: boolean,
  observe: (event: HookConversionEvent) => void
): Promise<void> => {
  const prepared = await prepareWrites(root, conversion.writes)
  await publishWrites(prepared, true)
  const { binding } = conversion
  for (const write of conversion.writes) observe({ kind: 'hook-write', path: write.path, dryRun })
  for (const path of conversion.removals) observe({ kind: 'hook-remove', path, dryRun })
  if (binding?.kind === 'bind') observe({ kind: 'hook-bind', ...(binding.from ? { from: binding.from } : {}), dryRun })
  if (dryRun) return
  await publishWrites(prepared, false)
  for (const path of conversion.removals) await rm(join(root, path), { recursive: true, force: true })
  if (binding?.kind !== 'bind') return
  const result = await runner(
    'git',
    ['-C', root, 'config', 'core.hooksPath', HOOK_DIRECTORY],
    scrubbedGitEnvironment(environment)
  )
  if (result.exitCode !== 0) throw new KiError(`could not bind core.hooksPath: ${result.output.trim()}`, 1)
}
