import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type AgentContext, localTime } from '../../core/agent/context.ts'
import type { ControlReceipt } from '../../core/agent/control-store.ts'
import { dequeueAgent, inspectRecovery, resolveRecovery, stopAgent } from '../../core/agent/controls.ts'
import { grammarError, KiExit } from '../../core/errors.ts'

const positive = (value: string): number => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw grammarError('expected a positive whole number')
  return Number(value)
}

export const controlCommands = (context: KiContext, agent: AgentContext): readonly Command[] => {
  const output = (receipt: ControlReceipt, json?: boolean): void => {
    context.stdout.write(
      `${json ? JSON.stringify(receipt) : `${localTime(agent)} - ${receipt.outcome}: ${receipt.reason} (${receipt.operationId})`}\n`
    )
    if (receipt.exitCode !== 0) throw new KiExit(receipt.exitCode)
  }
  const stop = new Command('stop')
    .description('request SIGTERM only for a verified whole-attempt containment scope')
    .argument('<run>')
    .argument('<name>')
    .requiredOption('--attempt <n>', 'immutable attempt number', positive)
    .requiredOption('--reason <text>', 'owner-authorised reason')
    .option('--grace <seconds>', 'observation grace, 1-120 seconds; no escalation', positive, 30)
    .option('--request <id>', 'idempotent operation ID')
    .option('--json', 'versioned control receipt')
    .action(
      async (
        run: string,
        name: string,
        options: { attempt: number; reason: string; grace: number; request?: string; json?: boolean }
      ) => output(await stopAgent(agent, { run, name, ...options }), options.json)
    )
  const dequeue = new Command('dequeue')
    .description('cancel one immutable queue entry before worker spawn')
    .argument('<run>')
    .argument('<name>')
    .requiredOption('--entry <id>', 'immutable queue entry ID')
    .requiredOption('--reason <text>', 'cancellation reason')
    .option('--request <id>', 'idempotent operation ID')
    .option('--json', 'versioned control receipt')
    .action(
      async (run: string, name: string, options: { entry: string; reason: string; request?: string; json?: boolean }) =>
        output(await dequeueAgent(agent, { run, name, ...options }), options.json)
    )
  const recover = new Command('recover').description(
    'inspect or reconcile an uncertain control effect; never starts or signals a worker'
  )
  recover.addCommand(
    new Command('inspect')
      .description('read the frozen operation and required local evidence')
      .argument('<run>')
      .requiredOption('--operation <id>', 'original uncertain operation')
      .option('--json', 'machine-readable inspection')
      .action(async (run: string, options: { operation: string; json?: boolean }) => {
        const inspection = await inspectRecovery(agent, run, options.operation)
        context.stdout.write(`${JSON.stringify(inspection, null, options.json ? undefined : 2)}\n`)
      })
  )
  recover.addCommand(
    new Command('resolve')
      .description('verify local adapter evidence under cited owner authority')
      .argument('<run>')
      .requiredOption('--operation <id>', 'original uncertain operation')
      .requiredOption('--evidence <local-json-path>', 'ki/agent-reconciliation/v1 evidence')
      .requiredOption('--authority <local-path#heading>', 'bounded local recovery decision')
      .option('--request <id>', 'idempotent resolution ID')
      .option('--json', 'versioned reconciliation receipt')
      .action(
        async (
          run: string,
          options: { operation: string; evidence: string; authority: string; request?: string; json?: boolean }
        ) => output(await resolveRecovery(agent, { run, ...options }), options.json)
      )
  )
  return [stop, dequeue, recover]
}
