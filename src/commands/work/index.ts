import { resolve } from 'node:path'
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
  type BaseInput,
  type BaseMovedFile,
  checkChangeDocumentInputs
} from '../../core/work/base.ts'
import {
  enclosingWorkPackage,
  locateWorkPackage,
  readSessionMeetings,
  readWorkPackageBanner
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
import { readCairnConfiguration, resolveCairnStore } from '../../core/work/store.ts'
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
  label: `${viewLabels[view].glyph} ${line.id} · ${line.holder ?? 'nobody'} · since ${line.since}${line.overdue ? ' · paused over 31 days' : ''}`
})

/** The text forms: the five views, the routing listing State of play reads, or the packages in their work tree. */
const textViews = ['views', 'routing', 'tree'] as const
type TextView = (typeof textViews)[number]

/** A routing description is cut to one line of this many characters, so each work stays on one row. */
const ROUTING_DESCRIPTION_WIDTH = 96

/** One routing row: the work's id, state and its description on one line, or `no description`. */
const routingLine = (entry: WorkStatusEntry): TreeEntry => {
  const description = entry.description?.replace(/\s+/g, ' ').trim() || 'no description'
  const cut =
    description.length > ROUTING_DESCRIPTION_WIDTH
      ? `${description.slice(0, ROUTING_DESCRIPTION_WIDTH - 3).trimEnd()}...`
      : description
  return { label: `${entry.id} · ${entry.state} · ${cut}` }
}

type TextForm = { readonly entries: TreeEntry[]; readonly counts: string }

/** The five views, one line per work, with their counts for the summary line. */
const viewEntries = (status: WorkStatus, now: Date): TextForm => {
  const views = deriveWorkViews(status.report.work, now)
  return {
    entries: workViews.map((view) => ({
      label: `${viewLabels[view].label} (${views[view].length})`,
      children: views[view].map((line) => viewLine(view, line))
    })),
    counts: workViews.map((view) => `${viewLabels[view].key}=${views[view].length}`).join(' ')
  }
}

/** The routing listing, one line per unfinished work in folder order, with the live total for the summary line. */
const routingEntries = (status: WorkStatus): TextForm => {
  const live = status.report.work.filter((entry) => entry.state !== 'finished')
  return { entries: live.map(routingLine), counts: `LIVE=${live.length}` }
}

/**
 * The listed packages in their work tree by `ki-parent`, each with its state, holder and since, beneath the packages
 * above it, which are named only, for context; a package whose parent is not shown is a root.
 */
const treeEntries = (status: WorkStatus): TextForm => {
  const byId = new Map(status.packages.map((entry) => [entry.id, entry]))
  const listed = new Set(status.report.work.map((entry) => entry.id))
  const shown = new Set<string>()
  for (const entry of status.report.work)
    for (let next: WorkStatusEntry | undefined = entry; next && !shown.has(next.id); ) {
      shown.add(next.id)
      next = next.parent === null ? undefined : byId.get(next.parent)
    }
  const label = (entry: WorkStatusEntry): string =>
    listed.has(entry.id)
      ? `${entry.id} · ${entry.state} · ${entry.holder ?? 'nobody'} · since ${entry.since}`
      : entry.id
  const branch = (entry: WorkStatusEntry): TreeEntry => ({
    label: label(entry),
    children: status.packages.filter((child) => child.parent === entry.id && shown.has(child.id)).map(branch)
  })
  const roots = status.packages.filter(
    (entry) => shown.has(entry.id) && (entry.parent === null || !shown.has(entry.parent))
  )
  return { entries: roots.map(branch), counts: `SHOWN=${shown.size}` }
}

/** The chosen text form, then any warnings and a summary line. */
const renderWorkStatus = (status: WorkStatus, now: Date, view: TextView): string => {
  const { entries, counts } =
    view === 'routing' ? routingEntries(status) : view === 'tree' ? treeEntries(status) : viewEntries(status, now)
  if (status.warnings.length)
    entries.push({
      label: `warnings (${status.warnings.length})`,
      children: status.warnings.map((warning) => ({ label: `${presentation('status.warn').terminal} ${warning}` }))
    })
  entries.push({ label: `summary: WORK=${status.report.work.length} ${counts}` })
  const title = { views: 'KI WORK STATUS', routing: 'KI WORK ROUTING', tree: 'KI WORK TREE' }[view]
  return renderTree({ title: `${title} ${status.report.repository ?? 'all packages'}`, entries }).join('\n')
}

const baseVerdicts: readonly BaseCheckDocument['verdict'][] = ['moved', 'unknown', 'current']

const movedFile = (file: BaseMovedFile): TreeEntry => ({
  label: `${file.path} ${file.change}${file.to === undefined ? '' : ` to ${file.to}`}`
})

/** An input that is not current: moved with its files counted, or unknown or unchecked with the reason. */
const baseInput = (input: BaseInput): TreeEntry => ({
  label: `${input.input} · ${input.verdict}${input.verdict === 'moved' && input.files.length ? ` · ${input.files.length} file${input.files.length === 1 ? '' : 's'}` : ''}`,
  ...(input.reason === null ? {} : { continuation: [input.reason] }),
  children: input.files.map(movedFile)
})

const baseDocument = (document: BaseCheckDocument): TreeEntry => ({
  label: `${document.package} · ${document.path}${document.status === null ? '' : ` · ${document.status}`}`,
  ...(document.reason === null ? {} : { continuation: [document.reason] }),
  children: document.inputs.filter((input) => input.verdict !== 'current').map(baseInput)
})

/** Moved, unknown and current documents, the closed count and a summary line. */
const renderBaseCheck = (report: BaseCheckReport): string => {
  const counts = baseVerdicts.map(
    (verdict) => [verdict, report.documents.filter((document) => document.verdict === verdict)] as const
  )
  const entries: TreeEntry[] = counts.map(([verdict, documents]) => ({
    label: `${verdict} (${documents.length})`,
    children:
      verdict === 'current'
        ? documents.map((document) => ({ label: `${document.package} · ${document.path}` }))
        : documents.map(baseDocument)
  }))
  entries.push({ label: `closed, not checked (${report.closed.length})` })
  entries.push({
    label: `summary: DOCUMENTS=${report.documents.length} ${counts.map(([verdict, documents]) => `${verdict.toUpperCase()}=${documents.length}`).join(' ')} CLOSED=${report.closed.length}`
  })
  return renderTree({ title: 'KI WORK BASE', entries }).join('\n')
}

/** The Cairn store: `--store`, then `MCP_CAIRN_STORE`, then `[store] path` in the rig's Cairn configuration. */
const cairnStore = async (context: KiContext, given: string | undefined): Promise<string> =>
  resolveCairnStore(
    given,
    context.environment,
    await readCairnConfiguration(xdgConfigHome(context.environment), context.homeDirectory),
    context.workingDirectory
  )

/** The `<owner>/<name>` identity of the repository `--repo` names, or else the working directory's. */
const repositoryIdentity = async (context: KiContext, repo: string | undefined): Promise<string> => {
  const location = await resolveRepository({
    ...(repo === undefined ? {} : { repository: resolve(context.workingDirectory, repo) }),
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })
  return declaredRepositoryIdentity(await readRepositoryDeclaration(location.declaration)).slice(
    'https://github.com/'.length
  )
}

const STORE_OPTION_HELP =
  "the Cairn store clone; default, MCP_CAIRN_STORE, then [store] path in the rig's cairn/config.toml"

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
        'show the work packages in the Cairn store that name a repository, by view, read-only, from each _index.md'
      )
      .option(
        '--repo <dir>',
        "list the packages naming this repository; default, the working directory's KI repository"
      )
      .addOption(new Option('--all', 'list every package in the store').conflicts('repo'))
      .option('--store <dir>', STORE_OPTION_HELP)
      .addOption(
        new Option('--format <format>', 'text views or the versioned ki/work-status/v2 JSON')
          .choices(['text', 'json'])
          .default('text')
      )
      .addOption(
        new Option(
          '--view <view>',
          'the text form: the five views; routing, one line per unfinished work with its id, state and description; or tree, the packages beneath their parents'
        )
          .choices(textViews)
          .default('views')
      )
      .action(
        async (options: {
          readonly repo?: string
          readonly all?: boolean
          readonly store?: string
          readonly format: 'text' | 'json'
          readonly view: TextView
        }) => {
          const repository = options.all ? undefined : await repositoryIdentity(context, options.repo)
          const store = await cairnStore(context, options.store)
          const now = new Date(context.now())
          const status = await readWorkStatus({ store, ...(repository === undefined ? {} : { repository }), now })
          if (options.format === 'json') {
            context.stdout.write(`${JSON.stringify(status.report, null, 2)}\n`)
            for (const warning of status.warnings) context.stderr.write(`ki: warning: ${warning}\n`)
          } else context.stdout.write(`${renderWorkStatus(status, now, options.view)}\n`)
        }
      )
  )
  command.addCommand(
    new Command('base')
      .description(
        'flag change documents in the Cairn store whose ki-inputs have moved on past their version refs, read-only'
      )
      .option(
        '--repo <dir>',
        'read only the change documents of the packages naming this repository; default, every one'
      )
      .option('--store <dir>', STORE_OPTION_HELP)
      .addOption(
        new Option('--format <format>', 'text report or the versioned ki/work-base/v2 JSON')
          .choices(['text', 'json'])
          .default('text')
      )
      .action(
        async (options: { readonly repo?: string; readonly store?: string; readonly format: 'text' | 'json' }) => {
          const repository = options.repo === undefined ? undefined : await repositoryIdentity(context, options.repo)
          const store = await cairnStore(context, options.store)
          const registry = await requiredLocalRegistry(context.paths.state)
          const status = await readWorkStatus({
            store,
            ...(repository === undefined ? {} : { repository }),
            now: new Date(context.now())
          })
          const report = await checkChangeDocumentInputs({
            store,
            // An unreadable package's change documents are still checked: its warning is not theirs.
            documents: [...status.report.work, ...status.unreadable]
              .flatMap((entry) => entry.changes.map((path) => ({ package: entry.id, path })))
              .sort((left, right) => (left.path < right.path ? -1 : 1)),
            checkouts: registry,
            runner: context.runner,
            environment: context.environment
          })
          if (options.format === 'json') context.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
          else context.stdout.write(`${renderBaseCheck(report)}\n`)
          for (const warning of status.warnings) context.stderr.write(`ki: warning: ${warning}\n`)
          if (report.documents.some((document) => document.verdict !== 'current')) throw new KiExit(1)
        }
      )
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
      .option('--store <dir>', STORE_OPTION_HELP)
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
