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
      const output = operationOptions('conform', options)
      let reporter: ReturnType<typeof renderConformFrameStart> | undefined
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
              renderConformReports(reporter as NonNullable<typeof reporter>, repository, reports, output.reporterLevels)
          }
        }
      )
    })
