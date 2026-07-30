// Public surface of the agents subsystem. Implementations live in focused modules —
// `internal` (descriptors, types, shared helpers), `configuration` (render/read/inspect),
// `detection` (agent discovery), `skills` (user/repo skill linking), and `bootstrap`
// (bootstrap orchestration) — each importing only from the ones below it.
export {
  configureBootstrapAgents,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  localBootstrapHarness,
  refreshUserConfiguration
} from './bootstrap.ts'
export {
  clearLocalBootstrapHarness,
  configuredAgents,
  configuredRepositoryWrite,
  inspectUserConfiguration,
  setConfiguredUserSkills,
  setLocalBootstrapHarness
} from './configuration.ts'
export { agentSkillDirectory } from './detection.ts'
export type { InstalledAgent } from './internal.ts'
export { compatibleWithSkill } from './runtimes.ts'
export { addRepoSkill, addUserSkill, removeRepoSkill, removeUserSkill } from './skills.ts'
