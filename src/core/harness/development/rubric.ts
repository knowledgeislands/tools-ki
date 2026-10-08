import { join } from 'node:path'
import { KiError } from '../../errors.ts'
import type { DevelopmentRubricEvent, DevelopmentRubricPort } from './types.ts'

const treeDescription = (root: string | undefined, path: string): string =>
  root ?? `${path}, which is not inside a Git working tree`

export const inspectDevelopmentRubric = async (
  port: DevelopmentRubricPort,
  skill: string,
  options: { readonly write: boolean; readonly workingDirectory: string },
  emit: (event: DevelopmentRubricEvent) => void
): Promise<void> => {
  const resolved = await port.resolveSkill(skill)
  const publication = await port.preparePublication(resolved)
  if (options.write) {
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
    // A dev-linked install resolves through to its development checkout, so the publication root can
    // be a working tree the caller is not in — another worktree of the same repository included. Only
    // equal working-tree roots permit the write; differing roots, and either side not being a working
    // tree at all, refuse. This is a safety interlock on which tree receives bytes, not isolation.
    const [callerRoot, publicationTree] = await Promise.all([
      port.repositoryRoot(options.workingDirectory),
      port.repositoryRoot(publication.publicationRoot)
    ])
    if (callerRoot === undefined || callerRoot !== publicationTree) {
      throw new KiError(
        `${resolved.identity} rubric catalogue belongs to ${treeDescription(publicationTree, publication.publicationRoot)}, not to the current working tree ${treeDescription(callerRoot, options.workingDirectory)}; --write publishes only within the working tree you are in`,
        2
      )
    }
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
