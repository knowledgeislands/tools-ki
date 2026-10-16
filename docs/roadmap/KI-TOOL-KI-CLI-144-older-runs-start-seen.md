---
id: KI-TOOL-KI-CLI-144
area: CLI
title: Older runs start seen
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T21:08:47Z
updated_at: 2026-10-16T21:08:47Z
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
- Capture only; no adoption, priority or implementation is authorised.

## Discussion

Origin: Kris Brown's EVENTS-REPLAY decision in the tools-burndown thread on 16 October 2026, "so the first read of an older run treats past agents as already seen (no replayed queries, no failed: no report)".

Open questions for planning:

- Seeding: whether the first derivation records each ended agent in the snapshot silently, or appends one quiet event per agent that `wait --next` skips, so the log still shows what was there.
- Detecting an older run: no `events.state.json` alone, or also no `events.jsonl` with entries, so a run whose state file was lost is not mistaken for an older one.
- A live agent of an older run, still running at the first read, keeps ordinary derivation.
