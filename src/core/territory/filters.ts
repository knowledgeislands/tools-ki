import { basename } from 'node:path'
import { KiError } from '../errors.ts'
export const validateFilters = (filters: readonly string[]): void => {
  if (filters.some((filter) => !filter.length))
    throw new KiError('--filter must be a non-empty directory-name prefix', 2)
}
export const matchesDirectoryName = (path: string, filters: readonly string[]): boolean =>
  !filters.length || filters.some((filter) => basename(path).startsWith(filter))
