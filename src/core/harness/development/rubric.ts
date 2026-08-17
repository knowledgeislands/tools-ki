import { join } from 'node:path'
import { KiError } from '../../errors.ts'
import type { DevelopmentRubricEvent, DevelopmentRubricPort } from './types.ts'

const developmentLinked = async (port: DevelopmentRubricPort, harnessRoot: string): Promise<boolean> => {
  /* v8 ignore next -- Skill resolution already required this directory; this protects concurrent mutation. */
  const state = await port.lstat(join(harnessRoot, 'skills')).catch(() => undefined)
  /* v8 ignore next -- lstat can only return a stat object or undefined. */
  return state?.isSymbolicLink() ?? false
}

export const inspectDevelopmentRubric = async (
  port: DevelopmentRubricPort,
  skill: string,
  write: boolean,
  emit: (event: DevelopmentRubricEvent) => void
): Promise<void> => {
  const resolved = await port.resolveSkill(skill)
  const publication = await port.preparePublication(resolved)
  if (write) {
    if (!(await developmentLinked(port, resolved.harness.root))) {
      throw new KiError(
        `${resolved.identity} is an installed payload; run ki dev local on before writing its rubric catalogue`,
        1
      )
    }
    if (publication.evidence.state !== 'in-sync') {
      await port.publish(publication.publicationRoot, publication.proposal())
    }
    emit({ kind: 'written', target: publication.displayTarget })
    return
  }
  if (publication.evidence.state === 'in-sync') {
    emit({ kind: 'in-sync', identity: resolved.identity })
    return
  }
  const reason = publication.evidence.state === 'missing' ? 'is missing' : 'is stale'
  emit({ kind: 'out-of-sync', identity: resolved.identity, reason })
  throw new KiError(`${resolved.identity} references/rubric.md ${reason}`, 1)
}
