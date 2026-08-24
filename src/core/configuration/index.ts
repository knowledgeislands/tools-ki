export type { RepositoryDeclaration } from './declaration.ts'
export {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  declareRepositorySkill,
  REPOSITORY_CONFIGURATION_FILE,
  readRepositoryDeclaration,
  renderRepositoryConfiguration,
  undeclareRepositorySkill
} from './declaration.ts'
export { resolveRepositoryDeclaredSkills } from './local-provider.ts'
export type { ResolvedSkill } from './resolution.ts'
export { resolveInstalledSkill } from './resolution.ts'
