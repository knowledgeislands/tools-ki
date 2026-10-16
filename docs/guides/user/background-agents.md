# Run detached background agents

This guide shows how to delegate work to detached Claude Code or Codex agents with `ki agent`, keep a queue of them moving, know when each one finishes, and close the run once its decisions are housed. The [`ki-delegation` background-run standard](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/governance/ki-delegation/references/standards-background-runs.md) owns the contract; `ki agent` is its reference launcher. Exact grammar is in `ki agent --help` and `man ki`.

## Before you start

- The canonical Harness is installed or linked with `ki dev local on`, so the `ki-delegation` footers and prompt skeleton resolve.
- The `claude` or `codex` executable is on `PATH`.
- Set `TZ` to the owner's time zone if the host default is not it; status lines use it. Decision timestamps are UTC.
- The first `launch`, `queue`, `new` or `decide` for a run fixes the thread home: the Git top level of `--repo <dir>`, or else of the launch's working directory, which the directory the command runs from must share. The home is recorded in the state folder's `thread.json`, and from then on every command for the run uses it whatever directory it runs from; a later `--repo` that disagrees is refused.

## Record the authority and write the prompt

1. Record the owner's approval: `ki agent decide <run> "<the owner's words>"`. It appends a numbered, UTC-timestamped entry to the tracked `+/_THREADS/<run>/decisions.md` and prints the number. For a run that predates the tracked home, `decide` first moves the state folder's `decisions.md` and reports into the thread folder and names them, so the log keeps its numbering; it skips any the thread folder holds or Git has ever held, so a retired report stays retired. Add `--home <path-or-id>` when the decision already lives durably in a committed file or a roadmap record, or give it one later with `ki agent reconcile <run> <number> <home>`. Add `--class <operational|rule|standalone|held>` to write the entry's `ki-pmo` decision class on a `class:` line beside `home:`; `reconcile <run> <number> --class <class>` sets or replaces it, with or without a home.
2. Write a skeleton with `ki agent new <run> <name>` and complete it: the task citing that decision in the owner's words, numbered steps, a verification step and the report path the skeleton already names.
3. Choose the lowest sufficient authority tier: `none`, `push`, `prune` or `release`. Name every remote call the task relies on in the prompt itself.

An owner report links every work record it cites. `ki link <identifier...>` prints each link in one call: `[KI-TOOL-KI-CLI-127](<absolute path>)` for a live record, found through the registered repository whose `repo_code` scopes the identifier, and `[<identifier> (pruned)](https://github.com/<owner>/<repo>/blob/<last revision>/<path>)` for a record pruned from its roadmap. An identifier that resolves to nothing exits 1 with the reason rather than an invented link.

## Launch one agent

```sh
ki agent launch <run> <name> <workdir> <prompt-file> --rules push --add-dir <dir>
```

The launcher appends the tier's footer and the progress protocol, then starts the agent in its own session with standard input from `/dev/null`. The runtime packet lives under `$KI_STATE_HOME/agents/<run>/`: `<name>.prompt.md`, `.launch.json`, `.status`, `.pid` and `.log`, with `thread.json` naming the thread home and `inbox.md` holding lines other threads sent the run. The agent writes `<name>.report.md` into the owning repository's `+/_THREADS/<run>/` beside `decisions.md`; the launcher adds that repository to the agent's writable directories when the working directory lies outside it. `ki` is the only writer of those files and never commits the thread folder: commit it with the thread's other work. Every agent `ki` starts, Claude or Codex, through `launch` or `dispatch`, carries the run name in `KI_AGENT_RUN`, so a hook can tell a launched agent from an interactive session on either runtime.

Choose the model and reasoning effort with `--model <model>` and `--effort low|medium|high|xhigh|max`, for example `--runtime claude --model claude-fable-5-1 --effort high` or `--runtime codex --model gpt-6-astra --effort xhigh`. The model name passes through verbatim, and the runtime rejects an effort its model does not support. Omit either to keep the runtime's own default. `<name>.launch.json` records the runtime, model, effort and working directory the agent started with; `ki agent queue` carries both options through to the dispatcher.

Use `--wait-for <other>` when an agent must not start until another agent in the run writes `DONE`. The launcher holds the gate itself, so the agent's runtime cannot end its session while waiting:

- When every named agent has already written `DONE`, the agent starts at once.
- Otherwise `ki` writes the run packet, sets the status to `held until <names> finish`, and detaches a hold process that checks every 30 seconds and starts the agent once the gate opens. While held, `.pid` names the hold process, so status, watch and wait count the agent as running.
- When a named agent exits without `DONE`, the gate can never open: the launch is refused, or a held agent ends with the status `gate cannot open: <name> exited without DONE`, which in turn closes any gate waiting on it. Relaunch the failed agent under its name, then the agents behind it.

A name not yet launched keeps the gate waiting, so you may launch the dependent agent first. Parallel agents in one repository each need their own Git worktree as `<workdir>`.

## Keep a queue moving

1. Queue ready-made prompts in priority order: `ki agent queue <run> <name> <prompt-file> --workdir <dir> --rules push`.
2. Start the dispatcher once: `ki agent dispatch <run> --max 4`. It launches the first queued agent whose `--wait-for` gate is open as soon as any running one finishes, logs each launch to `dispatch.log`, and exits when the queue is empty and nothing is running. It drops, and logs, a queued agent whose gate cannot open, including one still waiting once nothing in the run is running.
3. Arm the waiter in the background: `ki agent wait <run> --next`. It returns the next run event you have not seen, in the order events happened, as `<name> <kind>: <text>`: `done` for `DONE` with a report, `failed` for an exit without `DONE`, `DONE` with no report or a `failed:` status line, `blocked` for a gate that cannot open, a dispatcher drop or a `blocked:` status line, and `needs-owner` for each outstanding query heading in the report.
4. On each wake, read the agent's report, tell the owner the outcome, and re-arm the waiter. Stop re-arming once it prints `ALL FINISHED`.

Agents need do nothing new: the events derive from the status line, `DONE` and the report. The progress protocol also offers `HH:MM <zone> - milestone: <text>`, which `watch` shows as a `progress` event, and the `blocked:` and `failed:` forms, which wake the waiter. Every event lands in the run's append-only `events.jsonl`.

Reorder priorities by editing nothing but the queue order: queue new work last, or launch urgent work directly.

## Check on a run

- `ki agent status <run>` prints each agent's latest status, flags any agent that exited without `DONE`, and lists the queue.
- `ki agent status` with no run lists every live thread on this machine: `<run> (<thread home>)`, then `- [running] <agent> - <status>` and `- [queued] <agent> - position <n>` lines a banner can quote as they are. `--all` adds runs at rest; archived runs never appear.
- `ki agent send <run> "<line>"` appends `<UTC time> from <sender>: <line>` to a live run's `inbox.md` in its state folder, and refuses a run with nothing running, held or queued. The sender is the agent's `KI_AGENT_RUN`, else `--from <run>`, else the one run whose thread lives in the working directory's repository. The receiving thread's next `ki agent status <run>` prints each new line once as `inbox: <line>`, so its usual re-anchoring shows what it was sent.
- `ki agent watch <run>` prints each new event, launches and milestones included, then one status line every two minutes, and ends with `ALL FINISHED`.

After an interrupt of your own session, or a compaction, run `ki agent status` before claiming anything is still running. Relaunch an agent flagged `EXITED WITHOUT DONE` rather than waiting for it.

## Close a run

Once every agent has finished and the thread has consolidated each decision into its durable home, retire the state folder:

```sh
ki agent close <run>
```

The reconcile gate prints one line per check and must pass whole: every agent finished with `DONE` or is named in `--accept-exited <name>`, no dispatcher is running, the queue and `worktrees/` are empty, every decision in the tracked log carries a `home:` that is a Git-tracked path or a roadmap record of a registered repository, except that an `operational` decision with no home is its own home and a `held` decision whose home is a `_CHECKPOINTS/` file passes once that file exists, tracked or not, and the thread folder is committed and clean. On any blocker it prints every line, exits 1 and changes nothing. Give an unhoused decision its home with `ki agent reconcile <run> <number> <home>`, or waive the decision check with `--reconciled`, which the close note records.

When the gate passes the state folder moves to `$KI_STATE_HOME/agents/_archive/<run>/` with a `close.md` note of the gate and each decision's home. `--compress` writes `_archive/<run>.tar.gz` and `--delete` removes the folder instead, each leaving the note at `_archive/<run>.close.md`. For a run that predates the tracked home, `close` first moves any `decisions.md` or `<name>.report.md` left in the state folder into the thread folder and prints an `ok` line for each, so commit the folder and run `close` again; a copy the thread folder holds, or has ever held in Git, supersedes the state folder's, which is archived with the run.

A report the thread has retired from its folder stays retired: `decide` and `close` never move a state-folder file whose path Git knows, in the index or in any commit, and `launch`, `queue` and `new` never move files at all. Two cases fall outside that test: a shallow clone that lacks the commit, and a report that was never committed before it was deleted. Either brings the report back, untracked, while the state copy remains; delete it by hand.

## Recover

- **Already running:** `launch` refuses a name whose process is alive. Choose a new name or wait for it.
- **Already run:** names are unique within a run. `launch` and `queue` refuse a name whose packet or report already exists, naming the files and the first free `<name>-<n>`; use that name, or pass `--relaunch` to start the same agent again. A relaunch moves the earlier prompt, status, log, launch details and pid into `<name>.prev-<n>/` in the state folder and is refused until the thread-folder report is committed, so the earlier report survives in Git.
- **Missing assets:** update or relink the canonical Harness so its `ki-delegation` skill ships the run assets.
- **A queued launch failed:** the dispatcher logs `could not launch <name>` and moves on. Fix the cause and queue the agent again under a new name.
- **Not inside a Git repository:** `launch`, `queue`, `new` and `decide` need the thread home. Run from the owning repository or pass `--repo <dir>`.
- **No thread home yet:** a command run from a different repository than the launch's working directory, or on a run whose launches predate the recorded working directory, refuses to fix the home. Run it from the launch's working directory or pass `--repo <dir>` once; the recorded home holds from then on.
- **Close blocked:** read each `blocker:` line. Relaunch or accept an agent that exited without `DONE`, stop or finish the dispatcher, remove finished worktrees, house or reconcile each decision, and commit the thread folder.
