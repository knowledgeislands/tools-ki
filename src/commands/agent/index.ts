import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  type AgentContext,
  type AuthorityTier,
  authorityTiers,
  dispatchRun,
  type LaunchRequest,
  launchAgent,
  newPrompt,
  queueAgent,
  recordDecision,
  runStatus,
  startDispatcher,
  waitForRun,
  watchRun
} from '../../core/agent/runs.ts'
import { type AgentRuntime, agentRuntimes } from '../../core/agent/runtimes.ts'
import { DEFAULT_HARNESS } from '../../core/configuration/declaration.ts'
import { grammarError } from '../../core/errors.ts'
import { harnessDirectory } from '../../core/storage/harness-paths.ts'

const agentContext = (context: KiContext): AgentContext => ({
  stateDirectory: context.paths.state,
  harnessDirectory: harnessDirectory(context.paths.data, DEFAULT_HARNESS),
  workingDirectory: context.workingDirectory,
  environment: context.environment,
  executable: context.executable,
  processes: context.agentProcesses,
  now: context.now
})

const collect = (value: string, previous: readonly string[]): readonly string[] => [...previous, value]

const seconds = (value: string): number => {
  if (!/^[1-9]\d*$/.test(value)) throw grammarError(`expected a positive whole number, got '${value}'`)
  return Number(value)
}

interface LaunchOptions {
  readonly runtime: AgentRuntime
  readonly addDir: readonly string[]
  readonly rules: AuthorityTier
  readonly waitFor: readonly string[]
}

/** The launch options `launch` and `queue` share. */
const withLaunchOptions = (command: Command): Command =>
  command
    .addOption(new Option('--runtime <runtime>', 'agent runtime adapter').choices(agentRuntimes).default('claude'))
    .option('--add-dir <dir>', 'extra directory the agent may write; repeatable', collect, [])
    .addOption(
      new Option('--rules <tier>', 'ki-delegation authority footer to append').choices(authorityTiers).default('none')
    )
    .option('--wait-for <name>', 'agent in this run whose DONE gates the start; repeatable', collect, [])

const request = (
  run: string,
  name: string,
  workdir: string,
  prompt: string,
  options: LaunchOptions
): LaunchRequest => ({
  run,
  name,
  workdir,
  prompt,
  runtime: options.runtime,
  addDirs: options.addDir,
  rules: options.rules,
  waitFor: options.waitFor
})

export const createAgentCommand = (context: KiContext): Command => {
  const write = (line: string): void => {
    context.stdout.write(`${line}\n`)
  }
  const command = new Command('agent').description(
    'launch and coordinate detached background agents under the ki-delegation run contract'
  )
  // Four positional operands would push the subcommand list past 80 columns, so the
  // list names each subcommand alone; its own help still shows the full usage.
  const createHelp = command.createHelp.bind(command)
  command.createHelp = () =>
    Object.assign(createHelp(), {
      subcommandTerm: (subcommand: Command) => `${subcommand.name()}${subcommand.options.length ? ' [options]' : ''}`
    })

  command.addCommand(
    withLaunchOptions(
      new Command('launch')
        .description('launch one detached agent and write its run packet')
        .argument('<run>', 'run name')
        .argument('<name>', 'agent name')
        .argument('<workdir>', 'working directory for the agent')
        .argument('<prompt-file>', 'prompt to launch')
    ).action(async (run: string, name: string, workdir: string, prompt: string, options: LaunchOptions) => {
      const result = await launchAgent(agentContext(context), request(run, name, workdir, prompt, options))
      write(`launched ${run}/${name} (pid ${result.pid}) in ${result.directory}`)
    })
  )

  command.addCommand(
    withLaunchOptions(
      new Command('queue')
        .description('append a ready-made agent to the run queue')
        .argument('<run>', 'run name')
        .argument('<name>', 'agent name')
        .argument('<prompt-file>', 'prompt to launch when dispatched')
        .option('--workdir <dir>', 'working directory for the agent', '.')
    ).action(async (run: string, name: string, prompt: string, options: LaunchOptions & { workdir: string }) => {
      const position = await queueAgent(agentContext(context), request(run, name, options.workdir, prompt, options))
      write(`queued ${run}/${name} at position ${position}`)
    })
  )

  command.addCommand(
    new Command('dispatch')
      .description('keep up to N queued agents running, detached, until the queue is empty')
      .argument('<run>', 'run name')
      .requiredOption('--max <count>', 'most agents running at once', seconds)
      .option('--interval <seconds>', 'seconds between checks', seconds, 30)
      .addOption(new Option('--foreground', 'run the dispatch loop in this process').hideHelp())
      .action(async (run: string, options: { max: number; interval: number; foreground?: boolean }) => {
        const dispatch = { run, max: options.max, seconds: options.interval }
        if (options.foreground) return dispatchRun(agentContext(context), dispatch, write)
        const pid = await startDispatcher(agentContext(context), dispatch)
        write(`dispatching ${run} with up to ${options.max} agents (pid ${pid})`)
      })
  )

  command.addCommand(
    new Command('status')
      .description("print each agent's latest status")
      .argument('<run>', 'run name')
      .action(async (run: string) => {
        for (const line of (await runStatus(agentContext(context), run)).lines) write(line)
      })
  )

  command.addCommand(
    new Command('watch')
      .description('print one status line per interval until every agent stops, ending ALL FINISHED')
      .argument('<run>', 'run name')
      .argument('[seconds]', 'seconds between lines', seconds, 120)
      .action((run: string, interval: number) => watchRun(agentContext(context), run, interval, write))
  )

  command.addCommand(
    new Command('wait')
      .description('block until the next unseen agent finishes, or with no --next until the run ends')
      .argument('<run>', 'run name')
      .option('--next', 'return when the next unseen agent finishes, marking it seen')
      .option('--interval <seconds>', 'seconds between checks', seconds, 30)
      .action(async (run: string, options: { next?: boolean; interval: number }) =>
        write(await waitForRun(agentContext(context), run, { next: options.next === true, seconds: options.interval }))
      )
  )

  command.addCommand(
    new Command('new')
      .description('write a prompt skeleton from the ki-delegation run contract')
      .argument('<run>', 'run name')
      .argument('<name>', 'agent name')
      .action(async (run: string, name: string) => write(await newPrompt(agentContext(context), run, name)))
  )

  command.addCommand(
    new Command('decide')
      .description("append a numbered, dated owner decision to the run's decisions log")
      .argument('<run>', 'run name')
      .argument('<text...>', "the decision, in the owner's words")
      .option('--log <path>', "decisions log to append instead of the run's own")
      .action(async (run: string, text: readonly string[], options: { log?: string }) => {
        const result = await recordDecision(agentContext(context), run, text.join(' '), options.log)
        write(`Decision ${result.number} recorded in ${result.path}`)
      })
  )

  return command
}
