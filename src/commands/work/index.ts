import { resolve } from 'node:path'
import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { workRuns } from '../../core/agent/runs.ts'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../core/configuration/index.ts'
import { resolveRepository } from '../../core/repository/index.ts'
import {
  deriveWorkViews,
  readWorkStatus,
  type WorkStatus,
  type WorkView,
  type WorkViewLine,
  workViews
} from '../../core/work/status.ts'
import { agentContext } from '../agent/index.ts'
import { presentation, renderTree, type TreeEntry } from '../presentation/index.ts'

const viewLabels: Readonly<Record<WorkView, { readonly glyph: string; readonly label: string; readonly key: string }>> =
  {
    'with-you': { glyph: '👤', label: 'with you', key: 'WITH_YOU' },
    stuck: { glyph: '⏳', label: 'stuck', key: 'STUCK' },
    blocked: { glyph: '⛔', label: 'blocked', key: 'BLOCKED' },
    moving: { glyph: '🤖', label: 'moving', key: 'MOVING' },
    'on-hold': { glyph: '⏸️', label: 'on hold', key: 'ON_HOLD' }
  }

const viewLine = (view: WorkView, line: WorkViewLine): TreeEntry => ({
  label: `${viewLabels[view].glyph} ${line.id} · ${line.holder ?? 'nobody'} · since ${line.since}${line.overdue ? ' · paused over 31 days' : ''}`
})

/** The five views, one line per work or item, then the review count, any warnings and a summary line. */
const renderWorkStatus = (status: WorkStatus, now: Date): string => {
  const views = deriveWorkViews(status.report.work, now)
  const entries: TreeEntry[] = workViews.map((view) => ({
    label: `${viewLabels[view].label} (${views[view].length})`,
    children: views[view].map((line) => viewLine(view, line))
  }))
  entries.push({ label: `awaiting review (${status.review})` })
  if (status.warnings.length)
    entries.push({
      label: `warnings (${status.warnings.length})`,
      children: status.warnings.map((warning) => ({ label: `${presentation('status.warn').terminal} ${warning}` }))
    })
  const counts = workViews.map((view) => `${viewLabels[view].key}=${views[view].length}`).join(' ')
  entries.push({ label: `summary: WORK=${status.report.work.length} ${counts} REVIEW=${status.review}` })
  return renderTree({ title: `KI WORK STATUS ${status.report.repository}`, entries }).join('\n')
}

export const createWorkCommand = (context: KiContext): Command => {
  const command = new Command('work').description('read the work model: work files, their state and views')
  command.addCommand(
    new Command('status')
      .description("show a repository's work by view, read-only, from +/_WORK/<id>/work.md")
      .option('--repo <dir>', "repository holding the work files; default, the working directory's KI repository")
      .addOption(
        new Option('--format <format>', 'text views or the versioned ki/work-status/v1 JSON')
          .choices(['text', 'json'])
          .default('text')
      )
      .action(async (options: { readonly repo?: string; readonly format: 'text' | 'json' }) => {
        const location = await resolveRepository({
          ...(options.repo === undefined ? {} : { repository: resolve(context.workingDirectory, options.repo) }),
          workingDirectory: context.workingDirectory,
          homeDirectory: context.homeDirectory
        })
        const repository = declaredRepositoryIdentity(await readRepositoryDeclaration(location.declaration))
        const now = new Date(context.now())
        const status = await readWorkStatus({
          root: location.root,
          identity: repository.slice('https://github.com/'.length),
          now,
          runs: await workRuns(agentContext(context), location.root)
        })
        if (options.format === 'json') context.stdout.write(`${JSON.stringify(status.report, null, 2)}\n`)
        else context.stdout.write(`${renderWorkStatus(status, now)}\n`)
        if (options.format === 'json')
          for (const warning of status.warnings) context.stderr.write(`ki: warning: ${warning}\n`)
      })
  )
  return command
}
