import { resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { applyGfm, type FilePlan, type GfmPlan, planGfm, undecided, writePreview } from '../../core/markdown/index.ts'

interface GfmOptions {
  readonly root?: string
  readonly decisions?: string
  readonly dryRun?: boolean
  readonly preview?: string
  readonly manifest?: string
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

/** A zero-context unified diff; a conversion never adds or removes a line, so lines pair one to one. */
const renderDiff = (file: FilePlan): string => {
  const before = file.input.split('\n')
  const after = file.output.split('\n')
  const hunks: string[] = []
  for (let line = 0; line < before.length; line++) {
    if (before[line] === after[line]) continue
    let end = line
    while (end + 1 < before.length && before[end + 1] !== after[end + 1]) end++
    const range = end === line ? `${line + 1}` : `${line + 1},${end - line + 1}`
    hunks.push(
      `@@ -${range} +${range} @@\n`,
      ...before.slice(line, end + 1).map((text) => `-${text}\n`),
      ...after.slice(line, end + 1).map((text) => `+${text}\n`)
    )
    line = end
  }
  return `--- a/${file.path}\n+++ b/${file.path}\n${hunks.join('')}`
}

const renderItems = (plan: GfmPlan): string => {
  const lines = plan.files.flatMap((file) =>
    file.items.map(
      (item) =>
        `${file.path}:${item.line}: ${item.kind} ${item.text}${item.candidates ? ` (${item.candidates.join(', ')})` : ''}${item.decision ? ` (${item.decision})` : ''}\n`
    )
  )
  return lines.length ? `items:\n${lines.join('')}` : ''
}

const renderSummary = (plan: GfmPlan, verb: string): string => {
  const changed = plan.files.filter((file) => file.output !== file.input)
  const links = changed.reduce((total, file) => total + file.conversions.length, 0)
  const counts = new Map<string, number>()
  for (const file of plan.files) for (const item of file.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  const kinds = [...counts].map(([kind, count]) => `${kind} ${count}`).join(', ')
  const items = plural(
    [...counts.values()].reduce((total, count) => total + count, 0),
    'item'
  )
  return `${verb}: ${plural(plan.files.length, 'file')}, ${changed.length} changed, ${plural(links, 'link')} converted, ${items}${kinds ? ` (${kinds})` : ''}, ${undecided(plan).length} undecided\n`
}

const createGfmCommand = (context: KiContext): Command =>
  new Command('gfm')
    .description('convert wikilinks and unsized image embeds in explicit paths to GitHub-flavoured Markdown links')
    .argument('<path...>', 'Markdown file, or directory of Markdown files, inside the vault root')
    .option('--root <dir>', 'vault root links resolve against (default: nearest holding .obsidian or .git)')
    .option('--decisions <file>', 'TOML decisions for this batch: heading fragments, protected paths and items')
    .option('--dry-run', 'print each file diff and the item report without writing')
    .option('--preview <file>', 'preview a dry run writes and an apply must match')
    .option('--manifest <file>', 'new rollback manifest an apply writes before changing any file')
    .action(async (paths: string[], options: GfmOptions) => {
      if (options.dryRun && options.manifest) throw grammarError('--manifest applies only without --dry-run')
      if (!options.dryRun && (!options.preview || !options.manifest))
        throw grammarError('an apply needs --preview <file> from a dry run and --manifest <file>; or pass --dry-run')
      const plan = await planGfm({
        workingDirectory: context.workingDirectory,
        paths,
        ...(options.root === undefined ? {} : { root: options.root }),
        ...(options.decisions === undefined ? {} : { decisions: options.decisions })
      })
      if (options.dryRun) {
        for (const file of plan.files) if (file.output !== file.input) context.stdout.write(renderDiff(file))
        context.stdout.write(renderItems(plan))
        context.stdout.write(renderSummary(plan, 'dry run'))
        if (options.preview) {
          await writePreview(plan, resolve(context.workingDirectory, options.preview))
          context.stdout.write(`preview: ${options.preview}\n`)
        }
        return
      }
      context.stdout.write(renderItems(plan))
      await applyGfm(
        plan,
        resolve(context.workingDirectory, options.preview as string),
        resolve(context.workingDirectory, options.manifest as string)
      )
      context.stdout.write(renderSummary(plan, 'applied'))
      context.stdout.write(`manifest: ${options.manifest}\n`)
    })

export const createMarkdownCommand = (context: KiContext): Command =>
  new Command('markdown')
    .description('convert Markdown between flavours in explicit paths')
    .addCommand(createGfmCommand(context))
