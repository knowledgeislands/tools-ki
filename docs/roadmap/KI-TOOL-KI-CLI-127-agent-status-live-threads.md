---
id: KI-TOOL-KI-CLI-127
area: CLI
title: Agent status live threads
project: ways-of-working
component: agent
purpose: capability
kind: deliver
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T13:55:48Z
updated_at: 2026-10-14T13:55:48Z
---

# Agent Status Live Threads

## Goal

`ki agent status` with no run name lists the live threads on this machine: every run under `$KI_STATE_HOME/agents/` that has an agent running, held or queued, with its thread home, so a coordinating thread re-anchoring after compaction, or Kris at a shell, can see what is in flight without knowing each run's name. A run with nothing live is left out unless asked for.

## Context

Kris asked for this on 2026-10-14 in the `ways-of-working` thread, approving among a batch of recommendations "the surfaces rule and the ki agent status follow-on". It serves the `ki-delegation` re-anchoring rule that landed the same day, which has a thread that has just compacted re-read its standards and its checkpoint and then run `ki agent status` before confirming where it stands. Today the command needs a run name, so a thread that has lost its context cannot ask what is running.

The record is captured under the burn-down because Kris requested it; it is not built here. The retired state-of-play report that proposed the re-anchoring subsection is in the harness's run folder and is not a durable source.

## Boundary

- In scope: `ki agent status` without a run argument; the listing's shape; which runs count as live; reading each run's `thread.json`, pid, status and queue files already in the state folder.
- Out of scope: any change to the per-run `status` output, `watch` or `wait`; inspecting agent logs or reports; archived runs under `_archive/`; any network or Git call.

## Requirements

- The listing names each live run, its thread home when recorded, and each live agent with its state and latest status line, in a shape `ki-delegation`'s banner can quote as `running: <agent> - <what>` lines.
- A run whose folder predates `thread.json` is listed with no home rather than skipped.
- The command reads only packet files and changes nothing.

## Current state

`src/commands/agent/index.ts` registers `status <run>` and calls `runStatus` in `src/core/agent/runs.ts`, which summarises one run from its `.pid`, `.status` and `queue.jsonl` files. `agents()` already lists a run's agents from its pid files, and `readThread` in `src/core/agent/thread.ts` reads the home. Nothing enumerates the runs under `$KI_STATE_HOME/agents/`.

## Steps

- [ ] Make the run argument optional; without it, enumerate the run folders under `agents/`, skipping `_archive`, and summarise each through the existing per-run reader.
- [ ] Define live as at least one agent running or held, or a non-empty queue, and list only live runs by default.
- [ ] Print one block per run: the run name and thread home, then one line per agent as the per-run `status` prints it.
- [ ] Tests through `run(args, context)` and `sandbox()` for a mix of live, finished and legacy runs.
- [ ] Document the form in `README.md`, `man/ki.1`, the background-agents guide and the `CHANGELOG.md` command surface.

## Files touched

- `src/commands/agent/index.ts`
- `src/core/agent/runs.ts`
- `src/tests/cli/agent.test.ts`
- `README.md`
- `man/ki.1`
- `docs/guides/user/background-agents.md`
- `CHANGELOG.md`

## Verify

- `bun run test:coverage` passes with the new cases.
- `ki agent status` on this machine lists the running coordination threads and nothing archived.

## Dependencies / blocks

- Follows [KI-TOOL-KI-CLI-124](KI-TOOL-KI-CLI-124-agent-run-close.md), accepted, which fixed the thread home the listing reads.
- The `ki-delegation` re-anchoring rule in `ki-agentic-harness` names `ki agent status` as the step a thread takes after compaction; this record gives that step a form that needs no run name.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

The background-agents guide gains the no-argument form under checking on a run.

### Roadmap

No follow-on record.

## Discussion

### Open questions

- Whether the listing should also show runs with nothing live behind a flag, for the sweep of old run folders.
- Whether the output should be plain lines or a table; plain lines match the banner's `running:` prefix rule.
