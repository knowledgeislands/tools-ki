---
id: KI-TOOL-KI-CLI-135
area: CLI
title: Reused agent name overwrites
purpose: corrective
component: agent
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T17:05:00Z
updated_at: 2026-10-14T17:05:00Z
---

# Reused Agent Name Overwrites

## Goal

`ki agent launch` never silently replaces an earlier agent's run packet or report. Launching a name that has already run in the same run either refuses with a clear message or gives the new agent a distinct suffixed name, so every agent's prompt, status, log and report survive for review.

## Context

In the mac-studio-bootstrap thread on 14 October 2026 (difference D39 in the run report `rig-guide.report.md`, item 13 in `sol-fix.report.md`), a second `sol-fix` agent was launched in the same run. Its report path already held the first `sol-fix` agent's report; the agent noticed and kept the old one as `sol-fix.report.prev-2026-10-14.md` by hand. Without that care the earlier report would have been lost.

What `ki agent` does today:

- [`launchAgent`](../../src/core/agent/runs.ts) refuses a name only while its pid is alive (`is already running`). For a finished or exited name it rewrites `<name>.prompt.md`, `<name>.launch.json`, `<name>.status` and `<name>.pid`, reuses `<name>.log`, and the composed protocol points the new agent at the same `<name>.report.md`.
- [`queueAgent`](../../src/core/agent/runs.ts) already refuses a name that is queued or has a pid file, and `newPrompt` refuses an existing draft, so the queue path is protected and only direct launch is not.

## Boundary

- In: a launch-time check that treats any existing packet for the name (pid, status, prompt or report in the state folder, or report in the thread folder) as taken; refusing with the next free suffixed name in the message, or applying the suffix automatically, as planning decides; an explicit opt-in to relaunch the same agent where that is genuinely wanted (for example a resumed agent), keeping the earlier files; contract tests through `run(args, context)` and the `sandbox()` helper.
- Out: renaming or migrating existing run folders; `ki agent close` and pruning of old packets; the dispatcher's own naming beyond reusing the same check.

## Dependencies / blocks

Not blocked; blocks nothing. `KI-TOOL-KI-CLI-124` (agent run close) reads the same packet files, so its gate benefits once names are unique.

## Discussion

Origin: the `sol` bring-up, captured on Kris Brown's TOOL-RECORDS approval on 2026-10-14 (decision 70 in the thread's decisions log). Refusing is the simpler contract and keeps names meaningful in reply blocks and checkpoints; suffixing (`sol-fix-2`) is kinder to a coordinator relaunching after a failure. Either way the `ki-delegation` standard's run-packet table may want one line saying names are unique within a run. Capture only; adoption, priority and plan belong to this repository.
