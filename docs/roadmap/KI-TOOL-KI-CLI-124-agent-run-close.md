---
id: KI-TOOL-KI-CLI-124
area: CLI
title: Agent run close
project: ways-of-working
component: agent
purpose: capability
kind: deliver
status: ready
horizon: next
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-13T21:37:16Z
updated_at: 2026-10-14T10:06:00Z
---

# Agent Run Close

## Goal

`ki agent` writes a run's decisions log and each agent's final report to a tracked `+/_THREADS/<thread>/` folder in the repository that owns the thread, and keeps only runtime material under `$KI_STATE_HOME/agents/<run>/`. `ki agent close <run>` then retires a finished run folder only once a reconcile gate passes: every decision in the thread's committed log has a durable home and no agent of the run is still running. When the gate fails the command reports each blocker and changes nothing. It archives by default and deletes only when an explicit flag asks it to, so a run folder never goes while anything durable exists only inside it.

## Context

Kris approved this work on 2026-10-13 in the `ways-of-working` thread, in the words "STATE-CLEANUP - Yes; queue after durability: ki agent close with reconcile gate, plus sweep of existing run folders." The retention rule it mechanises was set earlier the same day, when Kris folded run-folder retention into the existing standard rather than a new record: "run-folder retention (archive or delete the run folder once the thread or run closes and its decisions are consolidated into durable owners). No new record." It now stands in the `ki-delegation` background-run standard owned by `ki-agentic-harness`: "The run directory, decisions log included, is non-durable, machine-local working material under the XDG state root: it is not backed up or synced, and it is not a Decision Record. At each checkpoint update, and before a run or thread closes, consolidate every in-force decision into its durable owner - a Decision Record through `ki-decision-records`, a skill, or the thread's checkpoint. Nothing durable may exist only in the run directory." and "Once a thread or run has closed and its in-force decisions are consolidated into their durable owners, archive or delete its `~/.local/state/ki/agents/<run>/` folder; `ki agent` writes the run there."

Kris then settled where the log and the reports live, in words that reached the thread with stop words stripped, quoted as received: "DECISION-HOME - (b) tracked +/_THREADS/<thread>/ for the decisions log and agent reports; state folder keeps runtime only." Kris had already said why: "if the state folder is lost, you shouldn't lose any knowledge, or at least you should be able to recover from it.", and on citing decisions, "I actually think we should not necessarily need to put the decision number anywhere. It should be written about what the decision was or is." The `ki agent` change that writes to the new home is folded into this record rather than captured apart, because the close gate reads the log from wherever `ki agent` writes it. The `ki-delegation` standard's own wording follows in the harness's tracked thread decisions home record.

Today `ki agent` writes the whole run folder under the state root and never retires it: its subcommands are `launch`, `queue`, `dispatch`, `status`, `watch`, `wait`, `new` and `decide`. A run folder holds, per agent, `<name>.prompt.md`, `<name>.launch.json`, `<name>.pid`, `<name>.status`, `<name>.log` and `<name>.report.md`, and per run `decisions.md`, `queue.jsonl`, `seen`, `dispatch.pid`, `dispatch.log` and `worktrees/`, beside whatever scratch an agent leaves. `ki cleanup` reports eligible stale state but knows nothing of runs.

A read-only inventory of the machine's run folders on 2026-10-13 found 25 folders, 4 with an agent still running, every one with a `decisions.md` holding between 1 and 153 decisions, 3 with an empty `worktrees/` directory, and 5 holding over 18 MB of agent scratch, the largest 851 MB. Most of those decisions were consolidated by hand, if at all, so the gate must be able to tell which decisions still have no home before any folder goes. The inventory is machine-local working material and is not committed.

On 2026-10-14 Kris read a numbered citation in a thread summary and said, as relayed by the master thread: "has no meaning to me because I don't know what the decision was ... and I don't know where the list is. I thought we'd looked at changing the way that decisions were recorded like this so that they became durable knowledge." The master thread's relay keeps this record with its owner: "tools-ki launcher change and ki-principal run-folder sweep stay with their owners as handoffs named in the plan." Kris then placed the subject: "everything to do with the decisions log belongs to ways-of-working", so that thread plans this record and `tools-ki` delivers it.

## Boundary

- In scope: `ki agent` writing `decisions.md` and each `<name>.report.md` under the owning repository's `+/_THREADS/<thread>/` instead of the state folder, with `decide` appending to the tracked log and the state folder keeping `<name>.prompt.md`, `<name>.launch.json`, `<name>.pid`, `<name>.status`, `<name>.log`, `queue.jsonl`, `seen`, `dispatch.*` and `worktrees/`; how `ki agent` learns the owning repository and thread for a run; `ki agent close <run>` and its reconcile gate; the blocker report; archive as the default action and delete behind an explicit flag; how a decision records its durable home so the gate can check it; tests through `run(args, context)` and `sandbox()`; the README's `ki agent` section and the background-agents guide.
- Out of scope: consolidating decisions into their homes, which stays the coordinating thread's duty under the standard; the one-off sweep of the 25 existing folders, which the inventory proposes folder by folder and the owner performs or delegates once `close` exists; worktree removal, which each agent owes before `DONE`; the wording of the background-run standard, which the harness owns; any scheduled or automatic close.
- No run folder is read beyond its packet files, and no agent report content is sent anywhere.

## Current state

Grounded on 2026-10-14 at `tools-ki` `b5a669d`, with installed `ki` 0.10.1:

- `src/commands/agent/index.ts` registers `launch`, `queue`, `dispatch`, `status`, `watch`, `wait`, `new` and `decide` on commander and builds an `AgentContext` from the state directory, the harness directory, the working directory, the environment, the launcher, the process adapter and the clock. `decide` takes `--log <path>` and prints `Decision N recorded in <path>`.
- `src/core/agent/runs.ts` (532 lines) resolves every run file from `runDirectory`, which joins the state directory, `agents` and the run name. `newPrompt` fills the `ki-delegation` skeleton's `<decisions log path>` with the state folder's `decisions.md`. `recordDecision` appends `## Decision N (YYYY-MM-DD)` with the next number and the day; it carries no time of day and no field for a durable home. `composePrompt` tells the agent to write `<name>.report.md` beside its status file in the state folder. `agentState` reads `finished` from a trailing `DONE`, `running` from a live pid and `exited` otherwise; `waitForRun`'s gate already reports `<name> exited without DONE`, so the close gate can reuse `agentState`, `pidOf` and `running`.
- The state folder is the only home: nothing under `src/core/agent/` knows a repository, a checkpoint or `+/_THREADS/`. `src/core/agent/runtimes.ts` sets the `KI_AGENT_RUN` marker; `src/core/agent/processes.ts` spawns and probes processes. `src/commands/manage/cleanup.ts` reports managed stale state and knows nothing of runs; it stays that way under this record.
- `src/tests/cli/agent.test.ts` (682 lines) drives every subcommand through `run(args, context)` in a `sandbox()` from `src/tests/cli/_cli_helper.ts`, with a fake process adapter, so a close gate and a tracked home are testable without a live agent or a real repository beyond a temporary directory with `git init`.
- Documentation naming the run packet: `README.md` lines 123 to 131, the `Background agents` section of `man/ki.1` from line 379, `docs/guides/user/background-agents.md` (Before start, Record authority and write prompt, Launch one agent, Keep queue moving, Check on run, Recover) and the `Pre-1.0 baseline` command surface in `CHANGELOG.md`.
- `+/_THREADS/` is tracked by default in this repository, the harness and Knowledge Islands Principal: the managed ignore block names only `+/README.md`, `+/_BATCHES`, `+/_CHECKPOINTS` and `+/_TRADES`, so no ignore change is needed.

## Steps

- [ ] Thread home. At first `launch`, `queue`, `new` or `decide` for a run, resolve the owning repository as the Git top level of the working directory, or of `--repo <dir>` when given, and write `thread.json` in the state folder with the repository path and the folder `+/_THREADS/<run>/`; later commands read it, and a mismatch with an explicit `--repo` is an error. Refuse when the working directory is not inside a Git repository.
- [ ] Tracked knowledge files. `recordDecision` appends to `<repo>/+/_THREADS/<run>/decisions.md` by default, with `--log` still overriding; each entry becomes `## Decision N (<RFC 3339 UTC seconds>)` and an optional `home: <path or record id>` line from `decide --home`. `newPrompt` fills `<decisions log path>` with the tracked path. `composePrompt` names `<repo>/+/_THREADS/<run>/<name>.report.md` as the report path, and `launch` passes the repository with `--add-dir` so the agent may write it. `status`, `watch` and `wait` keep reading `<name>.status` from the state folder.
- [ ] `ki agent reconcile <run> <number> <home>`. Writes or replaces the `home:` line of one entry in the tracked log, so decisions taken before this change can be given a home before close.
- [ ] `ki agent close <run> [--delete] [--compress] [--accept-exited <name>...] [--reconciled]`. Gate, each line printed as `ok` or as a blocker: no agent pid alive; every agent ended `DONE` or is named in `--accept-exited`; `dispatch.pid` not alive and `queue.jsonl` empty or absent; `worktrees/` empty or absent; every entry in the tracked log carries a `home:` whose path exists in the repository and is Git-tracked, or whose identifier matches a roadmap record found through the registry, unless `--reconciled` waives the decision lines; the tracked folder is committed and clean. On any blocker exit 1 and change nothing. On success move the state folder to `$KI_STATE_HOME/agents/_archive/<run>/`, or write `_archive/<run>.tar.gz` with `--compress`, or remove it with `--delete`, and write `close.md` in the archive, or beside the tarball, naming the date, each gate line and each decision's home; with `--reconciled` the note says the owner waived the decision gate.
- [ ] Tests in `src/tests/cli/agent.test.ts` for: the thread home written at first use and refused outside a repository; `decide` appending to the tracked log with a timestamp and `home:`; `reconcile` replacing a home; the prompt skeleton and composed prompt naming the tracked paths; `close` blocking on each gate line, passing in the sandbox and archiving, compressing and deleting; `--reconciled` recorded in `close.md`.
- [ ] Documentation: the `README.md` `ki agent` section, `man/ki.1` `Background agents`, `docs/guides/user/background-agents.md` (which files live where, `decide --home`, `reconcile`, `close`) and the `Pre-1.0 baseline` command surface in `CHANGELOG.md`.
- [ ] Deliver as two Conventional Commits so the harness wording can land between them: `feat(agent): write the decisions log and reports to the tracked thread folder` (thread home, tracked files, timestamps, `--home`, `reconcile`) and `feat(agent): add close with a reconcile gate`.

## Files touched

- `src/commands/agent/index.ts`
- `src/core/agent/runs.ts`
- `src/tests/cli/agent.test.ts`
- `README.md`
- `man/ki.1`
- `docs/guides/user/background-agents.md`
- `CHANGELOG.md`

## Verify

- `bun run test` passes with the new `agent.test.ts` cases.
- `bunx tsc --noEmit` passes.
- `ki repo audit --skill ki-engineering` and `ki repo audit --skill ki-work-roadmap` report no failure.
- From a temporary Git repository: `ki agent new t a` fills the skeleton with `+/_THREADS/t/decisions.md`; `ki agent decide t "text" --home docs/x.md` appends an entry with a seconds timestamp and a `home:` line; `ki agent close t` reports the untracked home as a blocker and exits 1; after committing `docs/x.md` and the thread folder, `ki agent close t` prints every line `ok` and `$KI_STATE_HOME/agents/_archive/t/close.md` exists.
- `ki agent close` against this machine's `ways-of-working` run, taken read-only by omitting any archive flag and expecting blockers, prints a blocker line for each decision without a home and changes nothing.

## Dependencies / blocks

- `blocked_by` is empty: nothing in this repository is missing. [KI-TOOL-KI-CLI-123](KI-TOOL-KI-CLI-123-agent-run-events.md) touches the same module for events and is independent; whichever lands second rebases.
- The `ki-delegation` background-run standard in `ki-agentic-harness` is being reworded to name `+/_THREADS/<run>/` as the home of the log and the reports and to describe decisions in the owner's words rather than by number. Kris said of a numbered citation on 2026-10-14: "has no meaning to me because I don't know what the decision was ... and I don't know where the list is." That wording describes what this record builds and can land before or after the first commit here; the second commit, `close`, is only useful once threads write to the tracked folder, which the first commit makes `ki agent` do. Durable documentation: the standard at `skills/governance/ki-delegation/references/standards-background-runs.md` in the harness.
- Knowledge Islands Principal's sweep of the existing run folders waits for `close`; Kris queued it "after durability: ki agent close with reconcile gate, plus sweep of existing run folders." This record does not perform that sweep.
- The installed `ki` must be released or linked from this change before any thread uses the tracked home mechanically; until then threads copy by hand as the standard will say.

## Delegation

One detached background agent under `ki-delegation` in a worktree under its run folder, briefed with this record, the standard's new wording when it has landed, and `ki-engineering`. Deliverable: the two commits above, each passing the Verify gates, pushed fast-forward under the thread's standing push permission, with the temporary-repository transcript in its report. Gate between rounds: the `ways-of-working` thread reads the first commit's report before the agent starts `close`, because the tracked home shape is what the gate reads. Kris accepts through `ki-accept`.

## Documentation impact

### Decision Records

None. The retention rule and the tracked home are owned by the `ki-delegation` standard; this record mechanises them.

### Specifications

None. `tools-ki` publishes its command surface in the changelog baseline and the man page, both updated here.

### Guides

`docs/guides/user/background-agents.md` gains the tracked home, `decide --home`, `reconcile` and `close`; `README.md` and `man/ki.1` name the new subcommands and options.

### Roadmap

No follow-on record. A `ki cleanup` listing of closable runs is noted in Discussion and not opened, under the standing instruction to create no new feature records.

## Discussion

### What the gate checks

Options for the gate, each a superset of the one before:

- (a) Process gate only: no agent `.pid` is alive, `dispatch.pid` is not alive and `queue.jsonl` is empty. Decisions are the owner's problem. Rejected alone: it is the half of the rule the standard already states for agents, and it would let a log of unconsolidated decisions go.
- (b) Process gate plus decision gate: (a) and every entry in the thread's committed `decisions.md` names a durable home that resolves, and the tracked log and reports are committed, not dirty. A run without a decisions log passes the decision gate trivially.
- (c) Full close gate: (b) and every agent ended `DONE` or is explicitly acknowledged with `--accept-exited`, `worktrees/` is empty, and no `+/_CHECKPOINTS/` file of a registered Capital names the run as its open thread.

Recommendation: (c), with (b) as the minimum that may ship first. An agent that exited without `DONE` has a report the coordinator may not have read, and a live checkpoint means the thread is still open and the log is still its working copy.

How the decision gate knows a home exists, options:

- (i) Each log entry carries a `home:` line naming a committed path or a work-record identifier, written by `ki agent decide --home <path-or-id>` at decision time or by a new `ki agent reconcile <run> <number> <home>` afterwards; the gate resolves the path through the registry and checks it is Git-tracked and that the record exists. Mechanical and honest: an entry without a home is a blocker by name and number.
- (ii) The gate searches the territory's repositories for each decision's words. Rejected: a paraphrase in a record is a legitimate home that a text search cannot see, and the search reads every repository for every close.
- (iii) An owner attestation flag, `--reconciled`, that waives the decision gate. Rejected as the only mechanism, because it makes the gate a formality; acceptable as an override that the blocker report records.

Recommendation: (i), with (iii) as a named override that the archive note records.

### Archive against delete, and where archives go

- (a) Default archive moves the folder to `$KI_STATE_HOME/agents/_archive/<run>/` and writes a `close.md` beside it naming the gate result, the date and where each decision went; `ki agent status` and `wait` no longer see it; `--delete` removes the folder instead. Cheap, reversible for as long as the owner likes, and still non-durable state that `ki cleanup` can later report by age.
- (b) Default archive compresses to `$KI_STATE_HOME/agents/_archive/<run>.tar.gz`. Recovers space from scratch-heavy runs such as the 851 MB one, at the cost of a less inspectable archive; could be `--compress` on (a).
- (c) Archive outside the state root, for example under `$XDG_DATA_HOME/ki/`, because state is "not backed up or synced". Rejected: the standard says nothing durable may exist only in the run directory, so an archive preserves nothing that must survive the machine, and a different root invites treating it as durable.
- (d) Delete only, no archive, behind `--delete`. Rejected as the default because the sweep of existing folders is the first use and a mistaken close should be recoverable without Git.

Recommendation: (a), with (b) as an option on it, and `--delete` for removal. Scratch left by agents, such as extracted JSON or working copies, is archived with the folder and never inspected.

### The blocker report

When the gate fails the command exits non-zero and prints one line per blocker: an agent still running with its pid; an agent that exited without `DONE`; the dispatcher alive or the queue non-empty; a decision by number with no home, or a home that does not resolve; a non-empty `worktrees/`; and each checkpoint file that still names the run. The same lines, prefixed `ok`, come back on success before the archive line, so a close is auditable from its output.

### Open questions

Settled at planning on 2026-10-14:

- The owning repository is the Git top level of the checkout the first `ki agent` command for the run is issued from, or `--repo <dir>`, recorded in the state folder's `thread.json`; the thread folder takes the run's name. A `--thread <repo>:<name>` form is not needed, since the coordinating thread launches from its own checkout.
- `ki agent` writes the tracked files and never commits them; the coordinating thread commits at each mark, when a report lands and before close, as the standard says, and the close gate refuses a dirty or uncommitted thread folder. `ki agent` runs no Git write operation today and this record keeps that property.
- The checkpoint check is not in the gate: master checkpoints mention run names in passing, so the signal is unreliable. The committed-and-clean check on the thread folder, and the owner's act of running `close`, stand in for it.
- `ki cleanup` does not list closable runs under this record; the idea is kept here and opens no record.
- `decide --home` and `reconcile` land in the first commit, ahead of `close`, so decisions taken from then on carry a home and the sweep has somewhere to write.

Still open, for Kris:

- None.

### Adoption

On 14 October 2026 Kris approved the state-of-play thread's triage burn-down as written, under Kris's instruction to burn the roadmap down: adopted as `deliver / Next`. Kris approved it in STATE-CLEANUP ("Yes; queue after durability"). It is the mechanism behind the harness's tracked thread decisions home, and it should land after that standard is settled. Adoption grants no planning, implementation or acceptance authority.

### Approval

On 2026-10-14 Kris approved the plan as it stands, in these words: "approve KI-TOOL-KI-CLI-124". The `ways-of-working` thread delivers it under `ki-implement` through one detached background agent, as Delegation says. The harness wording this record depends on landed the same day: the `ki-delegation` background-run standard now places the decisions log and each agent's report in the owning repository's tracked `+/_THREADS/<run>/` folder and says `ki agent` writes them there "once `tools-ki` ships that change". Kris's standing instruction for any further `tools-ki` release is to ask first, so delivery stops at merged and pushed.
