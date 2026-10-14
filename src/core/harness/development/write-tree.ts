import type { ResolvedSkill } from '../../configuration/resolution.ts'
import { KiError } from '../../errors.ts'

/** The parts of a development port the write interlock needs. */
export interface DevelopmentWriteTreePort {
  readonly developmentLinked: (identifier: string) => Promise<boolean>
  /** The Git working-tree root containing a path, or undefined when it is not inside one. */
  readonly repositoryRoot: (path: string) => Promise<string | undefined>
}

const treeDescription = (root: string | undefined, path: string): string =>
  root ?? `${path}, which is not inside a Git working tree`

/**
 * Permit a development write only into a dev-linked Harness whose publication root is in the caller's working tree.
 * A dev-linked install resolves through to its development checkout, so the publication root can be a working tree
 * the caller is not in, another worktree of the same repository included. Only equal working-tree roots permit the
 * write; differing roots, and either side not being a working tree at all, refuse. This is a safety interlock on
 * which tree receives bytes, not isolation.
 */
export const assertDevelopmentWriteTree = async (
  port: DevelopmentWriteTreePort,
  resolved: ResolvedSkill,
  publicationRoot: string,
  workingDirectory: string,
  subject: string
): Promise<void> => {
  // This command resolves only installed skills; repository-local providers are not development Harnesses.
  /* v8 ignore next -- resolveInstalledSkill supplies the port result. */
  if (resolved.provider.kind !== 'installed-harness') {
    throw new KiError(`${resolved.identity} is not an installed Harness capability`, 1)
  }
  if (!(await port.developmentLinked(resolved.provider.harness.id))) {
    throw new KiError(
      `${resolved.identity} is an installed payload; run ki dev local on before writing its ${subject}`,
      1
    )
  }
  const [callerRoot, publicationTree] = await Promise.all([
    port.repositoryRoot(workingDirectory),
    port.repositoryRoot(publicationRoot)
  ])
  if (callerRoot === undefined || callerRoot !== publicationTree) {
    throw new KiError(
      `${resolved.identity} ${subject} belongs to ${treeDescription(publicationTree, publicationRoot)}, not to the current working tree ${treeDescription(callerRoot, workingDirectory)}; --write publishes only within the working tree you are in`,
      2
    )
  }
}
