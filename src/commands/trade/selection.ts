import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { type RepositoryLocation, resolveRepositoryTargets } from '../../core/repository/index.ts'
import { localRegisteredRepository } from '../../core/trade/index.ts'
import type { SelectRepositories } from '../repo/selection.ts'

export interface TradeSelection {
  readonly selected: () => Promise<readonly RepositoryLocation[]>
  readonly aggregate: () => boolean
  readonly one: () => Promise<KiContext>
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
  return {
    selected,
    aggregate: () => Boolean(selection().estate || selection().agora),
    one: async () => {
      const repositories = await selected()
      if (repositories.length !== 1) throw new KiError('ki repo trade requires exactly one repository', 2)
      return { ...context, workingDirectory: (repositories[0] as RepositoryLocation).root }
    }
  }
}
