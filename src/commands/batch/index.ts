import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  type BatchOperationContext,
  type BatchOperationResult,
  closeBatch,
  prepareBatch,
  runBatch,
  validateBatch
} from '../../core/batch/index.ts'

const batchOperationContext = (context: KiContext): BatchOperationContext => ({
  workingDirectory: context.workingDirectory,
  homeDirectory: context.homeDirectory,
  environment: context.environment,
  runner: context.runner,
  now: context.now
})

const renderResult = (action: string, result: BatchOperationResult): string =>
  [
    `Batch ${action}: ${result.id}`,
    `Record: ${result.path}`,
    `Contract: ${result.shape}`,
    `Items: ${result.itemCount}`,
    `Run: ${result.runStarted ? 'started' : 'not started'}`,
    `Close: ${result.closed ? 'recorded' : 'open'}`,
    `Write: ${result.changed ? 'written locally' : 'none'}`,
    'Authority: structural evidence only; selection, implementation, acceptance, pruning, push, and release remain process-owned.'
  ].join('\n')

const repositoryOption = (command: Command): Command =>
  command.option('--repo <path>', 'explicit receiving KI repository')

const collectItem = (value: string, previous: readonly string[]): readonly string[] => [...previous, value]

export const createBatchCommand = (context: KiContext): Command => {
  const command = new Command('batch').description('manage canonical local batch authority records')

  const prepare = repositoryOption(
    new Command('prepare')
      .description('create one approved exact-set batch authority record')
      .option('--item <id>', 'ordered Ready work item identifier; repeat in delivery order', collectItem, [])
      .requiredOption('--approved', 'explicitly assert that recorded authority was approved')
      .addOption(
        new Option('--authority-mode <mode>', 'reviewed-items or outcome authority')
          .choices(['reviewed-items', 'outcome'])
          .makeOptionMandatory()
      )
      .option('--authority-evidence <text>', 'current human authority evidence required for outcome mode')
      .requiredOption('--expires-at <timestamp>', 'canonical future UTC expiry, for example 2099-01-01T12:00:00Z')
      .addOption(
        new Option('--completion-target <target>', 'awaiting-review or done')
          .choices(['awaiting-review', 'done'])
          .makeOptionMandatory()
      )
  ).action(
    async (options: {
      readonly repo?: string
      readonly item: readonly string[]
      readonly approved?: boolean
      readonly authorityMode: string
      readonly authorityEvidence?: string
      readonly expiresAt: string
      readonly completionTarget: string
    }) => {
      const result = await prepareBatch(
        { ...options, repository: options.repo, itemIds: options.item },
        batchOperationContext(context)
      )
      context.stdout.write(`${renderResult('prepared', result)}\n`)
    }
  )

  const validate = repositoryOption(
    new Command('validate')
      .description('validate one batch record without writing')
      .argument('<record>', 'batch identifier or canonical record path')
  ).action(async (record: string, options: { readonly repo?: string }) => {
    const result = await validateBatch({ repository: options.repo, record }, batchOperationContext(context))
    context.stdout.write(`${renderResult('valid', result)}\n`)
  })

  const run = repositoryOption(
    new Command('run')
      .description('start a batch run or append one explicit item result')
      .argument('<record>', 'batch identifier or canonical record path')
      .option('--item <id>', 'named batch item for this result')
      .addOption(
        new Option('--result <result>', 'caller-supplied item result').choices([
          'awaiting-review',
          'done',
          'parked',
          'stopped'
        ])
      )
      .option('--baseline <commit>', 'full baseline commit or —')
      .option('--result-commit <commit>', 'full resulting commit')
      .option('--exception <text>', 'one concise material exception')
  ).action(
    async (
      record: string,
      options: {
        readonly repo?: string
        readonly item?: string
        readonly result?: string
        readonly baseline?: string
        readonly resultCommit?: string
        readonly exception?: string
      }
    ) => {
      const result = await runBatch({ ...options, repository: options.repo, record }, batchOperationContext(context))
      context.stdout.write(`${renderResult('updated', result)}\n`)
    }
  )

  const close = repositoryOption(
    new Command('close')
      .description('record caller-proven completion after every named item reaches the target')
      .argument('<record>', 'batch identifier or canonical record path')
      .addOption(
        new Option('--completion-target <target>', 'must match the approved all-item target')
          .choices(['awaiting-review', 'done'])
          .makeOptionMandatory()
      )
      .requiredOption('--evidence-commit <commit>', 'full repository commit carrying completion evidence')
  ).action(
    async (
      record: string,
      options: { readonly repo?: string; readonly completionTarget: string; readonly evidenceCommit: string }
    ) => {
      const result = await closeBatch({ ...options, repository: options.repo, record }, batchOperationContext(context))
      context.stdout.write(`${renderResult('closed', result)}\n`)
    }
  )

  return command.addCommand(prepare).addCommand(validate).addCommand(run).addCommand(close)
}
