---
id: KI-TOOL-KI-CLI-123
area: CLI
title: Agent run events
project: ways-of-working
component: agent
kind: deliver
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-13T13:53:24Z
updated_at: 2026-10-13T21:14:24Z
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

Adopted to `next` as a draft and not yet planned. The run packet carries a status file, a log, a report and `DONE` per agent and `wait --next` marks agents seen by name; there is no events log, and `waitForRun` in `src/core/agent/runs.ts` returns the first unseen finished agent in name order. `ki-plan` shapes the plan below before this record becomes Ready.

## Steps

- [ ] Shape this record through `ki-plan` against requirements 1 to 5; no delivery step is planned yet.

## Files touched

Not yet determined. The plan is expected to name `src/core/agent/runs.ts`, the `ki agent` command surface, their tests and the README's `ki agent` section.

## Verify

Not yet set. The plan names the exact gates; at minimum the repository test suite and the `ki-engineering` audit.

## Dependencies / blocks

- `ki-agentic-harness` owns the `ki-delegation` background-run standard, which names the events, the milestone line, what `wait --next` and `watch` return and the rule that the coordinator stays out of any delivery path; the launcher's appended wording follows it. Durable documentation: [the background-run standard](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/governance/ki-delegation/references/standards-background-runs.md). This is a sequencing preference, not build order: the mechanics can land first and the wording be aligned after, so `blocked_by` is empty.
- Knowledge Islands Principal owns the strategy, its phase plan and the owner decisions behind it; this record delivers phase 1 only and does not decide phases 2 to 4.

## Documentation impact

### Decision Records

Not yet assessed; `ki-plan` states whether the event vocabulary needs a Decision Record or follows the strategy's existing decisions.

### Specifications

Not yet assessed; `ki-plan` states whether a behaviour-level contract changes.

### Guides

Not yet assessed; `ki-plan` states whether human guidance changes.

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
