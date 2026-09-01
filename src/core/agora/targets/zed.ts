import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from '../../errors.ts'
import { userHome } from '../../paths.ts'
import type { ObserveTargetAdapter, ObserveTargetPort, OpenTargetAdapter, TargetObservation } from './types.ts'

interface ZedColumn {
  readonly name: string
  readonly type: string
}

interface ZedWorkspaceRow {
  readonly workspace_id: number
  readonly paths: string | null
  readonly remote_connection_id: number | null
}

interface ReadonlyStatement {
  readonly all: (...parameters: readonly SqlValue[]) => readonly unknown[]
  readonly get: (...parameters: readonly SqlValue[]) => unknown
}

interface ReadonlyDatabase {
  readonly query: (source: string) => ReadonlyStatement
  readonly close: () => void
}

type SqlValue = string | number | bigint | null

const zedDataDirectory = (port: ObserveTargetPort): string => {
  if (port.platform === 'darwin') return join(userHome(port.environment), 'Library', 'Application Support', 'Zed')
  if (port.platform === 'linux' || port.platform === 'freebsd')
    return join(port.environment['XDG_DATA_HOME'] ?? join(userHome(port.environment), '.local', 'share'), 'zed')
  if (port.platform === 'win32')
    return join(port.environment['LOCALAPPDATA'] ?? join(userHome(port.environment), 'AppData', 'Local'), 'Zed')
  throw new KiError(`Zed workspace observation is unsupported on ${port.platform}`, 1)
}

const supportedWorkspaceSchema = (database: ReadonlyDatabase): boolean => {
  const columns = database.query('PRAGMA table_info(workspaces)').all() as readonly ZedColumn[]
  const byName = new Map(columns.map((column) => [column.name, column.type.toUpperCase()]))
  return (
    byName.get('workspace_id') === 'INTEGER' &&
    byName.get('paths') === 'TEXT' &&
    byName.get('remote_connection_id') === 'INTEGER'
  )
}

/* v8 ignore next -- Node-hosted CLI coverage cannot load Bun's built-in module; the compiled release build verifies this runtime path resolves. */
const bunReadonlyDatabase = async (path: string): Promise<ReadonlyDatabase> => {
  const specifier = 'bun:sqlite'
  const module = (await import(specifier)) as typeof import('bun:sqlite')
  const database = new module.Database(path, { readonly: true, strict: true })
  return {
    query: (source) => {
      const statement = database.query(source)
      return {
        all: (...parameters) => statement.all(...parameters),
        get: (...parameters) => statement.get(...parameters)
      }
    },
    close: () => database.close()
  }
}

const readonlyDatabase = async (path: string): Promise<ReadonlyDatabase> => {
  /* v8 ignore next -- CLI input cannot select the runtime host; Node-hosted coverage exercises the equivalent node:sqlite arm. */
  if (process.versions['bun']) return bunReadonlyDatabase(path)
  const specifier = 'node:sqlite'
  const module = (await import(specifier)) as typeof import('node:sqlite')
  const database = new module.DatabaseSync(path, { readOnly: true })
  return {
    query: (source) => {
      const statement = database.prepare(source)
      return {
        all: (...parameters) => statement.all(...parameters),
        get: (...parameters) => statement.get(...parameters)
      }
    },
    close: () => database.close()
  }
}

const readZedWorkspace = async (path: string, workspaceId: number): Promise<ZedWorkspaceRow | undefined> => {
  let database: ReadonlyDatabase
  try {
    database = await readonlyDatabase(path)
  } catch {
    throw new KiError(`Zed workspace database is unavailable: ${path}`, 1)
  }
  try {
    if (!supportedWorkspaceSchema(database))
      throw new KiError(`Zed workspace database has an unsupported schema: ${path}`, 1)
    return (
      (database
        .query('SELECT workspace_id, paths, remote_connection_id FROM workspaces WHERE workspace_id = ?1')
        .get(workspaceId) as ZedWorkspaceRow | undefined) ?? undefined
    )
  } catch (error) {
    if (error instanceof KiError) throw error
    throw new KiError(`Zed workspace database could not be observed: ${path}`, 1)
  } finally {
    database.close()
  }
}

const observeZedWorkspace = async (selector: string, port: ObserveTargetPort): Promise<TargetObservation> => {
  if (!/^\d+$/u.test(selector) || !Number.isSafeInteger(Number(selector)))
    throw new KiError('Zed --workspace must be a decimal workspace identifier', 2)
  const workspaceId = Number(selector)
  const directory = zedDataDirectory(port)
  const candidates = [
    { channel: 'stable', path: join(directory, 'db', '0-stable', 'db.sqlite') },
    { channel: 'preview', path: join(directory, 'db', '0-preview', 'db.sqlite') }
  ]
  const available: typeof candidates = []
  for (const candidate of candidates) {
    const state = await lstat(candidate.path).catch(() => undefined)
    if (state?.isFile() && !state.isSymbolicLink()) available.push(candidate)
  }
  if (!available.length) throw new KiError('Zed stable or preview workspace database is unavailable', 1)

  const matches = (
    await Promise.all(
      available.map(async (candidate) => {
        const row = await readZedWorkspace(candidate.path, workspaceId)
        return row ? { ...candidate, row } : undefined
      })
    )
  ).filter((match) => match !== undefined)
  if (!matches.length) throw new KiError(`Zed workspace ${selector} was not found in stable or preview`, 2)
  if (matches.length > 1)
    throw new KiError(`Zed workspace ${selector} is ambiguous across stable and preview databases`, 2)
  const match = matches[0] as (typeof matches)[number]
  if (match.row.remote_connection_id !== null)
    throw new KiError(`Zed workspace ${selector} is remote and cannot be observed as physical roots`, 1)
  return {
    source: `${match.channel}:${match.path}#${selector}`,
    roots: (match.row.paths?.split('\n').filter(Boolean) ?? []).map((value) => ({ kind: 'path', value }))
  }
}

export const zedOpenTarget = {
  id: 'zed',
  failureMessage: 'zed failed',
  open: async (roots, port, options) => {
    const window = await port.runner('zed', ['-n'], port.environment)
    if (window.exitCode) return window

    const orderedRoots = options.preserveProjectionOrder ? [...roots].reverse() : roots
    for (const root of orderedRoots) {
      const result = await port.runner('zed', ['-e', root], port.environment)
      if (result.exitCode) return result
    }
    return { exitCode: 0, output: '' }
  },
  observe: observeZedWorkspace
} as const satisfies OpenTargetAdapter & ObserveTargetAdapter
