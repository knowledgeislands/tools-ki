---
id: KI-TOOL-KI-CLI-124
area: CLI
title: Agent run close
project: ways-of-working
component: agent
kind: deliver
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-13T21:37:16Z
updated_at: 2026-10-13T23:20:00Z
---

# Agent Run Close

## Goal

`ki agent` writes a run's decisions log and each agent's final report to a tracked `+/_THREADS/<thread>/` folder in the repository that owns the thread, and keeps only runtime material under `$KI_STATE_HOME/agents/<run>/`. `ki agent close <run>` then retires a finished run folder only once a reconcile gate passes: every decision in the thread's committed log has a durable home and no agent of the run is still running. When the gate fails the command reports each blocker and changes nothing. It archives by default and deletes only when an explicit flag asks it to, so a run folder never goes while anything durable exists only inside it.

## Context

Kris approved this work on 2026-10-13 in the `ways-of-working` thread, in the words "STATE-CLEANUP - Yes; queue after durability: ki agent close with reconcile gate, plus sweep of existing run folders." The retention rule it mechanises was set earlier the same day, when Kris folded run-folder retention into the existing standard rather than a new record: "run-folder retention (archive or delete the run folder once the thread or run closes and its decisions are consolidated into durable owners). No new record." It now stands in the `ki-delegation` background-run standard owned by `ki-agentic-harness`: "The run directory, decisions log included, is non-durable, machine-local working material under the XDG state root: it is not backed up or synced, and it is not a Decision Record. At each checkpoint update, and before a run or thread closes, consolidate every in-force decision into its durable owner - a Decision Record through `ki-decision-records`, a skill, or the thread's checkpoint. Nothing durable may exist only in the run directory." and "Once a thread or run has closed and its in-force decisions are consolidated into their durable owners, archive or delete its `~/.local/state/ki/agents/<run>/` folder; `ki agent` writes the run there."

Kris then settled where the log and the reports live, in words that reached the thread with stop words stripped, quoted as received: "DECISION-HOME - (b) tracked +/_THREADS/<thread>/ for decisions log and agent reports; state folder keeps runtime only." Kris had already said why: "if the state folder is lost, you shouldn't lose any knowledge, or at least you should be able to recover from it", and on citing decisions, "I actually think we should not necessarily need to put the decision number anywhere. It should be written about what the decision was or is." The `ki agent` change that writes to the new home is folded into this record rather than captured apart, because the close gate reads the log from wherever `ki agent` writes it. The `ki-delegation` standard's own wording follows in the harness's tracked thread decisions home record.

Today `ki agent` writes the whole run folder under the state root and never retires it: its subcommands are `launch`, `queue`, `dispatch`, `status`, `watch`, `wait`, `new` and `decide`. A run folder holds, per agent, `<name>.prompt.md`, `<name>.launch.json`, `<name>.pid`, `<name>.status`, `<name>.log` and `<name>.report.md`, and per run `decisions.md`, `queue.jsonl`, `seen`, `dispatch.pid`, `dispatch.log` and `worktrees/`, beside whatever scratch an agent leaves. `ki cleanup` reports eligible stale state but knows nothing of runs.

A read-only inventory of the machine's run folders on 2026-10-13 found 25 folders, 4 with an agent still running, every one with a `decisions.md` holding between 1 and 153 decisions, 3 with an empty `worktrees/` directory, and 5 holding over 18 MB of agent scratch, the largest 851 MB. Most of those decisions were consolidated by hand, if at all, so the gate must be able to tell which decisions still have no home before any folder goes. The inventory is machine-local working material and is not committed.

## Boundary

- In scope: `ki agent` writing `decisions.md` and each `<name>.report.md` under the owning repository's `+/_THREADS/<thread>/` instead of the state folder, with `decide` appending to the tracked log and the state folder keeping `<name>.prompt.md`, `<name>.launch.json`, `<name>.pid`, `<name>.status`, `<name>.log`, `queue.jsonl`, `seen`, `dispatch.*` and `worktrees/`; how `ki agent` learns the owning repository and thread for a run; `ki agent close <run>` and its reconcile gate; the blocker report; archive as the default action and delete behind an explicit flag; how a decision records its durable home so the gate can check it; tests through `run(args, context)` and `sandbox()`; the README's `ki agent` section and the background-agents guide.
- Out of scope: consolidating decisions into their homes, which stays the coordinating thread's duty under the standard; the one-off sweep of the 25 existing folders, which the inventory proposes folder by folder and the owner performs or delegates once `close` exists; worktree removal, which each agent owes before `DONE`; the wording of the background-run standard, which the harness owns; any scheduled or automatic close.
- No run folder is read beyond its packet files, and no agent report content is sent anywhere.

## Dependencies / blocks

- The home of the decisions log is settled: Kris chose the tracked `+/_THREADS/<thread>/` folder in the owning repository, so the gate reads the committed log there rather than a file under the state root, and the state folder's own `decisions.md` is a runtime copy at most. The alternative Kris did not take, consolidating each entry of a state-local log into a home at every mark, would have had the gate check that each log entry names a home; with the log in Git the gate still checks that each in-force decision has a durable owner, but the log itself no longer needs rescuing before the folder goes. Durable documentation of the retention rule: [the background-run standard](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/governance/ki-delegation/references/standards-background-runs.md). The report itself is design working material in the [ways-of-working](https://github.com/knowledgeislands/ki-principal/blob/main/Streams/Projects/ways-of-working/ways-of-working.md) Project of Knowledge Islands Principal and is slated for deletion once consolidated, which is why its options are quoted here.
- `ki-agentic-harness` owns the `ki-delegation` standard and holds the record that rewrites its run-packet table, decisions-log section and run-close rule for the tracked home. If the gate needs a decision entry to carry its home, as proposed below, the standard's Decisions log section and `ki agent decide` change together; the mechanics can land first and the wording follow.

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

- How a run names its owning repository and thread, so that `ki agent launch` knows where `+/_THREADS/<thread>/` is: a `--thread <repo>:<name>` option, the checkout the launch runs from, or the checkpoint that opened the thread.
- Whether `ki agent` commits the tracked log and report itself at each decision and report, or leaves committing to the coordinating thread, which the standard says commits at each mark, when a report lands and before close.
- Whether the checkpoint check belongs in the gate at all, since master `_state-of-play.md` checkpoints mention many run names in passing; a match on the thread checkpoint's own name may be the only reliable signal.
- Whether `ki cleanup` should list runs that would pass the gate, so the owner sees closable runs without trying each.
- Whether `ki agent decide --home` lands ahead of `close`, so that decisions taken from now on carry a home and the sweep's reconcile step has somewhere to write.
