import { basename, resolve } from 'node:path'
import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../../core/configuration/index.ts'
import { grammarError, KiExit } from '../../core/errors.ts'
import { xdgConfigHome } from '../../core/paths.ts'
import { resolveRepository } from '../../core/repository/index.ts'
import { requiredLocalRegistry } from '../../core/storage/index.ts'
import {
  type BaseCheckDocument,
  type BaseCheckReport,
  type BaseMovedFile,
  type BaseVerdict,
  checkChangeDocumentBases
} from '../../core/work/base.ts'
import {
  enclosingWorkPackage,
  locateWorkPackage,
  readCairnConfiguration,
  readSessionMeetings,
  readWorkPackageBanner,
  resolveCairnStore
} from '../../core/work/package.ts'
import {
  deriveWorkViews,
  readWorkStatus,
  type WorkStatus,
  type WorkStatusEntry,
  type WorkView,
  type WorkViewLine,
  workViews
} from '../../core/work/status.ts'
import { presentation, renderTree, type TreeEntry } from '../presentation/index.ts'
import { renderBanner } from './banner.ts'

const viewLabels: Readonly<Record<WorkView, { readonly glyph: string; readonly label: string; readonly key: string }>> =
  {
    'with-you': { glyph: '👤', label: 'with you', key: 'WITH_YOU' },
    stuck: { glyph: '⏳', label: 'stuck', key: 'STUCK' },
    blocked: { glyph: '⛔', label: 'blocked', key: 'BLOCKED' },
    moving: { glyph: '🤖', label: 'moving', key: 'MOVING' },
    'on-hold': { glyph: '⏸️', label: 'on hold', key: 'ON_HOLD' }
  }

const viewLine = (view: WorkView, line: WorkViewLine): TreeEntry => ({
  label: `${viewLabels[view].glyph} ${line.id} · ${line.holder ?? 'nobody'} · since ${line.since}${line.overdue ? ' · paused over 31 days' : ''}${line.pending ? ` · ${line.pending} pending` : ''}`
})

/** The text forms: the five views, or the routing listing State of play reads to choose which work takes a unit. */
const textViews = ['views', 'routing'] as const
type TextView = (typeof textViews)[number]

/** A routing description is cut to one line of this many characters, so each work stays on one row. */
const ROUTING_DESCRIPTION_WIDTH = 96

/** One routing row: the work's id, state, pending count and its description on one line, or `no description`. */
const routingLine = (entry: WorkStatusEntry): TreeEntry => {
  const description = entry.description?.replace(/\s+/g, ' ').trim() || 'no description'
  const cut =
    description.length > ROUTING_DESCRIPTION_WIDTH
      ? `${description.slice(0, ROUTING_DESCRIPTION_WIDTH - 3).trimEnd()}...`
      : description
  return { label: `${entry.id} · ${entry.state} · ${entry.messages} pending · ${cut}` }
}

/** The five views, one line per work or item, with their counts for the summary line. */
const viewEntries = (status: WorkStatus, now: Date): { entries: TreeEntry[]; counts: string } => {
  const views = deriveWorkViews(status.report.work, now)
  return {
    entries: workViews.map((view) => ({
      label: `${viewLabels[view].label} (${views[view].length})`,
      children: views[view].map((line) => viewLine(view, line))
    })),
    counts: workViews.map((view) => `${viewLabels[view].key}=${views[view].length}`).join(' ')
  }
}

/** The routing listing, one line per unfinished work in folder order, with the pending total for the summary line. */
const routingEntries = (status: WorkStatus): { entries: TreeEntry[]; counts: string } => {
  const live = status.report.work.filter((entry) => entry.state !== 'finished')
  return {
    entries: live.map(routingLine),
    counts: `PENDING=${live.reduce((total, entry) => total + entry.messages, 0)}`
  }
}

/** The chosen text form, then the review count, any warnings and a summary line. */
const renderWorkStatus = (status: WorkStatus, now: Date, view: TextView): string => {
  const { entries, counts } = view === 'routing' ? routingEntries(status) : viewEntries(status, now)
  entries.push({ label: `awaiting review (${status.review})` })
  if (status.warnings.length)
    entries.push({
      label: `warnings (${status.warnings.length})`,
      children: status.warnings.map((warning) => ({ label: `${presentation('status.warn').terminal} ${warning}` }))
    })
  entries.push({ label: `summary: WORK=${status.report.work.length} ${counts} REVIEW=${status.review}` })
  const title = view === 'routing' ? 'KI WORK ROUTING' : 'KI WORK STATUS'
  return renderTree({ title: `${title} ${status.report.repository}`, entries }).join('\n')
}

const baseVerdicts: readonly BaseVerdict[] = ['moved', 'unknown', 'current']

const movedFile = (file: BaseMovedFile): TreeEntry => ({
  label: `${file.path} ${file.change}${file.to === undefined ? '' : ` to ${file.to}`}`
})

const baseDocument = (document: BaseCheckDocument): TreeEntry => ({
  label: `${document.repository} · ${document.path}${document.base ? ` · ${document.base.repository}@${document.base.commit}` : ''}`,
  ...(document.reason === null ? {} : { continuation: [document.reason] }),
  children: document.files.map(movedFile)
})

/** Moved, unknown and current documents, the graduated count and a summary line. */
const renderBaseCheck = (report: BaseCheckReport): string => {
  const counts = baseVerdicts.map(
    (verdict) => [verdict, report.documents.filter((document) => document.verdict === verdict)] as const
  )
  const entries: TreeEntry[] = counts.map(([verdict, documents]) => ({
    label: `${verdict} (${documents.length})`,
    children: documents.map(baseDocument)
  }))
  entries.push({ label: `graduated, not checked (${report.graduated.length})` })
  entries.push({
    label: `summary: DOCUMENTS=${report.documents.length} ${counts.map(([verdict, documents]) => `${verdict.toUpperCase()}=${documents.length}`).join(' ')} GRADUATED=${report.graduated.length}`
  })
  return renderTree({ title: 'KI WORK BASE', entries }).join('\n')
}

/** A live count from the session: a whole number, zero or more. */
const liveCount = (value: string): number => {
  if (!/^\d+$/.test(value)) throw grammarError(`a live count must be a whole number, zero or more, not ${value}`)
  return Number(value)
}

const collect = (value: string, previous: readonly string[] = []): readonly string[] => [...previous, value]

interface BannerCommandOptions {
  readonly store?: string
  readonly full?: boolean
  readonly short?: boolean
  readonly art: boolean
  readonly running: number
  readonly queued: number
  readonly blocked: number
  readonly item: readonly string[]
  readonly headingFor?: string
  readonly meeting: readonly string[]
  readonly host?: string
}

export const createWorkCommand = (context: KiContext): Command => {
  const command = new Command('work').description(
    'read the work model: work packages, their state and views, and change-document bases'
  )
  command.addCommand(
    new Command('status')
      .description(
        "show a repository's work by view, read-only, from each +/_WORK/<id>/ state.md, _index.md or work.md"
      )
      .option('--repo <dir>', "repository holding the work folders; default, the working directory's KI repository")
      .addOption(
        new Option('--format <format>', 'text views or the versioned ki/work-status/v1 JSON')
          .choices(['text', 'json'])
          .default('text')
      )
      .addOption(
        new Option(
          '--view <view>',
          'the text form: the five views, or routing, one line per unfinished work with its id, state, pending count and description'
        )
          .choices(textViews)
          .default('views')
      )
      .action(
        async (options: { readonly repo?: string; readonly format: 'text' | 'json'; readonly view: TextView }) => {
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
            now
          })
          if (options.format === 'json') context.stdout.write(`${JSON.stringify(status.report, null, 2)}\n`)
          else context.stdout.write(`${renderWorkStatus(status, now, options.view)}\n`)
          if (options.format === 'json')
            for (const warning of status.warnings) context.stderr.write(`ki: warning: ${warning}\n`)
        }
      )
  )
  command.addCommand(
    new Command('base')
      .description(
        "flag change documents whose touched files have moved on their base repository's origin/main, read-only"
      )
      .option('--repo <dir>', "read only this repository's change documents; default, every registered repository")
      .addOption(
        new Option('--format <format>', 'text report or the versioned ki/work-base/v1 JSON')
          .choices(['text', 'json'])
          .default('text')
      )
      .action(async (options: { readonly repo?: string; readonly format: 'text' | 'json' }) => {
        const registry = await requiredLocalRegistry(context.paths.state)
        const repositories =
          options.repo === undefined
            ? registry
            : await resolveRepository({
                repository: resolve(context.workingDirectory, options.repo),
                workingDirectory: context.workingDirectory,
                homeDirectory: context.homeDirectory
              }).then(({ root }) => [
                { key: registry.find((entry) => entry.path === root)?.key ?? basename(root), path: root }
              ])
        const report = await checkChangeDocumentBases({
          repositories,
          checkouts: registry,
          runner: context.runner,
          environment: context.environment
        })
        if (options.format === 'json') context.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
        else context.stdout.write(`${renderBaseCheck(report)}\n`)
        if (report.documents.some((document) => document.verdict !== 'current')) throw new KiExit(1)
      })
  )
  command.addCommand(
    new Command('banner')
      .description(
        "print a work package's closing banner from the Cairn store, art included, exactly as ki-coordination lays it out"
      )
      .argument(
        '[package]',
        "the package's work id, as ki.summit; default, the package whose folder holds the working directory"
      )
      .option(
        '--store <dir>',
        "the Cairn store clone; default, MCP_CAIRN_STORE, then [store] path in the rig's cairn/config.toml"
      )
      .addOption(
        new Option('--full', 'the Full banner: the art, roadmap and package lines (default)').conflicts('short')
      )
      .addOption(
        new Option('--short', 'the Medium and Short banner: no art, roadmap or package lines').conflicts('full')
      )
      .option('--no-art', 'leave the art out of a Full banner')
      .option('--running <n>', 'runs the session has running', liveCount, 0)
      .option('--queued <n>', 'runs the session has queued', liveCount, 0)
      .option('--blocked <n>', 'items the session has stuck or blocked', liveCount, 0)
      .option(
        '--item <line>',
        'a live item from the session, <glyph> <what> · <holder> · at <time> (repeatable)',
        collect,
        []
      )
      .option(
        '--heading-for <line>',
        'the line after ↪️ while the work heads for a hold or a handoff, as "draining → ⏸️ On hold"'
      )
      .option(
        '--meeting <id>',
        'a meeting the session sits in, by its id, for the meeting line with the others there (repeatable)',
        collect,
        []
      )
      .option('--host <name>', "the art scroll's host; default, [rig] name in the rig's cairn/config.toml")
      .action(async (id: string | undefined, options: BannerCommandOptions) => {
        const configuration = await readCairnConfiguration(xdgConfigHome(context.environment), context.homeDirectory)
        const { store, folder } =
          id === undefined
            ? await enclosingWorkPackage(context.workingDirectory)
            : await (async () => {
                const root = resolveCairnStore(
                  options.store,
                  context.environment,
                  configuration,
                  context.workingDirectory
                )
                return { store: root, folder: await locateWorkPackage(root, id) }
              })()
        const banner = await readWorkPackageBanner(store, folder, await requiredLocalRegistry(context.paths.state))
        const host = options.host ?? configuration.rig
        const timeZone = context.environment['TZ'] || undefined
        context.stdout.write(
          `${renderBanner(banner, {
            layout: options.short ? 'short' : 'full',
            art: options.art,
            running: options.running,
            queued: options.queued,
            blocked: options.blocked,
            items: options.item,
            meetings: await readSessionMeetings(store, options.meeting, banner.actor),
            now: new Date(context.now()),
            ...(options.headingFor === undefined ? {} : { headingFor: options.headingFor }),
            ...(host === undefined ? {} : { host }),
            ...(timeZone === undefined ? {} : { timeZone })
          })}\n`
        )
      })
  )
  return command
}
