import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { type RepositoryLocation, resolveRepositoryTargets } from '../../core/repository/index.ts'
import { registeredRepositories } from '../../core/trade/estate.ts'
import { localRegisteredRepository } from '../../core/trade/index.ts'
import { type RegisteredRepository, tradeError } from '../../core/trade/model.ts'
import type { SelectRepositories } from '../repo/selection.ts'

export interface TradeSelection {
  readonly selected: () => Promise<readonly RepositoryLocation[]>
  readonly aggregate: () => boolean
  readonly one: () => Promise<KiContext>
  /**
   * The selected trading repositories whose territory Capital does not resolve. An aggregate view
   * states each skip; a single-repository view fails closed with the resolution message instead.
   */
  readonly skipped: (repositories: readonly RepositoryLocation[]) => Promise<readonly RegisteredRepository[]>
}

export const tradeSelection = (context: KiContext, selection: SelectRepositories): TradeSelection => {
  const selected = async (): Promise<readonly RepositoryLocation[]> => {
    const repositories = await resolveRepositoryTargets({
      ...selection(),
      configurationDirectory: context.paths.config,
      stateDirectory: context.paths.state,
      workingDirectory: context.workingDirectory,
      homeDirectory: context.homeDirectory
    })
    await Promise.all(
      repositories.map((repository) => localRegisteredRepository({ ...context, workingDirectory: repository.root }))
    )
    return repositories
  }
  const aggregate = (): boolean => Boolean(selection().estate || selection().agora)
  return {
    selected,
    aggregate,
    one: async () => {
      const repositories = await selected()
      if (repositories.length !== 1) throw new KiError('ki repo trade requires exactly one repository', 2)
      return { ...context, workingDirectory: (repositories[0] as RepositoryLocation).root }
    },
    skipped: async (repositories) => {
      const roots = new Set(repositories.map((repository) => repository.root))
      const skipped = (await registeredRepositories(context)).filter(
        (repository) => roots.has(repository.root) && repository.skipped
      )
      const first = skipped[0]
      if (first && repositories.length === 1 && !aggregate()) throw tradeError(first.skipped as string)
      return skipped
    }
  }
}
