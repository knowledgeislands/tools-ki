---
id: KI-TOOL-KI-CLI-144
area: CLI
title: Older runs start seen
project: tools-burndown
component: agent
kind: deliver
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: d835eab86412290f9b11fa46dec5c2f1ba2f5bfc
created_at: 2026-10-16T21:08:47Z
updated_at: 2026-10-18T04:40:00Z
---

# Older Runs Start Seen

## Goal

The first time `ki agent wait`, `watch` or `status` derives events for a run that existed before its events log, it treats the agents that already finished as already seen. The coordinator gets no replayed `needs-owner` queries it has already answered, and no `failed: no report` for an agent whose report is simply in an older place.

## Context

This follows [KI-TOOL-KI-CLI-123](KI-TOOL-KI-CLI-123-agent-run-events.md), which added `events.jsonl`, the `events.state.json` snapshot and the `events.seen` cursor. Its Decision 5 accepted that a run in flight at upgrade returns its earlier finishes once more, with no compatibility path. The tools-burndown thread on 16 October 2026 showed that this costs more than one repeated finish.

- [`deriveEvents`](../../src/core/agent/events.ts) starts from an empty snapshot when `events.state.json` is absent. So on its first read of an older run, every finished agent produces a `done` event, and every query in each report produces a `needs-owner` event, however long ago the owner answered it.
- `agentChanges` reads the report through `reportOf`: the thread folder first, then the state folder. When an older agent's report is in neither, for example because it was retired, moved or written to a path the protocol did not name, `DONE` with no report gives `failed` (`no report`) for an agent that finished normally.

## Boundary

- In: what the first derivation over a run without `events.state.json` records for agents that had already ended; how it seeds the snapshot and the `events.seen` cursor; contract tests through `run(args, context)`.
- Out: changing KI-TOOL-KI-CLI-123's status, which awaits Kris's review through `ki-accept`; the event shape; the meaning of `failed: no report` for an agent that finishes after the events log exists; a cursor shared between coordinators.

## Current state

Delivered locally to Awaiting review on 18 October 2026 by the tools-burndown run, from baseline `d835eab8`; see Review.

## Steps

- [x] Detect an older run: no `events.state.json` and no entries in `events.jsonl`. A run with events but no snapshot lost its state, not its history, and keeps deriving from empty.
- [x] Seed the snapshot silently for each agent of an older run that has written `DONE` or whose process is gone: its attempt, last status line, `ended` and the keys of its report's queries. A live agent is not seeded and keeps ordinary derivation.
- [x] Seed on whichever comes first, the first derivation or a launcher event, so a launch into an older run does not leave its past agents to be replayed later; the launched agent itself is never seeded.
- [x] Pass the run's agents and liveness to both paths as one `Observed` value, keeping `events.ts` free of `runs.ts`.
- [x] Mark the hand-written agent fixtures in existing tests as runs started under events; add contract tests for an older run's first read, a launch into an older run, and a lost snapshot.
- [x] Align the manual and changelog.

## Files touched

- [Run events](../../src/core/agent/events.ts) and [runs](../../src/core/agent/runs.ts).
- [Run event tests](../../src/tests/cli/agent-events.test.ts) and [agent tests](../../src/tests/cli/agent.test.ts).
- [Manual](../../man/ki.1), the generated [command inventory](../../man/ki.commands.json) and [changelog](../../CHANGELOG.md).

## Verify

- An older run with an answered agent (report in the state folder, with a query), an agent with `DONE` and no report, an agent that exited after a `failed:` line and a live agent: the first `ki agent status` appends no event; the live agent's later finish and query are returned by `wait --next`, then `ALL FINISHED`.
- A launch into an older run appends only its own `launch` event, and the next read replays nothing.
- A run with an `events.jsonl` entry but no `events.state.json` derives every change, as before.
- `bun run test:coverage` at 100%, `tsc --noEmit`, Biome, `ki repo audit --repo .` and `mandoc -T lint man/ki.1`.

## Dependencies / blocks

Builds on [KI-TOOL-KI-CLI-123](KI-TOOL-KI-CLI-123-agent-run-events.md), which awaits Kris's review; it changes neither that record's status nor its event shape.

## Documentation impact

### Decision Records

None.

### Specifications

None: run events are described by the manual.

### Guides

The manual's `ki agent wait` entry gains the older-run sentence; the changelog's run-events bullet gains the same.

### Roadmap

Adopted and delivered in one sitting under the overnight instruction; no acceptance or release.

## Review

### Delivered

Delivered locally from baseline `d835eab8`; nothing released.

### Change Summary

- `readSnapshot` in `events.ts` seeds an older run's ended agents silently, and both `deriveEvents` and `recordEvent` read through it.
- `deriveEvents` and `recordEvent` take an `Observed` value (agents and liveness) that `runs.ts` builds once per call.
- A shared `statusOf` reads an agent's last status line and `DONE`, and `queryKeys` the report's query keys.
- Existing tests that write agent files by hand now mark their run as started under events; three new contract tests cover the older-run cases.
- Manual and changelog describe the rule.

### Verification

`bun run test:coverage` passes: all 1,293 tests across 76 files, with the 100% coverage thresholds held. `tsc --noEmit`, Biome, the command-inventory check, `mandoc -T lint man/ki.1` and `ki repo audit --repo .` (two existing warnings, CI-1 and HOOK-1) pass.

### Outstanding concerns

- **Provisional plan choices.** Seeding is silent, with no quiet per-agent event in the log; an older run is one with neither the snapshot nor any logged event; an agent that exited without `DONE` is seeded as ended too, so its old exit is not reported. Kris to confirm.
- A hand-made run folder with agent files and no events files now reads as an older run. Only tests did that; real runs start through `ki agent launch`, which records an event first.

### Post-change review

Every existing agent test passes once its hand-written run is marked as started under events; no event shape, cursor or ordering changed.

### Mini recap

The first read of an older run no longer replays its past finishes, answered queries or `failed: no report`.

## Discussion

Origin: Kris Brown's EVENTS-REPLAY decision in the tools-burndown thread on 16 October 2026, "so the first read of an older run treats past agents as already seen (no replayed queries, no failed: no report)".

Open questions for planning:

- Seeding: whether the first derivation records each ended agent in the snapshot silently, or appends one quiet event per agent that `wait --next` skips, so the log still shows what was there.
- Detecting an older run: no `events.state.json` alone, or also no `events.jsonl` with entries, so a run whose state file was lost is not mistaken for an older one.
- A live agent of an older run, still running at the first read, keeps ordinary derivation.

Adopted, planned and delivered on 18 October 2026 by the tools-burndown run, under Kris's overnight instruction of 18 October 2026, 04:30 BST, to get through the roadmap as far as possible and take the recommended course on a judgement call; the run brief orders this record after KI-TOOL-KI-CLI-123. Its adoption to `deliver` / Now under the tools-burndown Project and the plan choices in Outstanding concerns are provisional, for Kris to confirm at review.
