// Public surface of the agents subsystem. Vendor descriptors live under `vendors/`; runtime-neutral
// detection and descriptor types live under `shared/`. The remaining modules coordinate KI behaviour.
export {
  configureBootstrapAgents,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  installedHarnessSkillSources,
  localBootstrapHarness,
  localHarness,
  refreshUserConfiguration
} from './bootstrap.ts'
export {
  clearLocalBootstrapHarness,
  configuredAgents,
  inspectUserConfiguration,
  migrateLegacyRepositoryRegistry,
  setConfiguredUserSkills,
  setLocalBootstrapHarness
} from './configuration.ts'
export { compatibleWithSkill } from './runtimes.ts'
export { agentSkillDirectory } from './shared/index.ts'
export { addRepoSkill, addUserSkill, removeRepoSkill, removeUserSkill } from './skills.ts'
