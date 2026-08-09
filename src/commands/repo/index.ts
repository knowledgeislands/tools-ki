import { realpath, rm } from 'node:fs/promises'
import { Command } from 'commander'
import { configuredRepositoryWrite, inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import {
  REPOSITORY_CONFIGURATION_FILE,
  readRepositoryDeclaration,
  renderRepositoryConfiguration
} from '../../core/configuration.ts'
import { publishIndependentConformGroups } from '../../core/conform-publication.ts'
import { KiError } from '../../core/errors.ts'
import { discoverInstalledHarnesses } from '../../core/harness.ts'
import { resolveRepositoryInitialisationTarget, resolveRepositoryTargets } from '../../core/repository.ts'
import {
  type AuditRepositorySummary,
  operationOptions,
  renderAuditFrameStart,
  renderAuditResults,
  renderConformFrameStart,
  renderConformReports,
  renderEducation,
  renderMultiRepositoryAuditSummary,
  runPreparedWithProgress,
  runWithEvidenceProgress,
  runWithProgress
} from '../../core/repository-reporting.ts'
import { renderRepositoryConformCommand, runRepositoryConformCommands } from '../../core/repository-subprocess.ts'
import { resolveDeclaredSkills } from '../../core/resolution.ts'
import {
  detectFixed,
  educateSkill,
  gatherSkillAuditEvidence,
  runGatheredSkillAudit,
  runSkillAudit,
  runSkillConform
} from '../../core/runtime.ts'
import { prepareScopedWrites, prepareWrites, publishWrites } from '../../core/transaction.ts'
import { repoHelpCommandNames } from '../root/catalogue.ts'
import { createRepairCommand } from './repair.ts'
import { createRepoRoadmapCommand } from './roadmap.ts'
import { createRepoSkillCommand } from './skill.ts'
import { createUpgradeCommand } from './upgrade.ts'

interface RepositoryConformOptions {
  readonly skill?: string
  readonly dryRun?: boolean
  readonly allowCommands?: boolean
  readonly progress?: string
  readonly progressStyle?: string
  readonly reporterLevels?: string
}

const localRepositoryRegistration = async (
  context: KiContext,
  repository: string,
  skills: readonly { readonly declaration: { readonly name: string } }[]
): Promise<string | undefined> => {
  if (!skills.some((skill) => skill.declaration.name === 'ki-repo')) return undefined
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing') return 'local KI configuration is missing; run `ki bootstrap` first'
  if (configuration.state === 'invalid') return `local KI configuration is invalid: ${configuration.errors.join('; ')}`
  if (!configuration.repositories.includes(repository)) return `local KI configuration does not register ${repository}`
  return undefined
}

const localRepositoryRegistryWrites = async (context: KiContext, repository: string) => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  // Repository conformance remains portable: a caller without a local KI installation has no
  // user registry to update. Once one exists, an invalid configuration remains a hard error.
  if (configuration.state === 'missing') return []
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  const registryWrite = await configuredRepositoryWrite(context.paths.config, repository)
  return registryWrite ? prepareWrites(await realpath(context.paths.config), [registryWrite]) : []
}

const resolveSkills = async (
  context: KiContext,
  options: { repositories: readonly string[]; agora?: string; skill?: string }
) => {
  const repositories = await resolveRepositoryTargets({
    repositories: options.repositories,
    agora: options.agora,
    configurationDirectory: context.paths.config,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })
  const harnesses = await discoverInstalledHarnesses(context.paths.data)
  return resolveSkillsForRepositories(repositories, harnesses, options.skill)
}

const resolveSkillsForRepositories = async (
  repositories: readonly { readonly root: string; readonly configuration: string }[],
  harnesses: Awaited<ReturnType<typeof discoverInstalledHarnesses>>,
  skill?: string
) =>
  Promise.all(
    repositories.map(async (repository) => ({
      repository,
      skills: resolveDeclaredSkills(await readRepositoryDeclaration(repository.configuration), harnesses, skill)
    }))
  )

export const createRepositoryOperations = (context: KiContext): Command => {
  const command = new Command('repo')
    .description('run operations for one or more KI repositories')
    .option(
      '--repo <path-or-pattern>',
      'repository root or pattern',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('--agora <name>', 'declared named Agora or the registered estate')
  const selectedRepositories = (): { readonly repositories: readonly string[]; readonly agora?: string } => {
    const options = command.opts<{ repo: readonly string[]; agora?: string }>()
    return { repositories: options.repo, agora: options.agora }
  }
  command
    .addCommand(createRepoRoadmapCommand(context, selectedRepositories))
    .addCommand(createRepairCommand(context, selectedRepositories))
    .addCommand(createRepoSkillCommand(context, selectedRepositories))
    .addCommand(createUpgradeCommand(context, selectedRepositories))
    .addCommand(
      new Command('init')
        .description('initialize one existing Git repository with an explicit KI identity')
        .argument('[directory]', 'existing Git repository root (default: current directory)')
        .option('--title <title>', 'repository title')
        .option('--description <description>', 'repository description')
        .option('--repo-code <code>', 'stable uppercase repository identifier')
        .option(
          '--runtime <runtime>',
          'supported runtime: claude-code or chatgpt-codex',
          (value: string, previous: readonly string[] = []) => [...previous, value],
          []
        )
        .option('--visibility <visibility>', 'repository visibility: public or private')
        .action(
          async (
            directory: string | undefined,
            options: {
              title?: string
              description?: string
              repoCode?: string
              runtime: readonly string[]
              visibility?: string
            }
          ) => {
            const selection = selectedRepositories()
            if (selection.repositories.length || selection.agora)
              throw new KiError('ki repo init does not accept --repo or --agora', 2)
            const configuration = renderRepositoryConfiguration({
              title: options.title ?? '',
              description: options.description ?? '',
              repoCode: options.repoCode ?? '',
              supportedRuntimes: options.runtime,
              visibility: options.visibility ?? ''
            })
            const repository = await resolveRepositoryInitialisationTarget({
              directory,
              workingDirectory: context.workingDirectory,
              environment: context.environment,
              runner: context.runner
            })
            // Resolve every write before changing state: a missing or invalid user
            // configuration cannot leave a new repository declaration behind.
            const registryWrite = await configuredRepositoryWrite(context.paths.config, repository.root)
            const declarationWrites = await prepareWrites(repository.root, [
              { path: REPOSITORY_CONFIGURATION_FILE, content: configuration, create: true }
            ])
            const registryWrites = registryWrite
              ? await prepareWrites(await realpath(context.paths.config), [registryWrite])
              : []
            await publishWrites(declarationWrites, false)
            try {
              await publishWrites(registryWrites, false)
            } catch (error) {
              await rm(repository.configuration)
              throw error
            }
            for (const write of [...declarationWrites, ...registryWrites]) context.stdout.write(`write ${write.path}\n`)
            context.stdout.write(`ki repo init: initialized ${repository.root}\n`)
          }
        )
    )
    .addCommand(
      new Command('educate')
        .description('explain maintenance for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to explain')
        .action(async (options: { skill?: string }) => {
          const selected = await resolveSkills(context, { ...options, ...selectedRepositories() })
          for (const { skills } of selected) {
            const output = { progress: 'auto' as const, progressStyle: 'single' as const, reporterLevels: [] }
            const educations = await runWithProgress(context, skills, (skill) => educateSkill(skill), output, 'educate')
            if (!educations.length) context.stdout.write('ki repo educate: no declared skills\n')
            else context.stdout.write(`${educations.flatMap(renderEducation).join('\n')}\n`)
          }
        })
    )
    .addCommand(
      new Command('audit')
        .description('run registered audit operations for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to audit')
        .option('--progress <mode>', 'progress: auto, always, or never (default: auto)')
        .option('--progress-style <style>', 'progress layout: single or multi (default: single)')
        .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN)')
        .action(
          async (options: { skill?: string; progress?: string; progressStyle?: string; reporterLevels?: string }) => {
            const output = operationOptions('audit', options)
            const selected = await resolveSkills(context, { ...options, ...selectedRepositories() })
            let failed = false
            const summaries: AuditRepositorySummary[] = []
            for (const [index, { repository, skills }] of selected.entries()) {
              if (index) context.stdout.write('\n')
              const reporter = renderAuditFrameStart(context, repository.root, skills)
              try {
                const results = await runWithEvidenceProgress(
                  context,
                  skills,
                  async (skill, evidenceProgress) =>
                    gatherSkillAuditEvidence(
                      {
                        kind: 'repository',
                        repository: repository.root,
                        userHome: context.homeDirectory,
                        lstat: context.lstat
                      },
                      skill,
                      evidenceProgress
                    ),
                  async (skill, evidence, itemProgress) => ({
                    skill,
                    audit: await runGatheredSkillAudit(skill, evidence, {
                      onItemStart: (item) => itemProgress.onItemStart(item.code),
                      onItemComplete: (item) => itemProgress.onItemComplete(item.code),
                      onProgressEvent: itemProgress.onProgressEvent
                    })
                  }),
                  output,
                  'audit'
                )
                const findings = results.flatMap(({ audit }) => audit.findings)
                const registration = await localRepositoryRegistration(context, repository.root, skills)
                summaries.push(
                  renderAuditResults(
                    reporter,
                    repository.root,
                    results.map(({ skill, audit }) => ({ skill, findings: audit.findings })),
                    output.reporterLevels,
                    registration
                  )
                )
                failed ||= Boolean(registration) || findings.some((finding) => finding.level === 'fail')
              } catch (error) {
                reporter.finish({ label: 'audit failed' })
                throw error
              }
            }
            if (summaries.length > 1) renderMultiRepositoryAuditSummary(context, summaries)
            if (failed) throw new KiError('repository audit found failures', 1)
          }
        )
    )
    .addCommand(
      new Command('conform')
        .description('stage registered conform operations and apply their writes after every initial audit passes')
        .option('--skill <capability>', 'one declared resolved skill to conform')
        .option('--dry-run', 'validate staged writes and report without applying them')
        .option('--allow-commands', 'attempt eligible command-backed conform groups during partial failures')
        .option('--progress <mode>', 'progress: auto, always, or never (default: auto)')
        .option('--progress-style <style>', 'progress layout: single or multi (default: single)')
        .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN,FIXED)')
        .action(async (options: RepositoryConformOptions) => {
          const output = operationOptions('conform', options)
          const repositories = await resolveRepositoryTargets({
            ...selectedRepositories(),
            configurationDirectory: context.paths.config,
            workingDirectory: context.workingDirectory,
            homeDirectory: context.homeDirectory
          })
          const harnesses = await discoverInstalledHarnesses(context.paths.data)
          for (const repository of repositories) {
            // The local registry is an inventory of selected KI repository roots, not a
            // conformance verdict. Publish it before parsing declarations or evaluating
            // the selected skills so a failing repository stays discoverable for repair.
            const registryWrites = await localRepositoryRegistryWrites(context, repository.root)
            for (const write of registryWrites)
              context.stdout.write(`${options.dryRun ? 'would write' : 'write'} ${write.path}\n`)
            await publishWrites(registryWrites, Boolean(options.dryRun))

            const resolved = await resolveSkillsForRepositories([repository], harnesses, options.skill)
            const selected = resolved[0]
            // The one-element input above guarantees this result; retain a guard for a future resolver change.
            /* v8 ignore next */
            if (!selected) throw new KiError('repository conform lost its selected repository before resolution', 1)
            const { skills } = selected
            const reporter = renderConformFrameStart(context, repository.root, skills)
            const conformed = await runWithProgress(
              context,
              skills,
              async (skill, itemProgress) => ({
                skill: skill.skill,
                prepared: skill,
                conform: await runSkillConform(
                  {
                    kind: 'repository',
                    repository: repository.root,
                    userHome: context.homeDirectory,
                    lstat: context.lstat
                  },
                  skill,
                  {
                    onItemStart: (item) => itemProgress.onItemStart(item.code),
                    onItemComplete: (item) => itemProgress.onItemComplete(item.code),
                    onProgressEvent: itemProgress.onProgressEvent
                  }
                )
              }),
              output,
              'conform'
            )
            const findings = conformed.flatMap(({ conform }) => conform.findings)
            const renderInitialReports = () =>
              renderConformReports(
                reporter,
                conformed.map(({ prepared, conform }) => ({ skill: prepared, findings: conform.findings })),
                output.reporterLevels
              )
            const reAuditAndRender = async (): Promise<boolean> => {
              const reaudited = await runPreparedWithProgress(
                context,
                conformed.map(({ prepared }) => prepared),
                async (skill, itemProgress) => {
                  const previous = conformed.find((entry) => entry.skill.identity === skill.skill.identity)
                  // The re-audit selection is derived directly from conformed above; this only
                  // protects a future refactor from pairing an audit with the wrong conform set.
                  /* v8 ignore next */
                  if (!previous) throw new KiError(`repository conform lost ${skill.skill.identity} before re-audit`, 1)
                  return {
                    prepared: skill,
                    conform: previous.conform,
                    audit: await runSkillAudit(
                      {
                        kind: 'repository',
                        repository: repository.root,
                        userHome: context.homeDirectory,
                        lstat: context.lstat
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
                output,
                'verify'
              )
              const auditFindings = reaudited.flatMap(({ audit }) => audit.findings)
              const fixedBySkill = reaudited.map(({ conform, audit }) => detectFixed(conform.fixable, audit.items))
              renderConformReports(
                reporter,
                reaudited.map(({ prepared, audit }, index) => ({
                  skill: prepared,
                  findings: audit.findings,
                  fixed: fixedBySkill[index]
                })),
                output.reporterLevels
              )
              return auditFindings.some((finding) => finding.level === 'fail')
            }
            if (findings.some((finding) => finding.level === 'fail')) {
              const published = await publishIndependentConformGroups(conformed, {
                repository: repository.root,
                userHome: context.homeDirectory,
                dryRun: Boolean(options.dryRun),
                allowCommands: Boolean(options.allowCommands),
                write: (value) => context.stdout.write(value)
              })
              if (published && !options.dryRun) await reAuditAndRender()
              else renderInitialReports()
              throw new KiError(
                `repository conform ${options.dryRun ? 'dry run ' : ''}completed independent publication with unresolved groups; blocking failure: repository conform found failures`,
                1
              )
            }
            const repositoryWrites = await prepareWrites(
              repository.root,
              conformed
                .filter(({ conform }) => conform.scope.kind === 'repository')
                .flatMap(({ conform }) => conform.writes)
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
            for (const write of writes) context.stdout.write(`proposed write ${write.path}\n`)
            for (const command of commands)
              context.stdout.write(`proposed run ${renderRepositoryConformCommand(command)}\n`)
            let publicationError: unknown
            try {
              await publishWrites(writes, Boolean(options.dryRun))
            } catch (error) {
              publicationError = error
            }
            if (publicationError) {
              renderInitialReports()
              throw publicationError
            }
            if (options.dryRun) {
              for (const write of writes) context.stdout.write(`would apply write ${write.path}\n`)
              for (const command of commands)
                context.stdout.write(`would run ${renderRepositoryConformCommand(command)}\n`)
              renderInitialReports()
              continue
            }
            for (const write of writes) context.stdout.write(`applied write ${write.path}\n`)
            for (const command of commands) context.stdout.write(`run ${renderRepositoryConformCommand(command)}\n`)
            await runRepositoryConformCommands(repository.root, commands)
            if (await reAuditAndRender()) throw new KiError('repository conform re-audit found failures', 1)
          }
        })
    )

  ;(command.commands as Command[]).sort(
    (left, right) =>
      repoHelpCommandNames.indexOf(left.name() as (typeof repoHelpCommandNames)[number]) -
      repoHelpCommandNames.indexOf(right.name() as (typeof repoHelpCommandNames)[number])
  )
  return command
}
