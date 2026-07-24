import { pathToFileURL } from 'node:url'
import { KiError } from './errors.ts'
import type { RegisteredOperation } from './harness.ts'
import type { ResolvedSkill } from './resolution.ts'

export interface NativeFinding {
  readonly level: 'fail' | 'warn' | 'info'
  readonly code: string
  readonly message: string
}

export interface NativeAuditContext {
  readonly repository: string
  readonly capability: {
    readonly identity: string
    readonly harness: string
    readonly name: string
    readonly configuration: Readonly<Record<string, unknown>>
  }
}

type AuditOperation = (context: NativeAuditContext) => Promise<unknown> | unknown

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const validateFinding = (value: unknown, identity: string, index: number): NativeFinding => {
  if (!isRecord(value)) throw new KiError(`${identity} audit finding ${index} must be a table`, 1)
  const { level, code, message } = value
  if (level !== 'fail' && level !== 'warn' && level !== 'info')
    throw new KiError(`${identity} audit finding ${index} has an invalid level`, 1)
  if (typeof code !== 'string' || !code) throw new KiError(`${identity} audit finding ${index} must have a code`, 1)
  if (typeof message !== 'string' || !message) throw new KiError(`${identity} audit finding ${index} must have a message`, 1)
  return { level, code, message }
}

export const registeredOperation = (skill: ResolvedSkill, mode: RegisteredOperation['mode']): RegisteredOperation => {
  const operation = skill.capability.operations.find(
    (candidate) => candidate.protocol === 'ki/native-operation@1' && candidate.mode === mode
  )
  if (!operation) throw new KiError(`${skill.identity} does not register a native ${mode} operation`, 1)
  return operation
}

export const runAuditOperation = async (repository: string, skill: ResolvedSkill): Promise<readonly NativeFinding[]> => {
  const operation = registeredOperation(skill, 'audit')
  let module: Record<string, unknown>
  try {
    module = await import(pathToFileURL(`${skill.harness.root}/${operation.module}`).href)
  } catch {
    throw new KiError(`${skill.identity} native audit operation could not be imported`, 1)
  }
  const candidate = module[operation.export]
  if (typeof candidate !== 'function') throw new KiError(`${skill.identity} native audit operation export is not a function`, 1)
  const findings = await (candidate as AuditOperation)({
    repository,
    capability: {
      identity: skill.identity,
      harness: skill.harness.manifest.id,
      name: skill.capability.name,
      configuration: skill.declaration.configuration
    }
  })
  if (!Array.isArray(findings)) throw new KiError(`${skill.identity} native audit operation must return a findings array`, 1)
  return findings.map((finding, index) => validateFinding(finding, skill.identity, index))
}
