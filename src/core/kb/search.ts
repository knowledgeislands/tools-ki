import { dirname } from 'node:path'
import type { KiContext } from '../../context.ts'
import {
  authenticateResults,
  boundedJson,
  CANDIDATE_LIMIT,
  currentSources,
  ENGINE,
  fail,
  RESPONSE_BYTES,
  requireModels,
  type SearchMapping,
  type SearchRequest,
  validateRequest
} from './contract.ts'
import { createProjection, loadMapping, privatizeDatabase, publishMapping } from './projection.ts'

const execute = async (
  context: KiContext,
  mapping: SearchMapping,
  args: string[],
  timeoutMs = 120000
): Promise<string> => {
  try {
    const response = await context.runner(
      context.environment['KI_QMD_BINARY'] || 'qmd',
      ['--index', mapping.index, ...args],
      {
        ...context.environment,
        QMD_CONFIG_DIR: dirname(mapping.config),
        INDEX_PATH: mapping.database,
        XDG_CACHE_HOME: mapping.model_cache
      },
      { timeoutMs, maxBytes: RESPONSE_BYTES, platform: context.platform }
    )
    if (
      response.exitCode !== 0 ||
      Buffer.byteLength(response.output) > RESPONSE_BYTES ||
      (response.stdout !== undefined && Buffer.byteLength(response.stdout) > RESPONSE_BYTES)
    )
      return fail('qmd execution failed or exceeded its bound')
    return response.stdout ?? response.output
  } catch {
    return fail('qmd execution unavailable or exceeded its bound')
  }
}
const version = async (context: KiContext, mapping: SearchMapping): Promise<void> => {
  const output = await execute(context, mapping, ['--version'], 10000)
  if (!/^qmd 2\.8\.3(?: \(facd35e\))?\s*$/.test(output)) fail(`provision qmd ${ENGINE.version} at the pinned revision`)
}
export const indexKb = async (context: KiContext, id: string | undefined, daemon: string | null) => {
  const mapping = await createProjection(context.paths.state, context.paths.cache, id, context.workingDirectory, daemon)
  await currentSources(mapping)
  await requireModels(mapping, 'vsearch', 'cli')
  await version(context, mapping)
  await execute(context, mapping, ['update'])
  await execute(context, mapping, ['embed'], 600000)
  await currentSources(mapping)
  await privatizeDatabase(mapping)
  const path = await publishMapping(context.paths.state, mapping)
  return { mapping: path, ...mapping }
}
export const searchKb = async (context: KiContext, id: string | undefined, request: SearchRequest) => {
  validateRequest(request)
  const mapping = await loadMapping(context.paths.state, id, context.workingDirectory)
  await currentSources(mapping)
  await requireModels(mapping, request.mode, 'cli')
  await version(context, mapping)
  const output = await execute(context, mapping, [
    request.mode,
    '--json',
    '-n',
    String(CANDIDATE_LIMIT),
    '-c',
    mapping.index,
    '--',
    request.query
  ])
  let raw: unknown
  try {
    raw = JSON.parse(output)
  } catch {
    return fail('qmd returned invalid JSON')
  }
  return authenticateResults(mapping, await currentSources(mapping), raw, request, 'cli')
}
export const statusKb = async (context: KiContext, id: string | undefined) => {
  const mapping = await loadMapping(context.paths.state, id, context.workingDirectory)
  await currentSources(mapping)
  if (!mapping.daemon_url) return fail('explicit daemon binding required')
  let health: unknown
  try {
    health = await boundedJson(context.fetcher, `${mapping.daemon_url}/health`)
  } catch {
    return fail('daemon transport unavailable')
  }
  if (typeof health !== 'object' || health === null || !('status' in health) || health.status !== 'ok')
    return fail('invalid daemon health')
  return {
    registry_id: mapping.registry_id,
    trust_boundary: mapping.trust_boundary,
    index: mapping.index,
    generation: mapping.generation,
    endpoint: mapping.daemon_url,
    reachable: true,
    index_attested: false
  }
}
