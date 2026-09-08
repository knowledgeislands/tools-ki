import { randomUUID } from 'node:crypto'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { RouteDirection, TradeConfiguration } from './configuration.ts'
import { inspectRoutes } from './estate.ts'
import type { ActiveRegisteredRepository, TradeContext } from './model.ts'
import { tradeError } from './model.ts'

const sourceReferenceExpression = /^([0-9a-f]{40}):([^#\s]+)#([^\s]+)$/u
const captureExpression = /^(.+\.md)#([^#\s]+)$/u

export type StandingRouteState =
  | 'active'
  | 'awaiting-receiver'
  | 'awaiting-sender'
  | 'ambiguous-repository'
  | 'awaiting-reciprocal'
  | 'unknown-subtype'

export interface StandingRouteInspection {
  readonly repository: string
  readonly direction: RouteDirection
  readonly subtype: string
  readonly state: StandingRouteState
  readonly peer?: ActiveRegisteredRepository
}

export const inspectStandingRoutes = async (
  context: TradeContext,
  local: TradeConfiguration
): Promise<readonly StandingRouteInspection[]> => {
  const ordinary = await inspectRoutes(context, local)
  return (['export', 'import'] as const)
    .flatMap((direction) =>
      Object.entries(direction === 'export' ? local.standingExports : local.standingImports).flatMap(
        ([repository, subtypes]) =>
          subtypes.map((subtype) => {
            // Parsed standing declarations always carry the matching ordinary knowledge route.
            const route = ordinary.find(
              (candidate) =>
                candidate.repository === repository &&
                candidate.direction === direction &&
                candidate.kind === 'knowledge'
            ) as (typeof ordinary)[number]
            if (route.state !== 'active') return { repository, direction, subtype, state: route.state }
            const peer = route.peer as ActiveRegisteredRepository
            if (direction === 'export' && !peer.configuration.knowledgeSubtypes[subtype])
              return { repository, direction, subtype, state: 'unknown-subtype' as const, peer }
            const reciprocal =
              direction === 'export'
                ? peer.configuration.standingImports[local.repository]
                : peer.configuration.standingExports[local.repository]
            return {
              repository,
              direction,
              subtype,
              state: reciprocal?.includes(subtype) ? ('active' as const) : ('awaiting-reciprocal' as const),
              peer
            }
          })
      )
    )
    .sort(
      (left, right) =>
        left.direction.localeCompare(right.direction) ||
        left.repository.localeCompare(right.repository) ||
        left.subtype.localeCompare(right.subtype)
    )
}

const requireActiveStandingImport = async (
  context: TradeContext,
  local: TradeConfiguration,
  source: string,
  subtype: string
): Promise<ActiveRegisteredRepository> => {
  if (!local.knowledgeSubtypes[subtype]) throw tradeError(`knowledge subtype ${subtype} is not defined by the receiver`)
  const route = (await inspectStandingRoutes(context, local)).find(
    (candidate) => candidate.repository === source && candidate.direction === 'import' && candidate.subtype === subtype
  )
  if (route?.state !== 'active')
    throw tradeError(
      `standing import knowledge subtype ${subtype} from ${source} is ${route?.state?.replaceAll('-', ' ') ?? 'not declared locally'}`
    )
  return route.peer as ActiveRegisteredRepository
}

const localCapturePath = async (
  root: string,
  capture: string
): Promise<{ readonly path: string; readonly relativePath: string }> => {
  const matched = captureExpression.exec(capture)
  if (!matched) throw tradeError('standing capture must use <relative-markdown-path>#<anchor>')
  const relativePath = matched[1] as string
  const path = resolve(root, relativePath)
  const lexical = relative(root, path)
  if (!lexical || lexical.startsWith(`..${sep}`) || lexical === '..' || isAbsolute(lexical))
    throw tradeError('standing capture must name a Markdown file inside the current repository')
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile()) throw tradeError(`standing capture file ${relativePath} must be an existing regular file`)
  return { path, relativePath }
}

const verifySourceReference = async (
  context: TradeContext,
  peer: ActiveRegisteredRepository,
  sourceRef: string
): Promise<void> => {
  const matched = sourceReferenceExpression.exec(sourceRef)
  if (!matched) throw tradeError('standing source-ref must use <40-hex-commit>:<path>#<anchor>')
  const commit = matched[1] as string
  const path = matched[2] as string
  const revision = await context.runner(
    'git',
    ['-C', peer.root, 'cat-file', '-e', `${commit}^{commit}`],
    context.environment
  )
  if (revision.exitCode !== 0)
    throw tradeError(`standing source commit ${commit} does not resolve in ${peer.repository}`)
  const source = await context.runner(
    'git',
    ['-C', peer.root, 'cat-file', '-e', `${commit}:${path}`],
    context.environment
  )
  if (source.exitCode !== 0) throw tradeError(`standing source path ${path} does not resolve at ${commit}`)
}

const standingBlock = (fields: {
  readonly id: string
  readonly source: string
  readonly sourceRef: string
  readonly receiver: string
  readonly subtype: string
  readonly capturedAt: string
  readonly capture: string
}): string =>
  [
    '<!-- ki-trades:standing-intake -->',
    '```toml',
    'schema = "ki-trades/standing-intake/v1"',
    `id = ${JSON.stringify(fields.id)}`,
    `source = ${JSON.stringify(fields.source)}`,
    `source_ref = ${JSON.stringify(fields.sourceRef)}`,
    `receiver = ${JSON.stringify(fields.receiver)}`,
    'kind = "knowledge"',
    `subtype = ${JSON.stringify(fields.subtype)}`,
    `captured_at = ${JSON.stringify(fields.capturedAt)}`,
    `capture = ${JSON.stringify(fields.capture)}`,
    '```',
    ''
  ].join('\n')

export interface StandingIntakeCapture {
  readonly id: string
  readonly path: string
  readonly sourceRef: string
}

export const captureStandingIntake = async (
  context: TradeContext,
  local: { readonly root: string; readonly configuration: TradeConfiguration },
  options: { readonly source: string; readonly subtype: string; readonly sourceRef: string; readonly capture: string }
): Promise<StandingIntakeCapture> => {
  const peer = await requireActiveStandingImport(context, local.configuration, options.source, options.subtype)
  await verifySourceReference(context, peer, options.sourceRef)
  const destination = await localCapturePath(local.root, options.capture)
  const existing = await readFile(destination.path, 'utf8')
  const id = `STI-${randomUUID().slice(0, 8)}`
  const capturedAt = new Date(context.now()).toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  await writeFile(
    destination.path,
    `${existing}${separator}${standingBlock({
      id,
      source: options.source,
      sourceRef: options.sourceRef,
      receiver: local.configuration.repository,
      subtype: options.subtype,
      capturedAt,
      capture: options.capture
    })}`,
    'utf8'
  )
  return { id, path: destination.relativePath, sourceRef: options.sourceRef }
}
