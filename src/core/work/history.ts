import { KiError } from '../errors.ts'
import type { Runner } from '../runtime/runner.ts'
import { isWorkItemFile, parseWorkItem, type WorkItem } from './items.ts'
import type { RepositoryPlanningSource } from './planning.ts'

export interface HistoricalWorkItemContext {
  readonly runner: Runner
  readonly environment: NodeJS.ProcessEnv
}

interface HistoricalWorkItemEntry {
  readonly file: string
  readonly regular: boolean
}

const regularTreeEntries = new Set(['100644 blob', '100755 blob'])

const treeEntry = (value: string): HistoricalWorkItemEntry => {
  const match = /^(\d{6}) ([a-z]+) [a-f0-9]+\t([\s\S]+)$/.exec(value)
  /* v8 ignore next 2 -- Successful git ls-tree output always follows its documented mode/type/object/path record shape. */
  if (!match?.[1] || !match[2] || !match[3]) throw new KiError('git returned a malformed work-item tree entry', 2)
  return {
    file: match[3],
    regular: regularTreeEntries.has(`${match[1]} ${match[2]}`)
  }
}

export const readWorkItemsAtCommit = async (
  repository: string,
  planning: RepositoryPlanningSource,
  commit: string,
  context: HistoricalWorkItemContext
): Promise<readonly WorkItem[]> => {
  const tree = await context.runner(
    'git',
    ['-C', repository, 'ls-tree', '-z', `${commit}:${planning.directory}`],
    context.environment
  )
  if (tree.exitCode !== 0)
    throw new KiError(`commit ${commit} has no selected ${planning.directory} work-item snapshot`, 2)

  const entries = tree.output
    .split('\0')
    .filter(Boolean)
    .map(treeEntry)
    .filter(({ file }) => isWorkItemFile(file, planning.adapter))
    .sort((left, right) => left.file.localeCompare(right.file))
  const items = await Promise.all(
    entries.map(async ({ file, regular }) => {
      if (!regular) throw new KiError(`work item ${file} must be a regular file at commit ${commit}`, 2)
      const path = `${planning.directory}/${file}`
      const source = await context.runner(
        'git',
        ['-C', repository, 'cat-file', 'blob', `${commit}:${path}`],
        context.environment
      )
      if (source.exitCode !== 0) throw new KiError(`work item ${file} cannot be read from commit ${commit}`, 2)
      return parseWorkItem(source.output, file, planning.adapter)
    })
  )
  return items.sort((left, right) => left.id.localeCompare(right.id))
}
