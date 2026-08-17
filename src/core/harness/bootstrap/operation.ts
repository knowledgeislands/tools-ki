import type {
  BootstrapInstallationResult,
  BootstrapOperationEvent,
  BootstrapOperationPort,
  BootstrapRefreshResult
} from './types.ts'

export const bootstrapEnvironment = async <Agent, Skill, Projection>(
  port: BootstrapOperationPort<Agent, Skill, Projection>,
  options: { readonly refresh?: boolean },
  emit: (event: BootstrapOperationEvent) => void
): Promise<void> => {
  const previous = await port.inspectConfiguration()
  const previousConfiguration = previous.state === 'valid' ? await port.readConfiguration() : undefined
  const activeLocal =
    previous.local !== null && (await port.developmentEnabled(previous.local))
      ? await port.inspectLocalHarness(previous.local)
      : undefined
  const migrated = options.refresh ? await port.migrateLegacyRepositories() : 0
  const configuration = await port.configureAgents({
    refresh: options.refresh,
    dropLegacyRepositories: Boolean(options.refresh)
  })
  const agents = configuration.agents
  const agentIds = agents.map(port.agentId)
  if (configuration.disposition === 'created') emit({ kind: 'configuration-created', agentIds })
  if (configuration.disposition === 'refreshed') emit({ kind: 'agents-refreshed', agentIds })

  let refreshed: BootstrapRefreshResult | undefined
  const reconcileConfiguration = async (skills: readonly Skill[]): Promise<void> => {
    if (options.refresh) {
      refreshed = await port.refreshConfiguration(agents, previous.local ?? undefined, {
        dropLegacyRepositories: true
      })
      return
    }
    await port.clearLocalHarness()
    const selected = new Map<string, string>(
      (await port.inspectConfiguration()).skills.map(
        (identity) => [identity.slice(identity.lastIndexOf(':') + 1), identity] as const
      )
    )
    for (const skill of skills.map(port.skillName)) {
      selected.set(skill, `${port.canonicalHarnessIdentifier}:${skill}`)
    }
    await port.setConfiguredSkills([...selected.values()].sort((left, right) => left.localeCompare(right)))
  }

  let installation: BootstrapInstallationResult
  let projections: readonly Projection[]
  if (activeLocal) {
    const skills = await port.installedSkills({ preserveHarnessRoot: true })
    let restored: BootstrapInstallationResult | undefined
    try {
      projections = await port.installSkills(skills, agents, {
        replace: true,
        finalize: async () => {
          await reconcileConfiguration(skills)
          restored = await port.restoreCanonicalHarness()
        }
      })
    } catch (error) {
      /* v8 ignore next -- Active-local detection requires a valid configuration snapshot. */
      if (previousConfiguration === undefined) throw error
      await port.restoreConfiguration(previousConfiguration)
      throw error
    }
    /* v8 ignore next -- installSkills resolves only after its finalize callback completes. */
    if (!restored) throw new Error('canonical harness restoration did not complete')
    installation = restored
  } else {
    installation = await port.restoreCanonicalHarness()
    const skills = await port.installedSkills()
    projections = await port.installSkills(skills, agents, {
      replace: options.refresh,
      finalize: () => reconcileConfiguration(skills)
    })
  }

  emit({ kind: 'canonical-harness', ...installation })
  if (refreshed) emit({ kind: 'configuration-refreshed', agents: agents.length, ...refreshed })
  if (migrated) emit({ kind: 'repositories-migrated', repositories: migrated })
  for (const projection of projections) emit({ kind: 'skill-projection', ...port.projectionView(projection) })
}
