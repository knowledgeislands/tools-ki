import { resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import {
  type ConvergeAction,
  type ConvergeItem,
  type ConvergePlan,
  type EstatePorts,
  executeConvergence,
  type HookSweepItem,
  type HookSweepPlan,
  planConvergence,
  planHookSweep,
  planRollback,
  type SweepHit,
  sweepOccurrences
} from '../../core/estate/index.ts'

interface ConvergeCommandOptions {
  readonly apply?: boolean
  readonly clone?: boolean
  readonly hooks?: boolean
  readonly allowBusy: readonly string[]
  readonly rollback?: string
}

const describe = (action: ConvergeAction): readonly string[] => {
  switch (action.kind) {
    case 'move':
      return [
        `move ${action.from} -> ${action.to}`,
        `worktree repair ${action.to}${action.worktrees.map((worktree) => `\n    linked ${worktree.before} -> ${worktree.after}`).join('')}`
      ]
    case 'remote':
      return [`remote origin ${action.from} -> ${action.to}`]
    case 'registry':
      return [
        `registry ${action.before.key} -> ${action.after.key}: ${action.after.repository} at ${action.after.path}`
      ]
    case 'claude-folder':
      return [`claude folder ${action.from} -> ${action.to}`]
    case 'claude-key':
      return [`claude project ${action.from} -> ${action.to}`]
    case 'clone':
      return [`clone ${action.url} -> ${action.path}`]
    case 'symlink':
      return [`rewrite symlink ${action.path}: ${action.from} -> ${action.to}`]
    case 'rmdir':
      return [`remove empty ${action.path}`]
    case 'mkdir':
      return [`recreate ${action.path}`]
    case 'hooks-path':
      return [`core.hooksPath ${action.path}: ${action.from ?? 'unset'} -> ${action.to ?? 'unset'}`]
    case 'set-aside':
      return [`set aside ${action.from} -> ${action.to}`]
  }
}

const renderItem = (item: ConvergeItem): string => {
  const subject = `${item.target.to} (${item.target.title})`
  const head =
    item.state === 'skip'
      ? `skip ${subject}: ${item.reasons.join('; ')}`
      : item.state === 'absent'
        ? `absent ${subject}: no local checkout`
        : item.state === 'to clone'
          ? `to clone ${subject} -> ${item.target.pathTo} (use --clone)`
          : `${item.state} ${subject}`
  return [
    head,
    ...item.actions.flatMap(describe).map((line) => `  ${line}`),
    ...item.notes.map((note) => `  note: ${note}`)
  ].join('\n')
}

const renderPlan = (plan: ConvergePlan, heading: string): string => {
  const count = (state: ConvergeItem['state']): number => plan.items.filter((item) => item.state === state).length
  return [
    heading,
    ...plan.items.map(renderItem),
    'symlinks and former parents',
    ...plan.finalActions.flatMap(describe).map((line) => `  ${line}`),
    ...plan.trackedSymlinks.map((link) => `  tracked symlink, report only ${link.path}: ${link.from} -> ${link.to}`),
    ...plan.leftovers.map((leftover) => `  leftover ${leftover.path}: ${leftover.entries.join(', ')}`),
    `summary: ${count('converge')} converge, ${count('no-op')} no-op, ${count('skip')} skip, ${count('to clone')} to clone, ${count('absent')} absent; ${plan.finalActions.filter((action) => action.kind === 'symlink').length} symlink rewrite(s), ${plan.trackedSymlinks.length} tracked symlink(s), ${plan.leftovers.length} leftover parent(s)`
  ].join('\n')
}

const renderHookItem = (item: HookSweepItem): string =>
  [
    `${item.state} ${item.path}`,
    ...item.actions.flatMap(describe).map((line) => `  ${line}`),
    ...item.notes.map((note) => `  note: ${note}`)
  ].join('\n')

const renderHookSweep = (plan: HookSweepPlan, heading: string): string => {
  const count = (state: HookSweepItem['state']): number => plan.items.filter((item) => item.state === state).length
  return [
    heading,
    ...plan.items.map(renderHookItem),
    `summary: ${count('bind')} bind, ${count('bound')} bound, ${count('keep')} keep, ${count('skip')} skip`
  ].join('\n')
}

const renderSweep = (hits: readonly SweepHit[]): string =>
  [
    `sweep: ${hits.length} remaining occurrence(s), report only`,
    ...hits.map((hit) => `  ${hit.file}:${hit.line}: ${hit.match}`)
  ].join('\n')

export const createEstateConvergeCommand = (context: KiContext): Command =>
  new Command('converge')
    .description('preview, apply or roll back moving local checkouts to an estate targets manifest')
    .argument('[manifest]', 'estate targets JSON manifest')
    .option('--apply', 'execute the previewed actions and write a converge log')
    .option('--clone', 'clone registered targets that have no local checkout')
    .option(
      '--allow-busy <path>',
      'move this checkout although a process works inside it (repeatable)',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('--rollback <log>', 'reverse the actions recorded in a converge log')
    .option('--hooks', 'bind registered KI checkouts to their tracked .githooks instead of moving checkouts')
    .action(async (manifest: string | undefined, options: ConvergeCommandOptions) => {
      if (options.hooks && (manifest !== undefined || options.rollback !== undefined))
        throw grammarError('ki estate converge --hooks does not accept a manifest or --rollback')
      if (options.hooks && (options.clone || options.allowBusy.length))
        throw grammarError('ki estate converge --hooks does not accept --clone or --allow-busy')
      if (!options.hooks && (manifest === undefined) === (options.rollback === undefined))
        throw grammarError('ki estate converge requires exactly one manifest, --rollback <log> or --hooks')
      if (options.rollback !== undefined && (options.clone || options.allowBusy.length))
        throw grammarError('ki estate converge --rollback does not accept --clone or --allow-busy')
      const ports: EstatePorts = {
        homeDirectory: context.homeDirectory,
        stateDirectory: context.paths.state,
        platform: context.platform,
        environment: context.environment,
        runner: context.runner,
        now: context.now
      }
      const local = (path: string): string =>
        resolve(context.workingDirectory, path.replace(/^~(?=\/)/, context.homeDirectory))
      const mode = options.apply ? 'apply' : 'preview'
      if (options.hooks) {
        const plan = await planHookSweep(ports)
        context.stdout.write(`${renderHookSweep(plan, `ki estate converge: hooks ${mode} from ${plan.registry}`)}\n`)
        const actions = plan.items.flatMap((item) => item.actions)
        if (!options.apply) context.stdout.write('preview only; rerun with --apply to execute\n')
        else if (!actions.length) context.stdout.write('nothing to apply\n')
        else context.stdout.write(`log ${await executeConvergence(ports, plan.registry, actions)}\n`)
        return
      }
      if (options.rollback !== undefined) {
        const plan = await planRollback(local(options.rollback))
        context.stdout.write(
          [
            `ki estate converge: rollback ${mode} of ${local(options.rollback)}`,
            ...plan.actions.flatMap(describe).map((line) => `  ${line}`),
            ...plan.retained.map((path) => `  retain cloned checkout ${path}; converge never deletes a repository`),
            ''
          ].join('\n')
        )
        if (options.apply)
          context.stdout.write(`log ${await executeConvergence(ports, plan.manifest, plan.actions, '.rollback')}\n`)
        else context.stdout.write('preview only; rerun with --apply to execute\n')
        return
      }
      const plan = await planConvergence(ports, {
        manifest: local(manifest as string),
        allowBusy: options.allowBusy.map(local),
        clone: Boolean(options.clone)
      })
      context.stdout.write(`${renderPlan(plan, `ki estate converge: ${mode} of ${plan.manifest}`)}\n`)
      const actions = [...plan.items.flatMap((item) => item.actions), ...plan.finalActions]
      if (!options.apply) context.stdout.write('preview only; rerun with --apply to execute\n')
      else if (!actions.length) context.stdout.write('nothing to apply\n')
      else context.stdout.write(`log ${await executeConvergence(ports, plan.manifest, actions)}\n`)
      context.stdout.write(`${renderSweep(await sweepOccurrences(ports, plan.sweepPatterns))}\n`)
    })
