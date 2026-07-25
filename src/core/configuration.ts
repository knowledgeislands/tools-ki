import { readFile, writeFile } from 'node:fs/promises'
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

// Declare a skill in a repository's .ki-config.toml by appending its `[<skill>]` table.
// Text-appended (not re-serialised) to preserve the file's comments and formatting.
export const declareRepositorySkill = async (configurationPath: string, skill: string): Promise<boolean> => {
  const contents = await readFile(configurationPath, 'utf8')
  if (contents.split('\n').some((line) => line.trim() === `[${skill}]`)) return false
  const base = contents.endsWith('\n') ? contents : `${contents}\n`
  await writeFile(configurationPath, `${base}\n[${skill}]\n`, 'utf8')
  return true
}

// Remove a skill's `[<skill>]` table (header plus body up to the next table header).
export const undeclareRepositorySkill = async (configurationPath: string, skill: string): Promise<boolean> => {
  const lines = (await readFile(configurationPath, 'utf8')).split('\n')
  const start = lines.findIndex((line) => line.trim() === `[${skill}]`)
  if (start === -1) return false
  let end = start + 1
  while (end < lines.length && !(lines[end]?.trimStart().startsWith('[') ?? false)) end += 1
  const from = start > 0 && lines[start - 1]?.trim() === '' ? start - 1 : start
  lines.splice(from, end - from)
  await writeFile(configurationPath, lines.join('\n'), 'utf8')
  return true
}
