// A verdict scope narrows which findings may fail an audit without narrowing what the audit
// evaluates. Every rubric item still runs against the whole repository, because zone layout,
// unique identities and link resolution cannot be answered from one file; the scope only
// decides which of the resulting findings block.

import { isAbsolute, normalize, relative, sep } from 'node:path'
import { KiError } from '../../errors.ts'
import type { Environment } from '../../paths.ts'
import type { Runner } from '../../runtime/runner.ts'
import type { Finding } from '../../runtime/types.ts'

export interface VerdictScopeRequest {
  /** Scope the verdict to the paths staged in the repository's Git index. */
  readonly staged: boolean
  /** Scope the verdict to these explicit paths, repository-relative or absolute within it. */
  readonly paths: readonly string[]
}

export interface AuditVerdictScope {
  /** Distinct repository-relative POSIX paths, deleted staged paths included. */
  readonly paths: readonly string[]
  readonly source: 'staged' | 'explicit' | 'staged and explicit'
}

// Added, copied, modified, deleted and type-changed entries; renames are reported as a delete
// and an add so a moved file cannot leave its origin outside the scope. `--relative` reports
// paths against the repository root rather than the Git top level, and `-z` keeps a path with
// a newline or a quote intact.
const STAGED_PATHS = ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=ACMDT', '--relative', '-z']

// The repository root itself, or anything that escapes it, is not a path within the repository.
const NOT_WITHIN = /^(?:\.\.?)?$|^\.\.\//

/** A repository-relative POSIX path, or undefined when the value is not within the repository. */
const withinRepository = (repository: string, value: string): string | undefined => {
  const path = (isAbsolute(value) ? relative(repository, value) : normalize(value))
    .split(sep)
    .join('/')
    .replace(/\/+$/, '')
  return NOT_WITHIN.test(path) ? undefined : path
}

const stagedPaths = async (
  repository: string,
  runner: Runner,
  environment: Environment
): Promise<readonly string[]> => {
  const result = await runner('git', ['-C', repository, ...STAGED_PATHS], { ...environment, GIT_TERMINAL_PROMPT: '0' })
  if (result.exitCode !== 0)
    throw new KiError(`--staged requires a Git working tree with a readable index: ${result.output.trim()}`, 2)
  return result.output.split('\0').filter(Boolean)
}

/** Resolves the requested scope against one repository before its audit starts. */
export const resolveVerdictScope = async (
  request: VerdictScopeRequest,
  repository: string,
  runner: Runner,
  environment: Environment
): Promise<AuditVerdictScope> => {
  const explicit = request.paths.map((value) => {
    const path = withinRepository(repository, value)
    if (path === undefined) throw new KiError(`--paths must name paths inside the repository: ${value}`, 2)
    return path
  })
  const staged = request.staged ? await stagedPaths(repository, runner, environment) : []
  const source = request.staged ? (request.paths.length ? 'staged and explicit' : 'staged') : 'explicit'
  return { paths: [...new Set([...staged, ...explicit])], source }
}

const related = (left: string, right: string): boolean =>
  left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)

/**
 * A finding is in scope when its subject names a scoped path, a path under a scoped
 * directory, or a directory containing a scoped path. A finding without a subject, or whose
 * subject lies outside the repository, cannot be attributed to a scoped change and is outside.
 */
export const findingInScope = (scope: AuditVerdictScope, repository: string, finding: Finding): boolean => {
  const subject = finding.subject === undefined ? undefined : withinRepository(repository, finding.subject)
  return subject !== undefined && scope.paths.some((path) => related(subject, path))
}
