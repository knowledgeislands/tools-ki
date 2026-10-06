import type { BootstrapOperationEvent, BootstrapOperationPort, BootstrapRefreshResult } from './types.ts'

// The core bootstrap set plus every other configured skill the restored archive provides.
/* v8 ignore start -- Only reached after a lost binding is replaced by the pinned canonical archive, which no sandbox fixture can match. */
const withConfiguredSkills = <Skill>(
  core: readonly Skill[],
  available: readonly Skill[],
  configured: ReadonlySet<string>,
  name: (skill: Skill) => string
): readonly Skill[] => {
  const names = new Set(core.map(name))
  return [...core, ...available.filter((skill) => configured.has(name(skill)) && !names.has(name(skill)))]
}
/* v8 ignore stop */

export const bootstrapEnvironment = async <Agent, Skill, Projection>(
  port: BootstrapOperationPort<Agent, Skill, Projection>,
  options: { readonly refresh?: boolean },
  emit: (event: BootstrapOperationEvent) => void
): Promise<void> => {
  const previous = await port.inspectConfiguration()
  const canonicalPrefix = `${port.canonicalHarnessIdentifier}:`
  const configuredCanonical = new Set(
    previous.skills
      .filter((skill) => skill.startsWith(canonicalPrefix))
      .map((skill) => skill.slice(canonicalPrefix.length))
  )
  const canonicalLocal = previous.locals.find((local) => local.harness === port.canonicalHarnessIdentifier)
  const binding = await port.developmentBinding(canonicalLocal)
  // An active binding is only reported for a configured source, so the checkout to keep is always known.
  const activeLocal =
    canonicalLocal && binding.state === 'active' ? await port.inspectLocalHarness(canonicalLocal) : undefined
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
      refreshed = await port.refreshConfiguration(agents, previous.locals, {
        dropLegacyRepositories: true
      })
      return
    }
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

  let projections: readonly Projection[]
  if (activeLocal) {
    // Keep the active local development binding: project bootstrap skills from the checkout, as
    // `ki dev local on` does, and leave the verified archive to an explicit `ki dev local off`.
    projections = await port.installSkills(activeLocal.skills, agents, {
      replace: true,
      finalize: () => reconcileConfiguration(activeLocal.skills)
    })
    emit({ kind: 'canonical-harness-local', path: activeLocal.harness })
  } else {
    if (binding.state === 'unavailable') {
      emit({
        kind: 'development-binding-lost',
        harness: port.canonicalHarnessIdentifier,
        reason: binding.reason,
        target: binding.target,
        ...(canonicalLocal ? { configured: canonicalLocal.path } : {})
      })
    }
    const installation = await port.restoreCanonicalHarness()
    const bootstrapSkills = await port.installedSkills()
    // Links left by a lost development binding point into its checkout, so every configured canonical
    // skill the archive provides is re-pointed, as `ki dev local off` does, not only the core set.
    // A lost binding is replaced by downloading the pinned canonical archive, which no sandbox fixture can match.
    /* v8 ignore next */
    const skills =
      binding.state === 'unavailable'
        ? withConfiguredSkills(
            bootstrapSkills,
            await port.installedHarnessSkills(),
            configuredCanonical,
            port.skillName
          )
        : bootstrapSkills
    projections = await port.installSkills(skills, agents, {
      replace: options.refresh || binding.state === 'unavailable',
      finalize: () => reconcileConfiguration(skills)
    })
    emit({ kind: 'canonical-harness', ...installation })
  }
  if (refreshed) emit({ kind: 'configuration-refreshed', agents: agents.length, ...refreshed })
  if (migrated) emit({ kind: 'repositories-migrated', repositories: migrated })
  for (const projection of projections) emit({ kind: 'skill-projection', ...port.projectionView(projection) })
}
