# Run detached background agents

This guide shows how to delegate work to detached Claude Code or Codex agents with `ki agent`, keep a queue of them moving, know when each one finishes, and close the run once its decisions are housed. The [`ki-delegation` background-run standard](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/governance/ki-delegation/references/standards-background-runs.md) owns the contract; `ki agent` is its reference launcher. Exact grammar is in `ki agent --help` and `man ki`.

## Before you start

- The canonical Harness is installed or linked with `ki dev local on`, so the `ki-delegation` footers and prompt skeleton resolve.
- The `claude` or `codex` executable is on `PATH`.
- Set `TZ` to the owner's time zone if the host default is not it; status lines use it. Decision timestamps are UTC.
- Run from inside the repository that owns the thread, or pass `--repo <dir>`. The first `launch`, `queue`, `new` or `decide` for a run fixes that repository as the thread home and records it in the state folder's `thread.json`; a later `--repo` that disagrees is refused.

## Record the authority and write the prompt

1. Record the owner's approval: `ki agent decide <run> "<the owner's words>"`. It appends a numbered, UTC-timestamped entry to the tracked `+/_THREADS/<run>/decisions.md` and prints the number. Add `--home <path-or-id>` when the decision already lives durably in a committed file or a roadmap record, or give it one later with `ki agent reconcile <run> <number> <home>`.
2. Write a skeleton with `ki agent new <run> <name>` and complete it: the task citing that decision in the owner's words, numbered steps, a verification step and the report path the skeleton already names.
3. Choose the lowest sufficient authority tier: `none`, `push`, `prune` or `release`. Name every remote call the task relies on in the prompt itself.

## Launch one agent

```sh
ki agent launch <run> <name> <workdir> <prompt-file> --rules push --add-dir <dir>
```

The launcher appends the tier's footer and the progress protocol, then starts the agent in its own session with standard input from `/dev/null`. The runtime packet lives under `$KI_STATE_HOME/agents/<run>/`: `<name>.prompt.md`, `.launch.json`, `.status`, `.pid` and `.log`, with `thread.json` naming the thread home. The agent writes `<name>.report.md` into the owning repository's `+/_THREADS/<run>/` beside `decisions.md`; the launcher adds that repository to the agent's writable directories when the working directory lies outside it. `ki` never commits the thread folder: commit it with the thread's other work.

Choose the model and reasoning effort with `--model <model>` and `--effort low|medium|high|xhigh|max`, for example `--runtime claude --model claude-fable-5-1 --effort high` or `--runtime codex --model gpt-6-astra --effort xhigh`. The model name passes through verbatim, and the runtime rejects an effort its model does not support. Omit either to keep the runtime's own default. `<name>.launch.json` records the runtime, model and effort the agent started with; `ki agent queue` carries both options through to the dispatcher.

Use `--wait-for <other>` when an agent must not start until another agent in the run writes `DONE`. The launcher holds the gate itself, so the agent's runtime cannot end its session while waiting:

- When every named agent has already written `DONE`, the agent starts at once.
- Otherwise `ki` writes the run packet, sets the status to `held until <names> finish`, and detaches a hold process that checks every 30 seconds and starts the agent once the gate opens. While held, `.pid` names the hold process, so status, watch and wait count the agent as running.
- When a named agent exits without `DONE`, the gate can never open: the launch is refused, or a held agent ends with the status `gate cannot open: <name> exited without DONE`, which in turn closes any gate waiting on it. Relaunch the failed agent under its name, then the agents behind it.

A name not yet launched keeps the gate waiting, so you may launch the dependent agent first. Parallel agents in one repository each need their own Git worktree as `<workdir>`.

## Keep a queue moving

1. Queue ready-made prompts in priority order: `ki agent queue <run> <name> <prompt-file> --workdir <dir> --rules push`.
2. Start the dispatcher once: `ki agent dispatch <run> --max 4`. It launches the first queued agent whose `--wait-for` gate is open as soon as any running one finishes, logs each launch to `dispatch.log`, and exits when the queue is empty and nothing is running. It drops, and logs, a queued agent whose gate cannot open, including one still waiting once nothing in the run is running.
3. Arm the waiter in the background: `ki agent wait <run> --next`. It returns `<name> finished: <last status>`, or that the agent exited without `DONE`, and marks that agent seen.
4. On each wake, read the agent's report, tell the owner the outcome, and re-arm the waiter. Stop re-arming once it prints `ALL FINISHED`.

Reorder priorities by editing nothing but the queue order: queue new work last, or launch urgent work directly.

## Check on a run

- `ki agent status <run>` prints each agent's latest status, flags any agent that exited without `DONE`, and lists the queue.
- `ki agent watch <run>` prints one line every two minutes and ends with `ALL FINISHED`.

After an interrupt of your own session, run `ki agent status` before claiming anything is still running. Relaunch an agent flagged `EXITED WITHOUT DONE` rather than waiting for it.

## Close a run

Once every agent has finished and the thread has consolidated each decision into its durable home, retire the state folder:

```sh
ki agent close <run>
```

The reconcile gate prints one line per check and must pass whole: every agent finished with `DONE` or is named in `--accept-exited <name>`, no dispatcher is running, the queue and `worktrees/` are empty, every decision in the tracked log carries a `home:` that is a Git-tracked path or a roadmap record of a registered repository, and the thread folder is committed and clean. On any blocker it prints every line, exits 1 and changes nothing. Give an unhoused decision its home with `ki agent reconcile <run> <number> <home>`, or waive the decision check with `--reconciled`, which the close note records.

When the gate passes the state folder moves to `$KI_STATE_HOME/agents/_archive/<run>/` with a `close.md` note of the gate and each decision's home. `--compress` writes `_archive/<run>.tar.gz` and `--delete` removes the folder instead, each leaving the note at `_archive/<run>.close.md`. A run that predates the tracked home keeps its log in the state folder; `close` reads that log until the thread copies it across.

## Recover

- **Already running:** `launch` refuses a name whose process is alive. Choose a new name or wait for it.
- **Missing assets:** update or relink the canonical Harness so its `ki-delegation` skill ships the run assets.
- **A queued launch failed:** the dispatcher logs `could not launch <name>` and moves on. Fix the cause and queue the agent again under a new name.
- **Not inside a Git repository:** `launch`, `queue`, `new` and `decide` need the thread home. Run from the owning repository or pass `--repo <dir>`.
- **Close blocked:** read each `blocker:` line. Relaunch or accept an agent that exited without `DONE`, stop or finish the dispatcher, remove finished worktrees, house or reconcile each decision, and commit the thread folder.
