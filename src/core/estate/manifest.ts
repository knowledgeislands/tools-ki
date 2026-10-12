import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from '../errors.ts'
import type { EstateTarget } from './model.ts'

const IDENTITY = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Expand a leading `~/` against the injected home; manifest paths must be home-relative or absolute. */
export const expandHome = (path: string, homeDirectory: string): string => {
  const expanded = path.startsWith('~/') ? join(homeDirectory, path.slice(2)) : path
  if (!expanded.startsWith('/')) throw new KiError(`estate targets path ${path} must be absolute or start with ~/`, 1)
  return join(expanded)
}

export const readEstateTargets = async (path: string, homeDirectory: string): Promise<readonly EstateTarget[]> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError(`estate targets ${path} must be a readable JSON document`, 1)
  }
  const repositories = isRecord(parsed) ? parsed['repositories'] : undefined
  if (!Array.isArray(repositories)) throw new KiError('estate targets must hold a repositories list', 1)
  return repositories.map((entry: unknown, index) => {
    const field = (name: string): string => {
      const value = isRecord(entry) ? entry[name] : undefined
      if (typeof value !== 'string' || !value)
        throw new KiError(`estate targets repositories[${index}] needs ${name}`, 1)
      return value
    }
    const from = field('from').toLowerCase()
    const to = field('to').toLowerCase()
    if (!IDENTITY.test(from) || !IDENTITY.test(to))
      throw new KiError(`estate targets repositories[${index}] from and to must be GitHub owner/name identities`, 1)
    const record = entry as Record<string, unknown>
    const path = (name: string): string | undefined =>
      typeof record[name] === 'string' && record[name] ? expandHome(record[name], homeDirectory) : undefined
    const register = record['register'] === true
    const pathFrom = path('path_from')
    const pathTo = register ? expandHome(field('path_to'), homeDirectory) : path('path_to')
    return {
      from,
      to,
      title: typeof record['title'] === 'string' ? record['title'] : to,
      register,
      ...(pathFrom ? { pathFrom } : {}),
      ...(pathTo ? { pathTo } : {})
    }
  })
}
