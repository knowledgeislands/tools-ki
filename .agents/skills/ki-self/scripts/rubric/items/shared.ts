import type { AuditOutcome } from '../../shared/rubric.ts'
import type { SelfRubricContext } from '../contexts/self.ts'

export const sourceContains = (
  context: SelfRubricContext,
  path: string,
  snippets: readonly string[]
): readonly AuditOutcome[] => {
  const source = context.sources.get(path)
  if (source === undefined) return [{ status: 'VIOLATION', message: `${path} is missing` }]
  const missing = snippets.filter((snippet) => !source.includes(snippet))
  return missing.length
    ? [{ status: 'VIOLATION', message: `${path} is missing governed evidence: ${missing.join(', ')}` }]
    : [{ status: 'PASS', message: `${path} retains governed evidence` }]
}

export const diagnosticRemediation = (guidance: string) => ({ class: 'diagnostic' as const, guidance })
