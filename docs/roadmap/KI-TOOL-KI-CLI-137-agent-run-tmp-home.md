---
id: KI-TOOL-KI-CLI-137
area: CLI
title: Agent run temporary home
project: tools-burndown
purpose: capability
kind: deliver
component: agent
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-15T21:48:02Z
updated_at: 2026-10-16T01:15:23Z
---

# Agent Run Temporary Home

## Goal

`ki agent launch` creates `<primary checkout>/tmp/<run>/<name>/` in the repository the agent works in and names it in the composed prompt, and `ki agent close` removes it, so a background agent's temporary output has one ignored home that does not outlive its run.

## Context

Kris Brown, in the ways-of-working thread on 15 October 2026, set where temporary output lives (THREADS-TMP-HOME): "Temporary output goes in <primary checkout>/tmp/<run>/<name>/ in the repository the agent works in, ignored and deleted when the run closes or they are superflous to requirements; machine-only scratch may stay in the state folder as <name>.work/." The same day (THREADS-CONTENT) Kris closed the thread folder's contents: "A thread folder holds a closed list, decisions.md and <name>.report.md only; briefs live in the state folder, work products in their owning home, temporary output in the temporary location." Kris asked for this record in THREADS-TELL: "Open one ki-agentic-harness record (closed list in the ki-delegation run packet, one run-prompt.md footer line, a ki-pmo rubric item) and one tools-ki record (ki agent launch creates tmp/<run>/<name>/, ki agent close removes it)."

What `ki` does today, observed at `86adda02`:

- **Launch.** `launchAgent` ([runs.ts:260](../../src/core/agent/runs.ts)) resolves the thread home, creates only the tracked thread folder for the report and writes the prompt and packet into the state folder; it makes no temporary folder and the prompt names none.
- **Close.** `closeRun` ([close.ts:199](../../src/core/agent/close.ts)) gates on the thread folder, then archives, compresses or deletes the state folder; nothing in a working checkout is touched.
- **Ignore.** This repository already ignores `tmp/`; other repositories may not, so launch cannot assume the folder is ignored.

## Boundary

- In: launch creating `tmp/<run>/<name>/` under the agent's workdir checkout root and passing its absolute path into the composed prompt beside the report path; a launch warning, not a failure, when the checkout does not ignore `tmp/`; close removing each `tmp/<run>/` folder its run's packets name, reporting each path removed and leaving any folder that holds tracked files; tests through `run(args, context)` and `sandbox()`; `README.md`, `man/ki.1`, the background-agents guide and `CHANGELOG.md`.
- Out: the `<name>.work/` state-folder scratch, which already lives in the state folder; editing any repository's `.gitignore`; the closed thread-folder list, its run-packet and run-prompt wording and the ki-pmo rubric item, which the paired ki-agentic-harness record owns; removing an output earlier than close because it is superfluous, which stays the agent's own act.

## Current state

Adopted to `next` as a draft on 16 October 2026 and not yet planned; `ki-plan` records the current state before this record becomes Ready.

## Steps

- [ ] Shape this record through `ki-plan`; no delivery step is planned yet.

## Files touched

Not yet determined.

## Verify

Not yet set. The plan names the exact gates; at minimum the repository test suite through `run(args, context)` and the `ki-engineering` audit.

## Dependencies / blocks

Not blocked for planning. Pairs with the ki-agentic-harness THREADS-TELL record, whose run-prompt footer line should name the same path; the harness wording can land first, since the path is fixed by the owner decision.

## Documentation impact

### Decision Records

Not yet assessed.

### Specifications

Not yet assessed.

### Guides

Not yet assessed.

### Roadmap

None.

## Discussion

Capture only, on Kris Brown's explicit request in THREADS-TELL; adoption, priority and plan belong to this repository. Questions for planning: whether close removes the folder unconditionally or only when it holds nothing tracked; and whether launch should resolve the primary checkout from the workdir's Git common directory, so that a run in a linked worktree still writes to the primary checkout's `tmp/`.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.
