import { pathToFileURL } from 'node:url'
import { KiError } from './errors.ts'
import type { RegisteredOperation } from './harness.ts'
import type { ResolvedSkill } from './resolution.ts'
import type { NativeWrite } from './transaction.ts'

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

export interface NativeConformResult {
  readonly findings: readonly NativeFinding[]
  readonly writes: readonly NativeWrite[]
}

type ConformOperation = (context: NativeAuditContext) => Promise<unknown> | unknown

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

const importOperation = async (skill: ResolvedSkill, operation: RegisteredOperation): Promise<(...arguments_: never[]) => unknown> => {
  let module: Record<string, unknown>
  try {
    module = await import(pathToFileURL(`${skill.harness.root}/${operation.module}`).href)
  } catch {
    throw new KiError(`${skill.identity} native ${operation.mode} operation could not be imported`, 1)
  }
  const candidate = module[operation.export]
  if (typeof candidate !== 'function') throw new KiError(`${skill.identity} native ${operation.mode} operation export is not a function`, 1)
  return candidate as (...arguments_: never[]) => unknown
}

const auditContext = (repository: string, skill: ResolvedSkill): NativeAuditContext => ({
  repository,
  capability: {
    identity: skill.identity,
    harness: skill.harness.id,
    name: skill.capability.name,
    configuration: skill.declaration.configuration
  }
})

export const registeredOperation = (skill: ResolvedSkill, mode: RegisteredOperation['mode']): RegisteredOperation => {
  const operation = skill.capability.operations.find(
    (candidate) => candidate.protocol === 'ki/native-operation@1' && candidate.mode === mode
  )
  if (!operation) throw new KiError(`${skill.identity} does not register a native ${mode} operation`, 1)
  return operation
}

export const runAuditOperation = async (repository: string, skill: ResolvedSkill): Promise<readonly NativeFinding[]> => {
  const operation = registeredOperation(skill, 'audit')
  const findings = await ((await importOperation(skill, operation)) as AuditOperation)(auditContext(repository, skill))
  if (!Array.isArray(findings)) throw new KiError(`${skill.identity} native audit operation must return a findings array`, 1)
  return findings.map((finding, index) => validateFinding(finding, skill.identity, index))
}

export const runConformOperation = async (repository: string, skill: ResolvedSkill): Promise<NativeConformResult> => {
  const operation = registeredOperation(skill, 'conform')
  const result = await ((await importOperation(skill, operation)) as ConformOperation)(auditContext(repository, skill))
  if (!isRecord(result)) {
    throw new KiError(`${skill.identity} native conform operation must return findings and writes arrays`, 1)
  }
  const { findings: reportedFindings, writes: reportedWrites } = result
  if (!Array.isArray(reportedFindings) || !Array.isArray(reportedWrites)) {
    throw new KiError(`${skill.identity} native conform operation must return findings and writes arrays`, 1)
  }
  const findings = reportedFindings.map((finding, index) => validateFinding(finding, skill.identity, index))
  const writes = reportedWrites.map((write, index) => {
    if (!isRecord(write)) {
      throw new KiError(`${skill.identity} native conform write ${index} must have string path and content`, 1)
    }
    const { path, content } = write
    if (typeof path !== 'string' || typeof content !== 'string') {
      throw new KiError(`${skill.identity} native conform write ${index} must have string path and content`, 1)
    }
    return { path, content }
  })
  return { findings, writes }
}
