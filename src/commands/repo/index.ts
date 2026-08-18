import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import { createRepositorySkillActivation } from '../../agents/repository-skill-activation.ts'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import {
  auditRepositories,
  conformRepositories,
  educateRepositories,
  type RepositoryConformEvent,
  type RepositoryOperationContext,
  renderRepositoryConformCommand
} from '../../core/repository/index.ts'
import { presentationText, treeProgressPrefix } from '../presentation/index.ts'
import { repoHelpCommandNames } from '../root/catalogue.ts'
import { createRepoDiagCommand } from './diag.ts'
import { createRepoInitCommand } from './init.ts'
import { createRepoOpenCommand } from './open.ts'
import {
  type AuditRepositorySummary,
  operationOptions,
  renderAuditFrameStart,
  renderAuditResults,
  renderConciseAuditSummary,
  renderConciseConformSummary,
  renderConciseMultiRepositoryAuditSummary,
  renderConformFrameStart,
  renderConformReports,
  renderEducation,
  renderMultiRepositoryAuditSummary,
  repositoryOperationProgress
} from './presentation/index.ts'
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
  readonly concise?: boolean
}

const operationContext = (
  context: KiContext,
  progress: RepositoryOperationContext['progress']
): RepositoryOperationContext => ({
  configurationDirectory: context.paths.config,
  dataDirectory: context.paths.data,
  stateDirectory: context.paths.state,
  workingDirectory: context.workingDirectory,
  homeDirectory: context.homeDirectory,
  lstat: context.lstat,
  inspectUserConfiguration,
  createSkillActivation: (options) =>
    createRepositorySkillActivation({
      configurationDirectory: context.paths.config,
      homeDirectory: context.homeDirectory,
      ...options
    }),
  progress
})

const renderConformEvent = (event: RepositoryConformEvent): string => {
  switch (event.kind) {
    case 'registry-write':
      return `${event.dryRun ? 'would write' : 'write'} ${event.path}\n`
    case 'proposed-write':
      return `proposed write ${event.path}\n`
    case 'proposed-run':
      return `proposed run ${renderRepositoryConformCommand(event.command)}\n`
    case 'proposed-activation':
      return `proposed activate repository skill ${event.name}\n`
    case 'activate':
      return `activate repository skill ${event.name}\n`
    case 'would-apply-write':
      return `would apply write ${event.path}\n`
    case 'would-run':
      return `would run ${renderRepositoryConformCommand(event.command)}\n`
    case 'applied-write':
      return `applied write ${event.path}\n`
    case 'run':
      return `run ${renderRepositoryConformCommand(event.command)}\n`
    case 'nothing-staged':
      return `${treeProgressPrefix(`${presentationText('status.skip')}: nothing staged; no re-audit required`, 'root').trimEnd()}\n`
    case 'independent-publication':
      return event.text
  }
}

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
    .option('--estate', 'select every repository in the registered estate')
  const selectedRepositories = (): {
    readonly repositories: readonly string[]
    readonly agora?: string
    readonly estate?: boolean
  } => {
    const options = command.opts<{ repo: readonly string[]; agora?: string; estate?: boolean }>()
    return { repositories: options.repo, agora: options.agora, estate: options.estate }
  }
  command
    .addCommand(createRepoOpenCommand(context, selectedRepositories))
    .addCommand(createRepoRoadmapCommand(context, selectedRepositories))
    .addCommand(createRepoDiagCommand(context, selectedRepositories))
    .addCommand(createRepairCommand(context, selectedRepositories))
    .addCommand(createRepoSkillCommand(context, selectedRepositories))
    .addCommand(createUpgradeCommand(context, selectedRepositories))
    .addCommand(createRepoInitCommand(context, selectedRepositories))
    .addCommand(
      new Command('educate')
        .description('explain maintenance for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to explain')
        .action(async (options: { skill?: string }) => {
          const output = {
            progress: 'auto' as const,
            progressStyle: 'single' as const,
            reporterLevels: [],
            concise: false
          }
          await educateRepositories(
            operationContext(context, repositoryOperationProgress(context, output)),
            { ...options, ...selectedRepositories() },
            ({ educations }) => {
              if (!educations.length) context.stdout.write('ki repo educate: no declared skills\n')
              else context.stdout.write(`${educations.flatMap(renderEducation).join('\n')}\n`)
            }
          )
        })
    )
    .addCommand(
      new Command('audit')
        .description('run registered audit operations for declared skills')
        .option('--skill <capability>', 'one declared resolved skill to audit')
        .option('--progress <mode>', 'progress: auto, always, or never (default: auto)')
        .option('--progress-style <style>', 'progress layout: single or multi (default: multi on a TTY)')
        .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN)')
        .option('--concise', 'render only one final summary per repository')
        .action(
          async (options: {
            skill?: string
            progress?: string
            progressStyle?: string
            reporterLevels?: string
            concise?: boolean
          }) => {
            const output = operationOptions('audit', options)
            const summaries: AuditRepositorySummary[] = []
            let reporter: ReturnType<typeof renderAuditFrameStart> | undefined
            const result = await auditRepositories(
              operationContext(context, repositoryOperationProgress(context, output)),
              { ...options, ...selectedRepositories() },
              {
                repositoryStarted: (repository, skills, index) => {
                  if (index && !output.concise) context.stdout.write('\n')
                  reporter = output.concise
                    ? undefined
                    : renderAuditFrameStart(
                        context,
                        repository,
                        skills,
                        context.stdout.isTTY === true && output.progress !== 'never'
                      )
                },
                repositoryCompleted: ({ repository, reports, registration }) => {
                  summaries.push(
                    output.concise
                      ? renderConciseAuditSummary(context, repository, reports, registration)
                      : renderAuditResults(
                          reporter as NonNullable<typeof reporter>,
                          repository,
                          reports,
                          output.reporterLevels,
                          registration
                        )
                  )
                },
                repositoryFailed: () => reporter?.finish({ label: 'audit failed' })
              }
            )
            if (summaries.length > 1)
              if (output.concise) renderConciseMultiRepositoryAuditSummary(context, summaries)
              else renderMultiRepositoryAuditSummary(context, summaries)
            if (result.failed) throw new KiError('repository audit found failures', 1)
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
        .option('--progress-style <style>', 'progress layout: single or multi (default: multi on a TTY)')
        .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN,FIXED)')
        .option('--concise', 'render only one final summary per repository')
        .action(async (options: RepositoryConformOptions) => {
          const output = operationOptions('conform', options)
          let reporter: ReturnType<typeof renderConformFrameStart> | undefined
          await conformRepositories(
            operationContext(context, repositoryOperationProgress(context, output)),
            {
              ...selectedRepositories(),
              skill: options.skill,
              dryRun: Boolean(options.dryRun),
              allowCommands: Boolean(options.allowCommands)
            },
            {
              event: (event) => {
                if (!output.concise) context.stdout.write(renderConformEvent(event))
              },
              repositoryStarted: (repository, skills) => {
                reporter = output.concise
                  ? undefined
                  : renderConformFrameStart(
                      context,
                      repository,
                      skills,
                      context.stdout.isTTY === true && output.progress !== 'never'
                    )
              },
              reports: (repository, reports) => {
                if (output.concise) renderConciseConformSummary(context, repository, reports)
                else
                  renderConformReports(
                    reporter as NonNullable<typeof reporter>,
                    repository,
                    reports,
                    output.reporterLevels
                  )
              }
            }
          )
        })
    )

  ;(command.commands as Command[]).sort(
    (left, right) =>
      repoHelpCommandNames.indexOf(left.name() as (typeof repoHelpCommandNames)[number]) -
      repoHelpCommandNames.indexOf(right.name() as (typeof repoHelpCommandNames)[number])
  )
  return command
}
