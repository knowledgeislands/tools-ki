import { inspectLocalSources, inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import type { ManageConfiguration } from '../../core/manage/index.ts'

/** The user configuration with its remembered checkouts read from their host-local file. */
export const manageConfiguration = async (context: KiContext): Promise<ManageConfiguration> => {
  const [settings, sources] = await Promise.all([
    inspectUserConfiguration(context.paths.config),
    inspectLocalSources(context.paths.config, context.paths.state)
  ])
  // An invalid host-local checkout file fails the configuration check rather than being skipped.
  return sources.state === 'invalid' && settings.state === 'valid'
    ? { ...settings, state: 'invalid', locals: [], errors: sources.errors }
    : { ...settings, locals: sources.locals }
}
