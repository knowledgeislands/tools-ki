import { KiError } from '../../errors.ts'
import { prepareScopedWrites, prepareWrites, publishWrites } from '../../filesystem/index.ts'
import { discoverInstalledHarnesses } from '../../harness/index.ts'
import {
  detectFixed,
  type Finding,
  type FixedItem,
  type PreparedSkill,
  runSkillAudit,
  runSkillConform,
  type SkillConformResult
} from '../../runtime/index.ts'
import { publishIndependentConformGroups } from '../../runtime/publication.ts'
import { type RepositoryConformCommand, resolveRepositoryTargets, runRepositoryConformCommands } from '../index.ts'
import { runPreparedWithProgress, runWithProgress } from '../progress/run.ts'
import { localRepositoryRegistryWrites, repositorySkillActivation } from './local-state.ts'
import { resolveSkillsForRepositories } from './selection.ts'
import type { RepositoryOperationContext, RepositorySelection } from './types.ts'

interface ConformedRepositorySkill {
  readonly skill: import('../../configuration/index.ts').ResolvedSkill
  readonly prepared: PreparedSkill
  readonly conform: SkillConformResult
}

export interface RepositoryConformReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
  readonly fixed?: readonly FixedItem[]
}

export type RepositoryConformEvent =
  | { readonly kind: 'registry-write'; readonly path: string; readonly dryRun: boolean }
  | { readonly kind: 'proposed-write'; readonly path: string }
  | { readonly kind: 'proposed-run'; readonly command: RepositoryConformCommand }
  | { readonly kind: 'proposed-activation'; readonly name: string }
  | { readonly kind: 'activate'; readonly name: string }
  | { readonly kind: 'would-apply-write'; readonly path: string }
  | { readonly kind: 'would-run'; readonly command: RepositoryConformCommand }
  | { readonly kind: 'applied-write'; readonly path: string }
  | { readonly kind: 'run'; readonly command: RepositoryConformCommand }
  | { readonly kind: 'nothing-staged' }
  | { readonly kind: 'independent-publication'; readonly text: string }

export interface RepositoryConformObserver {
  readonly event: (event: RepositoryConformEvent) => void
  readonly repositoryStarted: (repository: string, skills: readonly { readonly identity: string }[]) => void
  readonly reports: (repository: string, reports: readonly RepositoryConformReport[]) => void
}

export interface RepositoryConformOptions extends RepositorySelection {
  readonly dryRun: boolean
  readonly allowCommands: boolean
}

const repositoryTargets = (context: RepositoryOperationContext, selection: RepositorySelection) =>
  resolveRepositoryTargets({
    repositories: selection.repositories,
    agora: selection.agora,
    estate: selection.estate,
    configurationDirectory: context.configurationDirectory,
    stateDirectory: context.stateDirectory,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })

export const conformRepositories = async (
  context: RepositoryOperationContext,
  options: RepositoryConformOptions,
  observer: RepositoryConformObserver
): Promise<void> => {
  const repositories = await repositoryTargets(context, options)
  const harnesses = await discoverInstalledHarnesses(context.dataDirectory)
  for (const repository of repositories) {
    // The local registry is an inventory of selected KI repository roots, not a
    // conformance verdict. Publish it before parsing declarations or evaluating
    // the selected skills so a failing repository stays discoverable for repair.
    const registryWrites = await localRepositoryRegistryWrites(context, repository)
    for (const write of registryWrites)
      observer.event({ kind: 'registry-write', path: write.path, dryRun: options.dryRun })
    await publishWrites(registryWrites, options.dryRun)

    const resolved = await resolveSkillsForRepositories([repository], harnesses, options.skill)
    const selected = resolved[0]
    // The one-element input above guarantees this result; retain a guard for a future resolver change.
    /* v8 ignore next */
    if (!selected) throw new KiError('repository conform lost its selected repository before resolution', 1)
    const { skills } = selected
    const repositorySkills = await repositorySkillActivation(context, repository, skills)
    observer.repositoryStarted(repository.root, skills)
    const conformed: readonly ConformedRepositorySkill[] = await runWithProgress(
      skills,
      async (skill, itemProgress) => ({
        skill: skill.skill,
        prepared: skill,
        conform: await runSkillConform(
          {
            kind: 'repository',
            repository: repository.root,
            userHome: context.homeDirectory,
            lstat: context.lstat,
            ...(repositorySkills ? { repositorySkills: repositorySkills.rubric } : {})
          },
          skill,
          {
            onItemStart: (item) => itemProgress.onItemStart(item.code),
            onItemComplete: (item) => itemProgress.onItemComplete(item.code),
            onProgressEvent: itemProgress.onProgressEvent
          }
        )
      }),
      context.progress.resolved(skills, 'conform', 'root')
    )
    const findings = conformed.flatMap(({ conform }) => conform.findings)
    const initialReports = (): readonly RepositoryConformReport[] =>
      conformed.map(({ prepared, conform }) => ({ skill: prepared, findings: conform.findings }))
    const reAuditAndReport = async (): Promise<boolean> => {
      const prepared = conformed.map((entry) => entry.prepared)
      const reaudited = await runPreparedWithProgress(
        prepared,
        async (skill, itemProgress) => {
          const previous = conformed.find((entry) => entry.skill.identity === skill.skill.identity)
          // The re-audit selection is derived directly from conformed above; this only
          // protects a future refactor from pairing an audit with the wrong conform set.
          /* v8 ignore next */
          if (!previous) throw new KiError(`repository conform lost ${skill.skill.identity} before re-audit`, 1)
          const reAuditRepositorySkills = await repositorySkillActivation(context, repository, skills)
          return {
            prepared: skill,
            conform: previous.conform,
            audit: await runSkillAudit(
              {
                kind: 'repository',
                repository: repository.root,
                userHome: context.homeDirectory,
                lstat: context.lstat,
                ...(reAuditRepositorySkills ? { repositorySkills: reAuditRepositorySkills.rubric } : {})
              },
              skill,
              {
                onItemStart: (item) => itemProgress.onItemStart(item.code),
                onItemComplete: (item) => itemProgress.onItemComplete(item.code),
                onProgressEvent: itemProgress.onProgressEvent
              }
            )
          }
        },
        context.progress.prepared(prepared, 're-audit', 'root')
      )
      const auditFindings = reaudited.flatMap(({ audit }) => audit.findings)
      const fixedBySkill = reaudited.map(({ conform, audit }) => detectFixed(conform.fixable, audit.items))
      observer.reports(
        repository.root,
        reaudited.map(({ prepared, audit }, index) => ({
          skill: prepared,
          findings: audit.findings,
          fixed: fixedBySkill[index]
        }))
      )
      return auditFindings.some((finding) => finding.level === 'fail')
    }
    if (repositorySkills?.hasProposals()) {
      for (const name of repositorySkills.proposedNames()) observer.event({ kind: 'proposed-activation', name })
      if (options.dryRun) {
        observer.reports(repository.root, initialReports())
        throw new KiError('repository conform dry-run left proposed runtime-skill activation unapplied', 1)
      }
      try {
        for (const name of repositorySkills.proposedNames()) observer.event({ kind: 'activate', name })
        await repositorySkills.apply()
      } catch (error) {
        if (repositorySkills.started()) await reAuditAndReport()
        else observer.reports(repository.root, initialReports())
        throw error
      }
      if (await reAuditAndReport()) throw new KiError('repository conform re-audit found failures', 1)
      continue
    }
    if (findings.some((finding) => finding.level === 'fail')) {
      const published = await publishIndependentConformGroups(conformed, {
        repository: repository.root,
        userHome: context.homeDirectory,
        dryRun: options.dryRun,
        allowCommands: options.allowCommands,
        write: (text) => observer.event({ kind: 'independent-publication', text })
      })
      if (published && !options.dryRun) await reAuditAndReport()
      else observer.reports(repository.root, initialReports())
      throw new KiError(
        `repository conform ${options.dryRun ? 'dry run ' : ''}completed independent publication with unresolved groups; blocking failure: repository conform found failures`,
        1
      )
    }
    const repositoryWrites = await prepareWrites(
      repository.root,
      conformed.filter(({ conform }) => conform.scope.kind === 'repository').flatMap(({ conform }) => conform.writes)
    )
    const scopedUserWrites = conformed.flatMap(({ conform }) => {
      const scope = conform.scope
      if (scope.kind !== 'user-home') return []
      return conform.writes.map((write) => ({ write, scope: { paths: scope.paths } }))
    })
    const userWrites = await prepareScopedWrites(context.homeDirectory, scopedUserWrites)
    const writes = [...repositoryWrites, ...userWrites]
    const commands = conformed.flatMap(({ conform }) => conform.commands)
    if (conformed.some(({ conform }) => conform.scope.kind === 'user-home' && conform.commands.length))
      throw new KiError(
        'user-home rubric conform actions must be guarded direct writes; conform commands are not permitted',
        1
      )
    for (const write of writes) observer.event({ kind: 'proposed-write', path: write.path })
    for (const command of commands) observer.event({ kind: 'proposed-run', command })
    let publicationError: unknown
    try {
      await publishWrites(writes, options.dryRun)
    } catch (error) {
      publicationError = error
    }
    if (publicationError) {
      observer.reports(repository.root, initialReports())
      throw publicationError
    }
    if (options.dryRun) {
      for (const write of writes) observer.event({ kind: 'would-apply-write', path: write.path })
      for (const command of commands) observer.event({ kind: 'would-run', command })
      observer.reports(repository.root, initialReports())
      continue
    }
    if (!writes.length && !commands.length && !repositorySkills?.hasProposals()) {
      observer.event({ kind: 'nothing-staged' })
      observer.reports(repository.root, initialReports())
      continue
    }
    for (const write of writes) observer.event({ kind: 'applied-write', path: write.path })
    for (const command of commands) observer.event({ kind: 'run', command })
    await runRepositoryConformCommands(repository.root, commands)
    if (await reAuditAndReport()) throw new KiError('repository conform re-audit found failures', 1)
  }
}
