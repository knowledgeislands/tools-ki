---
id: KI-TOOL-KI-CLI-123
area: CLI
title: Agent run events
project: ways-of-working
component: agent
kind: deliver
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-13T13:53:24Z
updated_at: 2026-10-16T01:24:28Z
---

# Agent Run Events

## Goal

`ki agent` derives an append-only events log from each run packet, and `ki agent wait --next` and `ki agent watch` return failed, blocked and needs-owner events as well as finishes, in the order they happened, so that a coordinating thread learns at its next turn what needs the owner without reading every report. Agents keep writing their status line and report as they do now and call no channel.

## Context

Knowledge Islands Principal owns the notification strategy for delegated work, record `KI-PRINCIPAL-ECO-012` in its Streams roadmap under the [ways-of-working](https://github.com/knowledgeislands/ki-principal/blob/main/Streams/Projects/ways-of-working/ways-of-working.md) Project. Kris adopted the strategy on 2026-10-13, in his words "ADOPT adopt KI-PRINCIPAL-ECO-012 to draft through ki-next; hand phase 1 to tools-ki and the harness now", with the home decision "HOME (a) keep KI-PRINCIPAL-ECO-012 in ki-principal; hand deliveries to each repository": the strategy stays in the Capital and each delivery is handed to the repository that owns it. This record is the phase 1 handoff for the mechanics; the sibling handoff for the `ki-delegation` vocabulary and progress-protocol wording is in `ki-agentic-harness`, record `KI-HARNESS-GOV-175`. Kris adopted both handoffs on 2026-10-13: "RECV-ADOPT - Adopt KI-TOOL-KI-CLI-123 and KI-HARNESS-GOV-175 draft next deliver; tools-ki first." This record therefore comes first in order and the harness record follows it. `tools-ki` owns this record's priority, plan and acceptance.

Today the run packet under `$KI_STATE_HOME/agents/<run>/` carries, per agent, a one-line status file, a log, a report and the `DONE` marker, and `wait --next` marks agents seen by name in the run's `seen` file. There is no event log and no delivery receipt. Phase 1 is the strategy's smallest useful step: events derived from the packet and surfaced through the thread channel, with no integration, so the interim chat-only preference stands and becomes event-based.

The run that produced the strategy also showed that the waiter's order is wrong. Twice on 2026-10-13 `ki agent wait --next ways-of-working` returned an older finish rather than the newest: at 09:53 it returned `merge`, which had finished at 04:52, although `notify` and `report-format` had finished at 09:25 and 09:32, and `review-fable` and `review-astra`, finished at 04:20 and 04:31, were never returned at all. The cause is in `src/core/agent/runs.ts`: `waitForRun` iterates the run's agents in alphabetical name order and returns the first unseen one that is not running, so finish time plays no part in the choice. A sequenced events log removes the defect, so the fix is a phase 1 requirement rather than a separate corrective record.

## Boundary

- In scope: the events log and its derivation from the packet; `wait --next` and `watch` returning `failed`, `blocked` and `needs-owner` events in sequence; the milestone status line as the source of `progress`; the seen marker keyed by event; tests for derivation, order and the two commands.
- Out of scope: the notifier, channel adapters, delivery receipts, quiet hours, Telegram, Slack, the Observatory, `notify.toml` and the launchd agent, which are phases 2 to 4 of the strategy and each a later record; any inbound reply path; the wording of the `ki-delegation` standard, which the harness owns.
- No channel is called and no secret is read.

## Requirements

1. An append-only `events.jsonl` per run, derived from what the launcher already observes: launch, hold, a gate that fails to open, a status line in the milestone form, `DONE`, an exit without `DONE`, and the report's failure and outstanding-query content. Each event has a stable identity of run, agent, kind and sequence.
2. Five event kinds and the run-level close: `progress` (a milestone line only), `done` (`DONE` written and the report present), `failed` (an exit without `DONE`, or a report that says the work failed), `blocked` (a gate that cannot open, a held agent whose predecessor failed, or a status line that says blocked), `needs-owner` (one per outstanding-query tag in a report) and `all finished`.
3. `wait --next` returns the next unseen event in sequence order, never the next unseen agent in name order, and keys the seen marker by event identity; `watch` prints the same events as they appear and still ends `ALL FINISHED`.
4. The milestone line form `HH:MM TZ - milestone: <text>` is added to the progress protocol the launcher appends, in the wording the harness adopts; every other status line stays local and produces no event.
5. Duplicate suppression at the source: a tag is one `needs-owner` event until its wording changes, an unchanged status line is never re-emitted, and relaunching an agent of the same name starts a new sequence.

## Current state

Read at `a57617f0` on 16 October 2026.

- `waitForRun` (`src/core/agent/runs.ts:491`) still loops over `agents(directory)` in name order and returns the first unseen agent that is not running, appending its name to the run's `seen` file; the ordering defect in the Context is unchanged. `watchRun` (`runs.ts:365`) prints one `summary` line per interval and ends `ALL FINISHED`. There is no `events.jsonl`.
- The launcher's progress protocol (`composePrompt`, `runs.ts:166`) asks for `HH:MM <zone> - what you are doing` and `DONE`; it has no milestone, blocked or failed form.
- **The owner report changed shape again on 14 October 2026.** The `ki-pmo` owner-report standard (`ki-agentic-harness` `origin/main`) now has `## Done`, `## In Progress` and `## Queries`, each query headed `### <TAG> - <title>` with **Context**, **Query** and **Options**, and a reply block reading `No reply needed.` when there are none; reports written before then keep `## Outstanding queries` with `<TAG> - <title>` headings, and readers accept both. Material failures sit in prose under `## Done`, so a report gives no parseable failure signal.
- [KI-HARNESS-GOV-175](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-175-delegation-run-events.md) is still a draft waiting for this record, as Kris ordered ("tools-ki first").

## Decision

1. **Derived on observation, under a lock.** Launch, hold and gate-closed events are appended by the launcher when they happen. Everything else is derived by one `deriveEvents(directory)` that `wait`, `watch` and `status` call before reading: it compares each agent's status file, pid and report with a snapshot in `events.state.json` and appends what changed. An exclusive `events.lock` (created with `wx`, removed after, stale after 30 seconds) keeps two observers from appending twice. No daemon is added.
2. **Order.** The sequence is the line number in `events.jsonl`. Events found in one derivation pass are appended in the order of the source file's modification time, then name, so a pass that finds three finishes records them in the order they finished.
3. **Fixed status-line forms.** Besides `milestone:`, the protocol offers `HH:MM TZ - blocked: <text>` and `HH:MM TZ - failed: <text>`. `blocked` and `failed` come only from these forms, from a gate, or from an exit without `DONE`; free text is never parsed, which settles the second open question. `done` needs `DONE` and the report; `DONE` with no report is `failed` ("no report").
4. **`needs-owner`** comes from `### <TAG> - <title>` headings under `## Queries`, and from `<TAG> - <title>` headings under `## Outstanding queries` in older reports. The key is agent, tag and title, so a changed title emits a new event and an unchanged one never repeats.
5. **Seen cursor.** `wait --next` stores the last returned sequence number in `events.seen` and returns the next event of kind `done`, `failed`, `blocked` or `needs-owner`, or `all finished`. `progress`, `launch` and `held` stay visible in `watch` and the log. The per-run cursor stays and a passed cursor for two coordinators is out of scope, which settles the third open question. The old name-keyed `seen` file is no longer read: a run in flight at upgrade returns its earlier finishes once more, with no compatibility path.
6. **`watch`** prints each new event on its own line, `HH:MM TZ | <agent> <kind>: <text>`, before that interval's status line, and still ends `ALL FINISHED`, which settles the first open question.
7. **Relaunch.** Each event carries `attempt`, which is one more than the agent's `<name>.prev-<n>` folders from [KI-TOOL-KI-CLI-135](KI-TOOL-KI-CLI-135-reused-agent-name-overwrites.md), or 1 before that lands. The snapshot resets per attempt, so a relaunch starts a new sequence of its own events.
8. **Event shape.** One JSON object per line: `{"seq", "at", "run", "agent", "attempt", "kind", "text"}`, plus `tag` for `needs-owner`; `at` is UTC ISO. It carries only what the packet already holds, and no report body beyond a heading.

## Steps

- [ ] Add `src/core/agent/events.ts` with the `RunEvent` type, `appendEvent`, the lock, `deriveEvents` (Decisions 1 to 4, 7 and 8), report heading parsing for both shapes, and `readEvents(directory, after)`.
- [ ] `runs.ts`: append `launch` in `launchAgent`, `held` when a launch is held, and `blocked` when a gate closes; add the milestone, blocked and failed forms to `composePrompt`'s protocol.
- [ ] Rewrite `waitForRun` over `deriveEvents` and the `events.seen` cursor (Decision 5); `wait` without `--next` still waits for the whole run.
- [ ] Rewrite `watchRun` to print new events before each interval's line (Decision 6); call `deriveEvents` in `runStatus`.
- [ ] `src/commands/agent/index.ts`: update the `wait --next` and `watch` descriptions.
- [ ] Contract tests in `src/tests/cli/agent.test.ts` (see Verify); add `src/tests/cli/agent-events.test.ts` if the file grows past the repository's size norm.
- [ ] `README.md` `ki agent` section, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

`src/core/agent/events.ts` (new), `runs.ts`; `src/commands/agent/index.ts`; `src/tests/cli/agent.test.ts` (and possibly `agent-events.test.ts`); `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. **Order regression (the 13 October defect):** with agents `merge`, `notify` and `review-astra` finishing in the order `notify`, `review-astra`, `merge` (status files with ascending modification times) before the first `wait --next`, three calls return `notify`, `review-astra` and `merge` in that order, then `ALL FINISHED`.
2. A report with `### HOOK-FIX - Fix the hook` and `### TMP-HOME - Choose the root` under `## Queries` gives two `needs-owner` events after `done`; a second derivation adds none; a changed title adds one; an older report with `## Outstanding queries` and `HOOK-FIX - ...` gives the same tag.
3. `HH:MM TZ - milestone: built` gives one `progress` event; a repeat gives none; an ordinary status line gives none. `blocked:` and `failed:` lines give `blocked` and `failed`.
4. Exit without `DONE` gives `failed`; `DONE` with no report gives `failed` ("no report"); a held agent whose gate closes gives `blocked`.
5. Two `deriveEvents` calls racing on one run append each event once; a stale lock older than 30 seconds is taken over.
6. `watch` prints event lines before the interval's status line and ends `ALL FINISHED`; `wait --next` never returns `progress`.
7. An agent relaunched under the same name has events with `attempt: 2` that do not repeat attempt 1's.
8. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- None blocking. [KI-HARNESS-GOV-175](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-175-delegation-run-events.md) follows this record and writes the standard's wording against these mechanics. The three status-line forms in Decision 3 are this record's proposal for that wording.
- Decision 7 reads [KI-TOOL-KI-CLI-135](KI-TOOL-KI-CLI-135-reused-agent-name-overwrites.md)'s `<name>.prev-<n>` folders. Deliver KI-TOOL-KI-CLI-135 first; if it has not landed, `attempt` is 1 throughout.
- Shares `src/core/agent/runs.ts` with KI-TOOL-KI-CLI-134, KI-TOOL-KI-CLI-135 and KI-TOOL-KI-CLI-137.

## Documentation impact

### Decision Records

None. The event vocabulary follows KI-PRINCIPAL-ECO-012's adopted strategy, and the harness standard owns its wording.

### Specifications

None. `events.jsonl` is a machine-local state file, not a published contract.

### Guides

`README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`: the events log, the three status-line forms, and the new `wait --next` and `watch` behaviour.

### Roadmap

Phases 2 to 4 of the notification strategy are later records in their owning repositories; this record adds none of them.

## Discussion

### Derive events rather than change the agent contract

Deriving events from the packet keeps every existing prompt valid: an agent's duties remain the status line, the report and `DONE`. The only addition an agent may make is the milestone line, and an agent that never writes one still produces `done`, `failed`, `blocked` and `needs-owner` events from what it already writes. The alternative, agents emitting events themselves, would put a channel in every prompt and make the coordinator's view depend on each agent remembering to do so.

### Detecting failure and outstanding queries in the report

The strategy was written against the earlier report shape with a Failed section and a Needs section. The owner report that replaced it on 2026-10-13, in Kris's words "standardise owner reports through the ways-of-working process. Three sections in order: 1 What has been done (outcomes, material failures, corrections, limitations); 2 What is in progress ...; 3 Outstanding queries, each headed '<stable tag> - <plain title>'", puts material failures inside "What has been done" and gives each outstanding query its own heading `<tag> - <title>` under "Outstanding queries". `needs-owner` therefore derives from those headings; `failed` needs either a parseable signal in the report or the agent's final status line, and the exact rule is settled in planning alongside the harness wording.

### Open questions

- Whether `watch` prints events inline between its status lines or as a trailing list per interval.
- Whether a `blocked` status line needs a fixed form, mirroring the milestone line, so that derivation does not rely on free text.
- Whether the seen marker stays a per-run file or becomes a cursor the coordinator passes, which would let two coordinators watch one run.

Planned to Ready on 16 October 2026 in the tools-burndown thread, which Kris's OWNER-LANE decision made this record's writer lane; the record stays in the ways-of-working Project. Decisions 3, 5 and 6 settle the three open questions above, and Decision 4 follows the owner-report shape of 14 October 2026.
