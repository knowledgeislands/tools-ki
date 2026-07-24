import { readFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

export interface DeclaredSkill {
  readonly name: string
  readonly configuration: Readonly<Record<string, unknown>>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export const readDeclaredSkills = async (configurationPath: string): Promise<readonly DeclaredSkill[]> => {
  let parsed: unknown
  try {
    parsed = parse(await readFile(configurationPath, 'utf8'))
  } catch {
    throw new KiError('.ki-config.toml must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('.ki-config.toml must be a table', 1)
  return Object.entries(parsed)
    .filter(([name]) => name.startsWith('ki-'))
    .map(([name, configuration]) => {
      if (!isRecord(configuration)) throw new KiError(`declared skill ${name} must use a TOML table`, 1)
      return { name, configuration }
    })
}
