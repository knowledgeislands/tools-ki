# Run detached background agents

This guide shows how to delegate work to detached Claude Code or Codex agents with `ki agent`, keep a queue of them moving, know when each one finishes, and close the run once its decisions are housed. The [`ki-delegation` background-run standard](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/governance/ki-delegation/references/standards-background-runs.md) owns the contract; `ki agent` is its reference launcher. Exact grammar is in `ki agent --help` and `man ki`.

## Before you start

- The canonical Harness is installed or linked with `ki dev local on`, so the `ki-delegation` footers and prompt skeleton resolve.
- The `claude` or `codex` executable is on `PATH`.
- Set `TZ` to the owner's time zone if the host default is not it; status lines use it. Decision timestamps are UTC.
- The first `launch`, `queue`, `new` or `decide` for a run fixes the thread home: the Git top level of `--repo <dir>`, or else of the launch's working directory, which the directory the command runs from must share. The home is recorded in the state folder's `thread.json`, and from then on every command for the run uses it whatever directory it runs from; a later `--repo` that disagrees is refused.

## Record the authority and write the prompt

1. Record the owner's approval: `ki agent decide <run> "<the owner's words>"`. It appends a numbered, UTC-timestamped entry to the tracked `decisions.md` in the run's thread home and prints the number. For a run that predates the tracked home, `decide` first moves the state folder's `decisions.md` and reports into the thread folder and names them, so the log keeps its numbering; it skips any the thread folder holds or Git has ever held, so a retired report stays retired. Add `--home <path-or-id>` when the decision already lives durably in a committed file or a roadmap record, or give it one later with `ki agent reconcile <run> <entry> <home>`. Add `--class <operational|rule|standalone|held>` to write the entry's `ki-coordination` decision class on a `class:` line beside `home:`; `reconcile <run> <number> --class <class>` sets or replaces it, with or without a home. When the owner answers a report's reply block with a bare option letter, log it as `ki agent decide <run> '<TAG> - <letter>'`: `decide` finds the newest `*.report.md` in the thread folder whose `## Queries` holds a `<TAG>` query, writes that option's `<letter>) <wording>` without its `(recommended)` marker, and names the report on a `source:` line, so the log reads without the report. It refuses, writing nothing, a letter with no tag, a tag no report carries, or a letter the newest such report lacks.
2. Write a skeleton with `ki agent new <run> <name>` and complete it: the task citing that decision in the owner's words, numbered steps, a verification step and the report path the skeleton already names, `<name>.report.md` in the run's state folder.
3. Choose the lowest sufficient authority tier: `none`, `push`, `prune` or `release`. Name every remote call the task relies on in the prompt itself.

An owner report links every work record it cites. `ki link <identifier...>` prints each link in one call: `[KI-TOOL-KI-CLI-127](<absolute path>)` for a live record, found through the registered repository whose `repo_code` scopes the identifier, and `[<identifier> (pruned)](https://github.com/<owner>/<repo>/blob/<last revision>/<path>)` for a record pruned from its roadmap. An identifier that resolves to nothing exits 1 with the reason rather than an invented link.

## Control one recorded attempt

New launches record immutable attempt numbers and launch tokens. Queue receipts (`--json`) and status expose immutable entry IDs. `ki agent stop <run> <name> --attempt <n> --reason <text> [--grace <seconds>]` requests SIGTERM only through an adapter that proves ownership and containment of the whole attempt, including reparented descendants and changes of process group or session. Grace defaults to 30 seconds, accepts 1-120 seconds and never escalates to SIGKILL. The current native adapters have no accepted containment evidence, so they refuse confirmed stop without signalling. A PID or a new launch token alone is not ownership evidence.

`ki agent dequeue <run> <name> --entry <id> --reason <text>` cancels an entry before it starts. A cancellation tombstone survives later dispatch and queue rewrites. A worker that has already started returns `already-started`, exit 1, with its exact stop command; a terminal attempt returns `already-terminal`, exit 0. The brief and frozen launch request remain available for review. Dequeue never signals a worker.

Both controls accept `--request <id>` for durable idempotency and `--json` for `ki/agent-control/v1` receipts. Reusing an ID with different operation arguments is a refusal. A confirmed stop or cancellation produces one `stopped` or `dequeued` event; `wait --next`, status and watch expose it. These outcomes close dependency gates and never satisfy a `DONE` gate. Unconfirmed attempts keep the run visibly busy.

## Inspect an uncertain launch

A claim is journalled before spawn. An uncertain claim blocks replacement work. Use `ki agent recover inspect <run> --operation <id> --json` to read the frozen identity, journal and required evidence. `ki agent recover resolve <run> --operation <id> --evidence <local-json-path> --authority <local-path#heading> [--request <id>] [--json]` verifies local adapter evidence and records a reconciliation receipt. It never launches, signals, resumes or deletes anything.

The evidence schema is `ki/agent-reconciliation/v1`, with `operation_id`, `target_id` (the reserved launch token), `observation` (`spawn-started` or `spawn-not-started`) and non-empty `proofs`, each containing an absolute local `path` and its `sha256`. File digests alone do not prove a process outcome: the managed adapter must validate its own evidence records and confirm current ownership and containment. A missing acknowledgement, PID or transcript does not prove that no worker started. The current native adapters cannot verify this evidence and leave uncertain claims fenced. An abandoned transaction lock also requires verified local inspection; the CLI never steals a lock on age or PID alone.

The existing `ki agent reconcile <run> <entry> [home] --class <class>` remains the decisions-log operation, including runs named `inspect` or `resolve`.

## Preview role defaults

`launch` and `queue` accept `--role mechanical|plan|build|review|accept|prune|release`, `--authority <local-path#heading>` and `--dry-run --json`. Dry-run shows the effective fields, their sources and every selection refusal without creating a packet, worktree or process. Explicit fields take precedence within the role's constraints. Queueing freezes the selection and its profile revision; dispatch checks that frozen request rather than silently adopting changed defaults.

All model profiles ship dormant until accepted local validity and suitability evidence exists. An explicit model name cannot bypass this gate. Accept also requires `--acceptance <local-json-path>` using `ki/agent-acceptance/v1`, the `none` footer, exact named records, digests and recorded independent review identities. The declaration preflight is available, but every accept launch remains disabled with `acceptance-contract-unavailable` until the Harness wording and CLI validator have been verified together. A role adds no grant. Push, pruning, release, fetch and machine authority remain explicit and bounded.

Role-free launch and queue requests retain their Claude runtime default, omitted model and effort, and `none` footer. Existing role-free `--rules push|prune|release` requests do not acquire a new `--authority` requirement. Their selection is labelled `legacy`. Native wake is outside this build; no wake command or watcher is enabled.

## Launch one agent

```sh
ki agent launch <run> <name> <workdir> <prompt-file> --rules push --add-dir <dir>
```

The launcher appends the tier's footer and the progress protocol, then starts the agent in its own session with standard input from `/dev/null`. The runtime packet lives under `$KI_STATE_HOME/agents/<run>/`: `<name>.prompt.md`, `.launch.json`, `.status`, `.pid` and `.log`, with `thread.json` naming the thread home and `inbox.md` holding lines other threads sent the run. The agent writes `<name>.report.md` in the state folder, and the first `status`, `watch` or `wait` that sees its `DONE` copies the report into the thread home beside `decisions.md`, once per attempt, unless the thread home holds a copy with changes Git does not hold; the launcher adds that repository to the agent's writable directories when the working directory lies outside it. Launch also creates the agent's temporary folder, `$TMPDIR/ki-agents/<run>/<name>/`, outside every repository, names it in the progress protocol and adds it to the writable directories; close removes it. The protocol's report path governs. An agent reports only to its state folder and the launcher alone homes the report, so launch and queue refuse with exit 1, writing nothing, a brief that names the agent's own `<name>.report.md` in the run's work folder or any `+/_WORK/<id>/`; a relaunch is refused the same way, and the dispatcher records a queued brief it refuses as `failed` and moves on. A brief may still cite other agents' reports there. When the brief names the agent's `<name>.report.md` in any other folder than the state folder, launch and queue warn on standard error and still proceed. A launch from the run's `<name>.queued.md` or `<name>.draft.md` removes that file once the agent or its hold process has started, since `<name>.prompt.md` then holds the brief. The footer is the tier's asset from its `## Rules` heading line, with relative links made absolute so they open from the prompt. `--allow fetch` and `--allow machine`, repeatable, append the `ki-delegation` grant section of each after the footer, in the order given: `fetch` lifts only the ban on a Git fetch, for a fast-forward or rebase pull with no push, and `machine` only the ban on the local machine changes the brief names. Name the scope each grant needs in the brief. `queue` carries the grants to the dispatcher. `ki` is the only writer of those files and never commits the thread home: commit it with the thread's other work.

The thread home is the owning repository's work folder `+/_WORK/<id>/` when the run's name is the slug of that work's id, the id with each `.` written as `-`, so `ki-ways-of-working` lives in `+/_WORK/ki.ways-of-working/`. Otherwise it is the thread-model `+/_THREADS/<run>/`, which still works through the work model's tolerance window. `ki agent home <run>` prints the home. To move a run into the work model, move its thread folder's contents into a work folder that holds `work.md`, then run `ki agent home <run> --work <id>`, which records the new home and moves no file. Every agent `ki` starts, Claude or Codex, through `launch` or `dispatch`, carries the run name in `KI_AGENT_RUN`, so a hook can tell a launched agent from an interactive session on either runtime.

Choose the model and reasoning effort with `--model <model>` and `--effort low|medium|high|xhigh|max`, for example `--runtime claude --model claude-fable-5-1 --effort high` or `--runtime codex --model gpt-6-astra --effort xhigh`. The model name passes through verbatim, and the runtime rejects an effort its model does not support. Omit either to keep the runtime's own default. `<name>.launch.json` records the runtime, model, effort and working directory the agent started with; `ki agent queue` carries both options through to the dispatcher.

Use `--wait-for <other>` when an agent must not start until another agent in the run writes `DONE`. The launcher holds the gate itself, so the agent's runtime cannot end its session while waiting:

- When every named agent has already written `DONE`, the agent starts at once.
- Otherwise `ki` writes the run packet, sets the status to `held until <names> finish`, and detaches a hold process that checks every 30 seconds and starts the agent once the gate opens. While held, `.pid` names the hold process, so status, watch and wait count the agent as running.
- When a named agent exits without `DONE`, the gate can never open: the launch is refused, or a held agent ends with the status `gate cannot open: <name> exited without DONE`, which in turn closes any gate waiting on it. Relaunch the failed agent under its name, then the agents behind it.

A name not yet launched keeps the gate waiting, so you may launch the dependent agent first. Parallel agents in one repository each need their own Git worktree as `<workdir>`.

## Launch in a worktree

Pass `--worktree <repo>` to `launch` or `queue` to start from that repository's committed HEAD in `<state>/agents/<run>/worktrees/<name>.<repo>`, on branch `run/<run>/<name>`. The launcher clones already installed dependencies and retains managed project skill links without installing anything. The launch record includes the source repository, branch, path and actual working directory. A held or queued agent creates its worktree when it starts.

`ki agent status <run>` and the run listing show each recorded worktree's ahead and behind counts, uncommitted count and last-commit age. A stopped agent's worktree is marked `stranded`. `ki agent status --worktrees` inventories all linked worktrees and non-default local branches in the registered estate, including stranded checkouts; unavailable Git facts stay unknown. This option takes no run name or `--all`.

`ki agent close` checks the same worktree directory that launch records. Integrate verified work under `ki-git` and remove the run's merged worktrees before closing. A failed preparation retains its stranded checkout for inspection.

## Recover event evidence

`events.jsonl` is the authoritative append-only event journal; `events.state.json` is its observation snapshot. Only a missing file counts as absent. An unreadable, malformed or inconsistent journal or snapshot refuses with `events-evidence-unverified`, preserving the journal and waiter cursor. A missing or stale snapshot replays terminal identities from the journal without repeating notifications.

Stop observers before repairing evidence, preserve byte-for-byte copies of the journal, snapshot, pending publications and cursors, and correct permissions or restore a verified backup. Do not truncate a corrupt journal or initialise empty replacement evidence. If the journal cannot be verified, retain the refusal for owner-assisted recovery. A verified journal can reconstruct a missing snapshot; preserve the old snapshot by renaming it before the next observation.

Launch observations are first persisted under `events.pending/` with immutable publication IDs. A busy event transaction leaves publication pending and still reports a started worker as started. The next `status`, `watch` or `wait` reconciles these records once, including an interrupted journal append. If a pending record cannot be written after start, the next observer reconstructs the launch from its confirmed control receipt. Preserve pending records during recovery.

`events.history` commits the journal's sequence count, SHA-256 digest and exact append intent before publication. Under `events.lock`, readers automatically append only the missing suffix when the existing journal is an exact byte prefix of the digest-verified checkpoint. This repairs empty or valid-prefix truncation and a partially appended last line without overwriting existing bytes; sequences never restart. An interrupted repair is retried by the next observer. Altered bytes, an invalid checkpoint or a cursor beyond the intended journal refuse with `events-evidence-unverified`. Preserve both copies for an explicit coordinator recovery decision on other mismatches. Older `ki/agent-events/v1` markers remain readable and acquire the checkpoint on their next verified append. A missing journal beside a marker, snapshot, advanced cursor or operation evidence refuses recovery. Control outcomes remain authoritative while publication is pending: receipts may omit `eventSequence`, and observers recover timeout and ownership-loss notifications with the original operation ID. Worker progress identity remains independent of the eventual terminal outcome.

A controller interrupted during preparation, before any spawn intent, has not crossed the process boundary. A subsequent `launch --relaunch` automatically journals a `preparation-not-started` retirement, preserves the old token and history, and allocates the replacement. Dispatch uses the same retirement proof before resuming an untouched frozen queue entry. Any spawn intent keeps its existing reconciliation fence. Abandoned transaction locks still require the verified offline recovery below. Foreground dispatch exits 1 for held ownership uncertainty or a post-start inspection failure, while retaining every confirmed start.

A dispatched legacy queue request is bound by its content digest to the durable spawn intent before the process starts. A confirmed start removes that request from the pending view even if the queue projection cannot be rewritten; an unconfirmed acknowledgement fences dispatch for explicit recovery. Neither case becomes a failed launch on retry. A refusal binds the same source digest to its durable event outbox before removal; a restarted dispatcher publishes that outbox before considering the old request again. Held-gate and queued refusals retain their reason in control evidence, so a failed event write is recovered without inventing a worker failure. Copied queue briefs are checked against their frozen source before a worker can start.

## Recover an abandoned lock

Both `control.lock` and `events.lock` are released by their own holder on SIGINT, SIGTERM and normal exit, only while the recorded holder token and bytes still match. A crash or an unverifiable release preserves the lock for the manual route below. No lock transfers ownership by age or PID.

Foreground launch and queue, held launches, dispatch, `watch` and `wait` bound each busy-lock wait at 120 seconds. An expired wait refuses with the holder's machine, PID, birth and token and this recovery route. If a held supervisor exits, crashes or is lost at restart, status shows `ownership-unverified` with its operation ID, observers publish one `blocked` event, and both wait forms end or return that event. The attempt is not counted as running and is never reported as a failed worker. Dependent gates close as blocked. After verifying that the old supervisor cannot start a worker, an explicit `launch --relaunch` can replace a dead acknowledged held attempt; an acknowledgement that cannot be verified remains fenced for `recover inspect`. A superseded held attempt retains its held history. Single-shot status uses the shorter acquisition bound.

`control.lock` serialises queue and launch changes; `events.lock` serialises event publication. A foreground control or observer refuses after bounded contention and names this recovery route. Neither lock is taken over because it is old or because a PID looks unused. New locks record the holder's machine, PID, process birth timestamp and random token. An exception releases the unchanged holder's lock; abrupt process termination can leave it behind.

Recovery is an explicit offline coordinator action under a cited owner decision. First prevent new invocations for this run and quiesce every dispatcher, held launcher and event observer that could contend for either lock. Verify those invocations have ended through their owning supervisors' exit acknowledgements; a quiet terminal, an old modification time or a failed PID lookup is insufficient. Do not signal workers or remove their containment fences to recover a lock.

Read and preserve the lock bytes. On the recorded machine, compare its process birth timestamp, executable and launch record with the operating system's process inventory and the owning supervisor's recorded exit. A reused PID belongs to a different birth identity and must never be signalled. Require positive evidence that the original holder has exited, together with verified quiescence of all contenders. If that evidence is unavailable, leave the lock in place. A verified machine restart after the recorded holder's birth is an alternative proof that the original holder has gone, provided no new run invocations have started. A legacy PID-only lock requires supervisor exit evidence or that verified restart, never a PID-only guess.

With exclusive local access established, re-read the lock and confirm its bytes and token still match the preserved copy. Rename it within the same run directory to an unused evidence name such as `control.lock.recovered-<token>` or `events.lock.recovered-<token>`; never overwrite or delete evidence. Record the owner decision, machine, holder identity, exit or restart proof, quiescence checks and preserved path in the recovery report. Then retry the refused command. If any identity, contender or file changes during verification, stop and repeat the inspection. This route moves only the abandoned exclusion file: it does not settle a spawn, clear a cancellation tombstone or authorise a replacement worker.

A `claim-unconfirmed` entry remains fenced on today's native adapters: they cannot prove `spawn-started` or `spawn-not-started`. Use `ki agent recover inspect <run> --operation <id>` to collect the frozen operation and evidence requirements, then bring the operation and local evidence to the owner. There is no supported command to clear that entry by assertion, deleting a lock, editing the queue or launching a replacement. Verified adapter evidence remains a separate enablement gate.

## Role-free compatibility

Role-free `launch` and `queue` still accept `--rules push|prune|release` without `--authority`, preserve explicit runtime, model, effort and grants, and label the selection `legacy`. Text launch and queue receipts add a `selection:` line with the effective values; JSON receipts retain their structured selection. A supplied `--authority` now requires a role, and `--acceptance` requires `--role accept`, so neither option is silently ignored.

A non-empty queue keeps the run live even without a dispatcher. A held attempt whose gate closes is rendered `failed`; its gate reason remains in the status file and event log. A dispatcher spawn failure whose outcome cannot be proved leaves the queue entry `claim-unconfirmed`, rather than dropping it as failed. The recovery limit above applies to these role-free entries too. Busy control transactions keep held launches and dispatchers pending for at most 120 seconds; bounded observer contention returns a refusal without taking another observer’s lock. Unreadable or missing control evidence fails closed without resetting history.

Managed scope checks also detect changed ownership while a PID still appears live. An unavailable control holder leaves its unfinished operation visible as `blocked`; a waiter returns that event or refuses with its operation ID. Neither observation takes over the holder's lock or clears a spawn fence. A later verified `DONE` and report remains a natural completion after a timeout or ownership warning. Before relaunch archives a packet, it publishes the old attempt's completion, queries or ownership loss once.

A confirmed launch with a packet inspection warning does not stop the dispatcher: it continues supervising that worker and considering the remaining queue. A failed queue projection or unavailable control or event evidence stops dispatch for inspection, with any confirmed start still reported correctly. Control receipts carry warnings if observation succeeded but secondary persistence or lock release needs inspection; retries retain the original operation identity.

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

## Use current decision entries

From v0.13.0, `ki agent decide` appends `## YYYY-MM-DD HH:MM zone - <title>` in local time, without allocating a decision number. Pass `--title <title>` to choose the title. Existing numbered entries stay readable and are not rewritten; every level-two heading in the decisions log now opens an entry, and close checks its home or class.

Update scripts that parse the old numbered output. For `ki agent reconcile <run> <entry> <home>`, quote the complete heading or a unique heading prefix; a bare number still selects an old `Decision <n>` entry. An ambiguous prefix fails without writing, so use more of the heading when two entries match. No log conversion is required.

## Close a run

Once every agent has finished and the thread has consolidated each decision into its durable home, retire the state folder:

```sh
ki agent close <run>
```

The reconcile gate prints one line per check and must pass whole: every agent finished with `DONE` or is named in `--accept-exited <name>`, no dispatcher is running, the queue and `worktrees/` are empty, every agent's temporary folder under `$TMPDIR/ki-agents/<run>/` is empty, every decision in the tracked log carries a `home:` that is a Git-tracked path or a roadmap record of a registered repository, except that an `operational` decision with no home is its own home and a `held` decision whose home is a `_CHECKPOINTS/` file passes once that file exists, tracked or not, and the thread folder is committed and clean. On any blocker it prints every line, exits 1 and changes nothing. Give an unhoused decision its home with `ki agent reconcile <run> <entry> <home>`, or waive the decision and temporary-folder checks with `--reconciled`, which the close note records. A draft in a temporary folder that must survive is homed first, as an uncommitted change named in the report or committed in its owning repository. Once the gate passes, close removes `$TMPDIR/ki-agents/<run>/` and prints an `ok` line for each agent folder removed.

When the gate passes the state folder moves to `$KI_STATE_HOME/agents/_archive/<run>/` with a `close.md` note of the gate and each decision's home. `--compress` writes `_archive/<run>.tar.gz` and `--delete` removes the folder instead, each leaving the note at `_archive/<run>.close.md`. For a run that predates the tracked home, `close` first moves any `decisions.md` or `<name>.report.md` left in the state folder into the thread folder and prints an `ok` line for each, so commit the folder and run `close` again; a copy the thread folder holds, or has ever held in Git, supersedes the state folder's, which is archived with the run.

## Sweep the agents directory

`_archive/` and the open state folders keep what they no longer need: closed runs nobody will open again, and briefs from before a launch removed its own copy. Preview what has outlived its use, then remove it:

```sh
ki agent sweep
ki agent sweep --write
```

The sweep keeps the ten most recently closed runs in `_archive/`, or `--keep <n>`, aged by each run's close note, and names every older run's folder, tarball and close note together. It also names each `<name>.queued.md` or `<name>.draft.md` beside a `<name>.prompt.md` at least as new, unless the name is queued again. Without `--write` it changes nothing; it never touches any other file.

A report the thread has retired from its folder stays retired: `decide` and `close` never move a state-folder file whose path Git knows, in the index or in any commit, and `launch`, `queue` and `new` never move files at all. The copy made on `DONE` happens once, when the attempt first ends, so a later `status`, `watch` or `wait` never redelivers a report the thread has swept. It likewise skips a report Git holds with the same contents under the work folder's present or any earlier name, followed through Git's rename history, so neither a lost snapshot nor a renamed work folder brings a retired report back or overwrites a newer committed version, while a relaunched agent's new report is still copied. Two cases fall outside that test: a shallow clone that lacks the commit, and a report that was never committed before it was deleted. Either brings the report back, untracked, while the state copy remains; delete it by hand.

## Recover

- **Already running:** `launch` refuses a name whose process is alive. Choose a new name or wait for it.
- **Already run:** names are unique within a run. `launch` and `queue` refuse a name whose packet or report already exists, naming the files and the first free `<name>-<n>`; use that name, or pass `--relaunch` to start the same agent again. A relaunch moves the earlier prompt, status, log, launch details and pid into `<name>.prev-<n>/` in the state folder and is refused until the thread-folder report is committed, so the earlier report survives in Git.
- **Missing assets:** update or relink the canonical Harness so its `ki-delegation` skill ships the run assets.
- **A queued launch failed:** the dispatcher logs `could not launch <name>` and moves on. Fix the cause and queue the agent again under a new name.
- **Not inside a Git repository:** `launch`, `queue`, `new` and `decide` need the thread home. Run from the owning repository or pass `--repo <dir>`.
- **No thread home yet:** a command run from a different repository than the launch's working directory, or on a run whose launches predate the recorded working directory, refuses to fix the home. Run it from the launch's working directory or pass `--repo <dir>` once; the recorded home holds from then on.
- **Close blocked:** read each `blocker:` line. Relaunch or accept an agent that exited without `DONE`, stop or finish the dispatcher, remove finished worktrees, house or reconcile each decision, and commit the thread folder.
