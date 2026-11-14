import { lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { backpackIdentifier } from '../backpack/identity.ts'
import { KiError } from '../errors.ts'

export const backpackIdentifierPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
export const backpackMetadataFile = '.ki.toml'
export const payloadRoots = ['skills', 'subagents', 'hooks'] as const

// The first canonical archive used `agents/`; `ki dev local on` may replace that
// recognised retired layout with the current `subagents/` projection.
export const retiredCanonicalPayloadRoots = ['agents'] as const

export const physicalDirectory = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
}

export const ensureDirectory = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (state) return physicalDirectory(path, description)
  await mkdir(path, { recursive: true })
  await physicalDirectory(path, description)
}

/** An installed backpack's slot, always under its backpack spelling: the data migration moves a retired slot there. */
export const backpackDirectory = (dataDirectory: string, identifier: string): string =>
  join(dataDirectory, 'backpacks', backpackIdentifier(identifier))
