---
id: KI-TOOL-KI-CLI-132
area: CLI
title: Launcher only thread writer
project: ways-of-working
component: agent
purpose: capability
kind: deliver
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: acd0c2373f271309c41e8d074bc72e5a3a139f76
created_at: 2026-10-14T21:29:44Z
updated_at: 2026-10-14T21:29:44Z
---

# Launcher Only Thread Writer

## Goal

`ki agent` is the only writer of a thread folder's decisions log and reports, so no coordinating thread copies either into `+/_THREADS/<run>/` by hand. A run that kept `decisions.md` or `<name>.report.md` in its state folder before the tracked home existed has them moved into the thread folder by `ki agent decide` and `ki agent close`.

## Context

Kris decided on 2026-10-14 in the `ways-of-working` thread, recorded as LOG-WRITER: "make the launcher the only writer of the thread folder's log and report files, and delete the "until then" sentence from the standard". The record exists under his RECORD-THRESHOLD decision of the same day: "a record only for a product or standard change needing acceptance; operational work runs on the decisions log, brief and report".

`KI-TOOL-KI-CLI-124`, released in 0.10.3, already makes `decide` append to the tracked log and points each agent's report at the thread folder. What it left was the run that predates the tracked home: `close` read its state-folder log "until the thread copies it across", a first `decide` started a fresh tracked log at Decision 1 beside the old one, and `close --delete` could drop a state-folder report that only existed there. The `ki-delegation` background-run standard still told the thread to copy the log and each report by hand.

## Boundary

- In: moving a pre-tracked run's state-folder `decisions.md` and `<name>.report.md` into the thread folder from `decide` and `close`; `close` reading only the tracked log; manual, guide, changelog and command inventory.
- Out: `decide --log`, which writes the inbox log the `ki-pmo` standard names until `ki agent send` ships under `KI-TOOL-KI-CLI-127`; any commit of the thread folder, which stays the thread's; the harness sentence, delivered in `ki-agentic-harness`; release.

## Current state

- `src/core/agent/thread.ts`: `appendDecision` resolves the thread home and appends to `+/_THREADS/<run>/decisions.md`, starting at Decision 1 when no tracked log exists even if the state folder holds one.
- `src/core/agent/close.ts`: the decision gate reads the tracked log, or else the state folder's `decisions.md`; state-folder reports are never checked, so `--delete` removes any that exist only there.
- `src/core/agent/runs.ts`: the progress protocol already names the agent's report path in the thread folder.

## Steps

- [x] Add `adoptStateFiles` in `src/core/agent/thread.ts`: move each state-folder `decisions.md` and `*.report.md` into the thread folder where it holds no copy, by copy then remove, and return the names moved.
- [x] Call it from `appendDecision` when writing the thread's own log, so the tracked log continues the old numbering, and print the files moved from `ki agent decide`.
- [x] Call it first in the `close` gate, with one `ok` line per file moved, and drop the state-folder log fallback; the moved files then fail the folder gate until committed.
- [x] Update `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

- `src/core/agent/thread.ts`, `src/core/agent/close.ts`, `src/commands/agent/index.ts`
- `src/tests/cli/agent.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md`, `CHANGELOG.md`

## Verify

1. `bun run test:coverage` passes at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip` and `mandoc -T lint man/ki.1` are clean.
2. Contract tests through `run(args, context)`: `decide` on a run with a state-folder log and reports moves them, numbers the next decision after the old log and prints nothing extra on the next call; `close` moves a legacy log and report, blocks on the uncommitted folder, and once committed leaves a superseded state-folder copy to be archived.

## Dependencies / blocks

None. Builds on the released `KI-TOOL-KI-CLI-124` thread home. The paired harness change removes the hand-copy sentence from the `ki-delegation` background-run standard in `ki-agentic-harness`.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

`man/ki.1` and the generated `man/ki.commands.json` state the only-writer rule under Background agents and the move under `decide` and `close`; the background-agents guide replaces "until the thread copies it across"; the changelog's agent entry gains the move.

### Roadmap

None.

## Review

### Delivered

One commit on `main` from baseline `acd0c23`, `feat(agent): make the launcher the only thread-folder writer`, with this record.

### Change Summary

`adoptStateFiles` in `src/core/agent/thread.ts` moves the files; `appendDecision` returns the names moved and `ki agent decide` prints them before its decision line; the `close` gate moves them first and reads only the tracked log. Tests cover the move on `decide` and on `close`, the superseded copy, and a run with no thread folder.

### Verification

- `bun run test:coverage`: 1185 tests pass at 100% lines, functions, branches and statements; `bunx tsc --noEmit`, `bunx biome check .` (pre-existing warnings only), `bunx knip` and `mandoc -T lint man/ki.1` clean.

### Outstanding concerns

- The next `ki agent decide ways-of-working` with the released change will move the many pre-0.10.3 reports still in that run's state folder into `ki-principal`'s `+/_THREADS/ways-of-working/` where no tracked copy exists; the thread commits them, or reviews them first.
- Ships only with a `tools-ki` release, which this delivery does not make.

### Post-change review

Awaiting Kris's review through `ki-accept`.

### Mini recap

The state folder now holds runtime only for every run, old or new, once `decide` or `close` has touched it. No learning route proposed.

## Discussion

Raised by the `log-writer` background run of the `ways-of-working` thread, which delivered it on the authority of the decision quoted under Context.
