import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  conformRepositories,
  type RepositoryConformEvent,
  renderRepositoryConformCommand
} from '../../core/repository/index.ts'
import { presentationText, treeProgressPrefix } from '../presentation/index.ts'
import { repositoryOperationContext } from './operation-context.ts'
import type { SelectRepositories } from './selection.ts'
import {
  conformFails,
  operationOptions,
  renderConciseConformSummary,
  renderConformFrameStart,
  renderConformReports,
  repositoryOperationProgress
} from './shared/index.ts'

interface RepositoryConformOptions {
  readonly skill?: string
  readonly dryRun?: boolean
  readonly allowCommands?: boolean
  readonly progress?: string
  readonly progressStyle?: string
  readonly reporterLevels?: string
  readonly concise?: boolean
}

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
    case 'hook-write':
      return `${event.dryRun ? 'would write' : 'write'} ${event.path}\n`
    case 'hook-remove':
      return `${event.dryRun ? 'would remove' : 'remove'} ${event.path}/\n`
    case 'hook-bind':
      return `${event.dryRun ? 'would bind' : 'bind'} core.hooksPath .githooks${event.from ? ` (was ${event.from})` : ''}\n`
    case 'hook-binding-kept':
      return `keep core.hooksPath ${JSON.stringify(event.value)}\n`
  }
}

export const createRepoConformCommand = (context: KiContext, selectedRepositories: SelectRepositories): Command =>
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
      const output = operationOptions('conform', options, context.environment)
      let reporter: ReturnType<typeof renderConformFrameStart> | undefined
      let selected: Parameters<typeof renderConformFrameStart>[2] = []
      await conformRepositories(
        repositoryOperationContext(context, repositoryOperationProgress(context, output)),
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
            selected = skills
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
            // Under KI_QUIET a failing repository keeps its frame, so the failure names its findings.
            if (output.concise && !(output.quiet && conformFails(reports)))
              renderConciseConformSummary(context, repository, reports)
            else
              renderConformReports(
                reporter ?? renderConformFrameStart(context, repository, selected),
                repository,
                reports,
                output.reporterLevels
              )
          }
        }
      )
    })
