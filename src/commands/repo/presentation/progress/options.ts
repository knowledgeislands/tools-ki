import { KiError } from '../../../../core/errors.ts'
import type { FindingLevel } from '../../../../core/runtime/index.ts'

export type ProgressMode = 'auto' | 'always' | 'never'
export type ProgressStyle = 'single' | 'multi'
export type ReporterLevel = FindingLevel | 'fixed'

export interface OperationOptions {
  readonly progress: ProgressMode
  /** Defaults to evidence receipts on a TTY and one aggregate activity row in a plain stream. */
  readonly progressStyle: ProgressStyle | undefined
  readonly reporterLevels: readonly ReporterLevel[]
  readonly concise: boolean
}

const REPORTER_LEVELS: readonly ReporterLevel[] = ['fail', 'warn', 'fixed', 'info', 'not-applicable', 'pass']

const defaultReporterLevels = (operation: 'audit' | 'conform'): readonly ReporterLevel[] =>
  operation === 'audit' ? ['fail', 'warn'] : ['fail', 'warn', 'fixed']

const parseProgressMode = (value: string | undefined): ProgressMode => {
  if (value === undefined || value === 'auto' || value === 'always' || value === 'never') return value ?? 'auto'
  throw new KiError('--progress accepts auto, always, or never', 2)
}

const parseProgressStyle = (value: string | undefined): ProgressStyle | undefined => {
  if (value === undefined || value === 'single' || value === 'multi') return value
  throw new KiError('--progress-style accepts single or multi', 2)
}

const parseReporterLevels = (value: string | undefined, operation: 'audit' | 'conform'): readonly ReporterLevel[] => {
  if (value === undefined) return defaultReporterLevels(operation)
  if (value.toLowerCase() === 'all') return REPORTER_LEVELS
  const levels = value
    .split(',')
    .map((level) => level.trim().toLowerCase())
    .filter(Boolean) as ReporterLevel[]
  if (!levels.length || levels.some((level) => !REPORTER_LEVELS.includes(level)))
    throw new KiError('--reporter-levels accepts FAIL, WARN, FIXED, INFO, NOT_APPLICABLE, PASS, or all', 2)
  return [...new Set(levels)]
}

const operationProgress = (options: { readonly progress?: string; readonly concise?: boolean }): ProgressMode => {
  const progress = parseProgressMode(options.progress)
  return options.concise ? 'never' : progress
}

export const operationOptions = (
  operation: 'audit' | 'conform',
  options: {
    readonly progress?: string
    readonly progressStyle?: string
    readonly reporterLevels?: string
    readonly concise?: boolean
  }
): OperationOptions => ({
  progress: operationProgress(options),
  progressStyle: parseProgressStyle(options.progressStyle),
  reporterLevels: parseReporterLevels(options.reporterLevels, operation),
  concise: Boolean(options.concise)
})
