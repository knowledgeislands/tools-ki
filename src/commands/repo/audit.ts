import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { auditRepositories } from '../../core/repository/index.ts'
import { repositoryOperationContext } from './operation-context.ts'
import type { SelectRepositories } from './selection.ts'
import {
  type AuditRepositorySummary,
  operationOptions,
  renderAuditFrameStart,
  renderAuditResults,
  renderConciseAuditSummary,
  renderConciseMultiRepositoryAuditSummary,
  renderMultiRepositoryAuditSummary,
  repositoryOperationProgress
} from './shared/index.ts'

interface RepositoryAuditOptions {
  readonly skill?: string
  readonly progress?: string
  readonly progressStyle?: string
  readonly reporterLevels?: string
  readonly concise?: boolean
}

export const createRepoAuditCommand = (context: KiContext, selectedRepositories: SelectRepositories): Command =>
  new Command('audit')
    .description('run registered audit operations for declared skills')
    .option('--skill <capability>', 'one declared resolved skill to audit')
    .option('--progress <mode>', 'progress: auto, always, or never (default: auto)')
    .option('--progress-style <style>', 'progress layout: single or multi (default: multi on a TTY)')
    .option('--reporter-levels <levels>', 'findings to render: levels or all (default: FAIL,WARN)')
    .option('--concise', 'render only one final summary per repository')
    .action(async (options: RepositoryAuditOptions) => {
      const output = operationOptions('audit', options)
      const summaries: AuditRepositorySummary[] = []
      let reporter: ReturnType<typeof renderAuditFrameStart> | undefined
      const result = await auditRepositories(
        repositoryOperationContext(context, repositoryOperationProgress(context, output)),
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
      if (summaries.length > 1) {
        if (output.concise) renderConciseMultiRepositoryAuditSummary(context, summaries)
        else renderMultiRepositoryAuditSummary(context, summaries)
      }
      if (result.failed) throw new KiError('repository audit found failures', 1)
    })
