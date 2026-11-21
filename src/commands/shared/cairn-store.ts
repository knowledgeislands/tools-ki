import type { KiContext } from '../../context.ts'
import { xdgConfigHome } from '../../core/paths.ts'
import { configuredCairnStore, readCairnConfiguration } from '../../core/work/package.ts'

/**
 * Finds the rig's Cairn store, whose territory register ranks territories, where `ki work banner`
 * finds it: `MCP_CAIRN_STORE`, then the rig's Cairn configuration. An unreadable configuration is a
 * warning, and territories keep their configuration ranking.
 */
export const cairnStoreLocator = (context: KiContext) => async (): Promise<string | undefined> => {
  try {
    const configuration = await readCairnConfiguration(xdgConfigHome(context.environment), context.homeDirectory)
    return configuredCairnStore(context.environment, configuration, context.workingDirectory)
  } catch (error) {
    context.stderr.write(`ki: warning: ${(error as Error).message}; territories keep their configuration ranking\n`)
    return undefined
  }
}
