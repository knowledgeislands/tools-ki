import { join } from 'node:path'
import { KiError } from '../../errors.ts'
import type { DevelopmentRubricEvent, DevelopmentRubricPort } from './types.ts'
import { assertDevelopmentWriteTree } from './write-tree.ts'

export const inspectDevelopmentRubric = async (
  port: DevelopmentRubricPort,
  skill: string,
  options: { readonly write: boolean; readonly workingDirectory: string },
  emit: (event: DevelopmentRubricEvent) => void
): Promise<void> => {
  const resolved = await port.resolveSkill(skill)
  const publication = await port.preparePublication(resolved)
  if (options.write) {
    await assertDevelopmentWriteTree(
      port,
      resolved,
      publication.publicationRoot,
      options.workingDirectory,
      'rubric catalogue'
    )
    if (publication.evidence.state !== 'in-sync') {
      await port.publish(publication.publicationRoot, publication.proposal())
    }
    emit({ kind: 'written', target: join(publication.publicationRoot, publication.evidence.target) })
    return
  }
  if (publication.evidence.state === 'in-sync') {
    emit({ kind: 'in-sync', identity: resolved.identity, root: publication.publicationRoot })
    return
  }
  const reason = publication.evidence.state === 'missing' ? 'is missing' : 'is stale'
  emit({ kind: 'out-of-sync', identity: resolved.identity, reason, root: publication.publicationRoot })
  throw new KiError(`${resolved.identity} references/rubric.md ${reason}`, 1)
}
