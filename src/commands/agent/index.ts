import { dirname } from 'node:path'
import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { closeRun } from '../../core/agent/close.ts'
import {
  type AgentContext,
  type AuthorityTier,
  authorityTiers,
  dispatchRun,
  holdAgent,
  type LaunchRequest,
  launchAgent,
  listRuns,
  newPrompt,
  queueAgent,
  runStatus,
  sendLine,
  startDispatcher,
  waitForRun,
  watchRun
} from '../../core/agent/runs.ts'
import { type AgentEffort, type AgentRuntime, agentEfforts, agentRuntimes } from '../../core/agent/runtimes.ts'
import {
  appendDecision,
  type DecisionClass,
  decisionClasses,
  reconcileDecision,
  rehomeThread,
  threadHome,
  threadPath
} from '../../core/agent/thread.ts'
import { DEFAULT_HARNESS } from '../../core/configuration/declaration.ts'
import { grammarError, KiError } from '../../core/errors.ts'
import { harnessDirectory } from '../../core/storage/harness-paths.ts'

export const agentContext = (context: KiContext): AgentContext => ({
  stateDirectory: context.paths.state,
  harnessDirectory: harnessDirectory(context.paths.data, DEFAULT_HARNESS),
  workingDirectory: context.workingDirectory,
  environment: context.environment,
  launcher: context.launcher,
  processes: context.agentProcesses,
  runner: context.runner,
  now: context.now
})

const collect = (value: string, previous: readonly string[]): readonly string[] => [...previous, value]

const seconds = (value: string): number => {
  if (!/^[1-9]\d*$/.test(value)) throw grammarError(`expected a positive whole number, got '${value}'`)
  return Number(value)
}

const repoOption = new Option(
  '--repo <dir>',
  "repository owning the run's thread; default, the working directory's Git repository"
)

const classOption = (): Option =>
  new Option('--class <class>', "the decision's ki-pmo class; the close gate reads it").choices(decisionClasses)

interface LaunchOptions {
  readonly runtime: AgentRuntime
  readonly addDir: readonly string[]
  readonly rules: AuthorityTier
  readonly waitFor: readonly string[]
  readonly model?: string
  readonly effort?: AgentEffort
  readonly repo?: string
  readonly relaunch?: boolean
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
    .option('--model <model>', "runtime model, passed through verbatim; omitted, the runtime's default")
    .addOption(new Option('--effort <level>', "reasoning effort; omitted, the runtime's default").choices(agentEfforts))
    .option('--relaunch', 'start a name that has already run, keeping its earlier packet in <name>.prev-<n>/')
    .addOption(repoOption)

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
  waitFor: options.waitFor,
  model: options.model,
  effort: options.effort,
  repo: options.repo,
  relaunch: options.relaunch
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
        .addOption(
          new Option('--foreground', 'hold the composed prompt in this process until its gate opens').hideHelp()
        )
    ).action(
      async (
        run: string,
        name: string,
        workdir: string,
        prompt: string,
        options: LaunchOptions & { foreground?: boolean }
      ) => {
        const launch = request(run, name, workdir, prompt, options)
        if (options.foreground) return write(await holdAgent(agentContext(context), launch))
        const result = await launchAgent(agentContext(context), launch)
        for (const warning of result.warnings) context.stderr.write(`ki: warning: ${warning}\n`)
        write(
          result.held.length
            ? `held ${run}/${name} until ${result.held.join(', ')} finish (pid ${result.pid}) in ${result.directory}`
            : `launched ${run}/${name} (pid ${result.pid}) in ${result.directory}`
        )
      }
    )
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
      const queued = await queueAgent(agentContext(context), request(run, name, options.workdir, prompt, options))
      for (const warning of queued.warnings) context.stderr.write(`ki: warning: ${warning}\n`)
      write(`queued ${run}/${name} at position ${queued.position}`)
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
      .description("print each agent's latest status, or with no run every live thread's")
      .argument('[run]', 'run name; omitted, every run with an agent running or queued')
      .option('--all', 'with no run, also list the runs at rest')
      .action(async (run: string | undefined, options: { all?: boolean }) => {
        if (run !== undefined) {
          if (options.all) throw grammarError('--all lists every run; give it without a run name')
          for (const line of (await runStatus(agentContext(context), run)).lines) write(line)
          return
        }
        const runs = await listRuns(agentContext(context), options.all === true)
        if (!runs.length) return write(options.all ? 'no runs' : 'no live runs')
        write(
          runs
            .map((overview) =>
              [
                `${overview.run} (${overview.home ?? 'no thread home'})`,
                ...(overview.items.length
                  ? overview.items.map((item) => `- [${item.kind}] ${item.agent} - ${item.what}`)
                  : ['- [at rest]'])
              ].join('\n')
            )
            .join('\n\n')
        )
      })
  )

  command.addCommand(
    new Command('send')
      .description("append one line, naming the sender, to a live run's inbox, shown by its next status")
      .argument('<run>', 'receiving run name')
      .argument('<line...>', 'the line to send')
      .option(
        '--from <run>',
        'sending run, when KI_AGENT_RUN is unset; default, the run whose thread this repository owns'
      )
      .action(async (run: string, line: readonly string[], options: { from?: string }) =>
        write(
          `Sent to ${run} in ${await sendLine(agentContext(context), { run, line: line.join(' '), from: options.from })}`
        )
      )
  )

  command.addCommand(
    new Command('watch')
      .description('print each new event and one status line per interval until every agent stops, ending ALL FINISHED')
      .argument('<run>', 'run name')
      .argument('[seconds]', 'seconds between lines', seconds, 120)
      .action((run: string, interval: number) => watchRun(agentContext(context), run, interval, write))
  )

  command.addCommand(
    new Command('wait')
      .description('block until the next unseen finish, failure, block or query, or with no --next until the run ends')
      .argument('<run>', 'run name')
      .option('--next', 'return the next unseen done, failed, blocked or needs-owner event, marking it seen')
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
      .addOption(repoOption)
      .action(async (run: string, name: string, options: { repo?: string }) =>
        write(await newPrompt(agentContext(context), run, name, options.repo))
      )
  )

  command.addCommand(
    new Command('home')
      .description("print the run's thread home, or record a +/_WORK/<id>/ work folder as it")
      .argument('<run>', 'run name')
      .option('--work <id>', 'record the work folder of this dotted work id as the home')
      .addOption(repoOption)
      .action(async (run: string, options: { work?: string; repo?: string }) => {
        if (options.work === undefined)
          return write(threadPath(await threadHome(agentContext(context), run, options.repo, false)))
        write(
          `Thread home of ${run} is now ${threadPath(await rehomeThread(agentContext(context), run, options.work, options.repo))}`
        )
      })
  )

  command.addCommand(
    new Command('decide')
      .description("append a numbered, timestamped owner decision to the thread's tracked decisions log")
      .argument('<run>', 'run name')
      .argument('<text...>', "the decision, in the owner's words")
      .option('--log <path>', "decisions log to append instead of the thread's own")
      .option('--home <path-or-id>', "the decision's durable home: a committed path or a work-record identifier")
      .addOption(classOption())
      .addOption(repoOption)
      .action(
        async (
          run: string,
          text: readonly string[],
          options: { log?: string; home?: string; class?: DecisionClass; repo?: string }
        ) => {
          const result = await appendDecision(agentContext(context), run, {
            text: text.join(' '),
            log: options.log,
            home: options.home,
            class: options.class,
            repo: options.repo
          })
          if (result.adopted.length)
            write(`Moved ${result.adopted.join(', ')} from the state folder into ${dirname(result.path)}`)
          write(`Decision ${result.number} recorded in ${result.path}`)
        }
      )
  )

  command.addCommand(
    new Command('reconcile')
      .description("write or replace one decision's durable home or class in the thread's tracked log")
      .argument('<run>', 'run name')
      .argument('<number>', 'decision number', seconds)
      .argument('[home]', 'a committed path or a work-record identifier')
      .addOption(classOption())
      .action(async (run: string, number: number, home: string | undefined, options: { class?: DecisionClass }) => {
        const path = await reconcileDecision(agentContext(context), run, number, { home, class: options.class })
        const changed = [
          ...(home === undefined ? [] : [`home ${home}`]),
          ...(options.class === undefined ? [] : [`class ${options.class}`])
        ]
        write(`Decision ${number} ${changed.join(' ')} recorded in ${path}`)
      })
  )

  command.addCommand(
    new Command('close')
      .description("retire a finished run's state folder once its reconcile gate passes")
      .argument('<run>', 'run name')
      .option('--delete', 'remove the state folder instead of archiving it')
      .option('--compress', 'archive the state folder as a tarball')
      .option('--accept-exited <name>', 'accept an agent that exited without DONE; repeatable', collect, [])
      .option('--reconciled', 'waive the decision and temporary-folder checks; the close note records the waiver')
      .addOption(repoOption)
      .action(
        async (
          run: string,
          options: {
            delete?: boolean
            compress?: boolean
            acceptExited: readonly string[]
            reconciled?: boolean
            repo?: string
          }
        ) => {
          const result = await closeRun(agentContext(context), {
            run,
            repo: options.repo,
            delete: options.delete === true,
            compress: options.compress === true,
            acceptExited: options.acceptExited,
            reconciled: options.reconciled === true
          })
          for (const line of result.lines) write(line)
          if (result.outcome === undefined) throw new KiError(`${run} cannot close until every blocker clears`, 1)
          write(result.outcome)
        }
      )
  )

  return command
}
