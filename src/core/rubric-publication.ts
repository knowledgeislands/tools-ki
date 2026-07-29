import { lstat, readFile, realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import type { ConformWrite, RubricPublication, SkillRubricDefinition } from './rubric.ts'
import { renderRubricMarkdown } from './rubric-render.ts'

const publicationPath = 'references/rubric.md'

const missingFile = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

const containedRelativePath = (root: string, target: string): string | undefined => {
  const path = relative(root, target)
  if (path === '..' || path.startsWith('../')) return undefined
  return path
}

const readPublication = async (target: string, stat: typeof lstat): Promise<string | undefined> => {
  const state = await stat(target).catch((error: unknown) => {
    if (missingFile(error)) return undefined
    throw error
  })
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('rubric publication target must be a regular file', 1)
  return readFile(target, 'utf8')
}

export interface PreparedRubricPublication {
  readonly evidence: Omit<RubricPublication, 'propose'>
  readonly displayTarget: string
  readonly publicationRoot: string
  readonly proposal: () => ConformWrite
}

/**
 * Loads the same validated catalogue bytes for standalone inspection and for a
 * repository rubric context. A proposal is possible only when the publication
 * physically belongs to the caller's publication root.
 */
export const prepareRubricPublication = async (
  skill: ResolvedSkill,
  definition: SkillRubricDefinition<unknown>,
  publicationRoot?: string,
  stat: typeof lstat = lstat
): Promise<PreparedRubricPublication> => {
  const source = await realpath(join(skill.harness.root, skill.capability.source))
  const target = join(source, publicationPath)
  const existing = await readPublication(target, stat)
  const rendered = renderRubricMarkdown(definition)
  const root = publicationRoot === undefined ? source : await realpath(publicationRoot)
  const writePath = containedRelativePath(root, target)
  const state = existing === undefined ? 'missing' : existing === rendered ? 'in-sync' : 'stale'
  const evidence = {
    target: publicationPath,
    rendered,
    ...(existing === undefined ? {} : { existing }),
    state
  } as const

  return {
    evidence,
    displayTarget: join(skill.harness.root, skill.capability.source, publicationPath),
    publicationRoot: root,
    proposal: () => {
      if (!writePath) throw new KiError(`${skill.identity} rubric publication is outside the repository publication scope`, 1)
      return state === 'missing' ? { path: writePath, content: rendered, create: true } : { path: writePath, content: rendered }
    }
  }
}
