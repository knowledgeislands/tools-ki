import { KiError } from '../../errors.ts'
import type { DevelopmentRubricEvent, DevelopmentRubricPort } from './types.ts'

export const inspectDevelopmentRubric = async (
  port: DevelopmentRubricPort,
  skill: string,
  write: boolean,
  emit: (event: DevelopmentRubricEvent) => void
): Promise<void> => {
  const resolved = await port.resolveSkill(skill)
  const publication = await port.preparePublication(resolved)
  if (write) {
    // This command resolves only installed skills; repository-local providers are not development Harnesses.
    /* v8 ignore next -- resolveInstalledSkill supplies the port result. */
    if (resolved.provider.kind !== 'installed-harness') {
      throw new KiError(`${resolved.identity} is not an installed Harness capability`, 1)
    }
    if (!(await port.developmentLinked(resolved.provider.harness.id))) {
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
