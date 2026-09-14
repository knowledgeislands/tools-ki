import { lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from '../errors.ts'

export const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
export const harnessMetadataFile = '.ki.toml'
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

export const harnessDirectory = (dataDirectory: string, identifier: string): string => {
  const [owner, name] = identifier.split('/') as [string, string]
  return join(dataDirectory, 'harnesses', owner, name)
}
