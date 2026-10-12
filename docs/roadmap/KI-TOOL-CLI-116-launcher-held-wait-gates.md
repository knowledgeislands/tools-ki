---
id: KI-TOOL-CLI-116
area: CLI
title: Launcher-held wait gates
kind: deliver
purpose: corrective
project: agent-host
component: agent
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: c68e7c010685cb98f7339f69253e5da728847543
created_at: 2026-10-10T05:41:22Z
updated_at: 2026-10-12T05:35:30Z
---

# Launcher-Held Wait Gates

## Goal

An agent launched with `ki agent launch --wait-for <name>` starts work only after each named agent in the run has written `DONE`, and the gate holds whatever the agent runtime does while it waits. A gate that can never open, because a named agent exited without `DONE`, ends the gated agent cleanly with a status line that says so, rather than leaving it waiting.

## Context

In `ki` 0.10.0, and unchanged since `--wait-for` arrived with `ki agent` in 0.8.4, the gate is only a prompt instruction. `composePrompt` in `src/core/agent/runs.ts` appends a "Wait gate" paragraph asking the agent to poll the named `.status` files every two minutes, and `launchAgent` starts the runtime at once. The only guard is the Claude adapter's `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` in `src/core/agent/runtimes.ts`; Codex has none.

On 2026-10-09 in the `techne` run this failed three times in a chain:

- `naming` waited on `build-015`. It wrote "waiting for build-015 to finish" at 17:20 and its process ended within the same minute, so the run reported it as exited without `DONE`.
- `naming2` waited on `build-015b`. At 19:21 it handed the wait to a background watcher and ended its turn; `build-015b` finished at 19:28, nothing resumed `naming2`, and it never wrote `DONE`.
- `rename-agent-host2` waited on `naming2`. It did its read-only survey, waited until about 19:52 and then stopped and reported, because its gate could never open.

The cause is that waiting is left to the model. In print mode (`claude -p`) and `codex exec` a session ends when the agent ends its turn, so an agent that delegates the wait to a background task or simply stops polling cannot be woken; the prompt's "Never end your session while waiting" does not prevent it. Any run that uses `--wait-for` behind a long-running agent is exposed, and one failure strands every agent gated behind it.

Until this is fixed, the reliable workaround is to avoid `--wait-for`: launch the dependent agent only after the gating agent's report arrives, or queue it with `ki agent queue` and `ki agent dispatch --max 1` so the dispatcher starts it after the earlier agent has finished.

## Boundary

- **In:** making the gate a launcher behaviour, with `ki` holding a gated agent until every named agent's last status line is `DONE` before the runtime starts; writing the gated agent's `.status` while it is held; ending it with a clear "gate cannot open" status when a named agent exits without `DONE`; dropping the prompt-only gate paragraph; tests through `run(args, context)` with injected processes and time; the background-agents user guide.
- **Out:** the `ki-delegation` skill's run-contract wording, which the harness owns and would receive through `ki-trades` if it changes; runtime-side fixes in Claude Code or Codex; dependency graphs beyond "wait for these names in this run".

## Current state

[Agent runs](../../src/core/agent/runs.ts) compose the prompt with a "Wait gate" paragraph when `--wait-for` is given and start the runtime at once; the dispatcher launches the first queued request whenever a slot is free, ignoring its gates. [The agent command](../../src/commands/agent/index.ts) already uses a hidden `--foreground` option for the detached dispatcher, and [the agent CLI tests](../../src/tests/cli/agent.test.ts) inject `AgentProcesses` and time.

## Steps

- [x] Evaluate a gate over the named agents: open when every one has written `DONE`; closed when one has a `.pid` whose process has ended without `DONE`; otherwise waiting, including names not yet launched. Reject an agent that waits for itself.
- [x] `ki agent launch --wait-for`: refuse with exit 1 when the gate is already closed; start the runtime at once when it is open; otherwise write the packet, set `.status` to a held line, and detach a hidden `ki agent launch ... --foreground` hold process whose pid goes in `.pid`.
- [x] The hold process checks every 30 seconds, rewriting the held line, then starts the runtime with the composed prompt and replaces `.pid` with the runtime's pid; on a closed gate it writes a "gate cannot open" status and ends without starting the runtime.
- [x] Drop the prompt-only wait-gate paragraph.
- [x] `ki agent dispatch` launches the first queued request whose gate is open, drops one whose gate is closed, and, once nothing in the run is running, drops requests still waiting, logging each drop.
- [x] Prove launch, hold, propagation and dispatch through the public CLI with injected processes and time; update the background-agents guide and `man/ki.1`.

## Files touched

`src/core/agent/runs.ts`, `src/commands/agent/index.ts`, `src/tests/cli/agent.test.ts`, `docs/guides/user/background-agents.md`, `man/ki.1`, and `man/ki.commands.json` if regenerated. Exact delivered paths recorded in Review.

## Verify

Public CLI tests at 100% coverage, TypeScript, Biome, `mandoc -T lint`, command inventory check, Markdown lint and `ki repo audit` roadmap and documentation criteria.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None; Decision 107 is recorded in the Master decisions log and the design choices below.

### Specifications

None; `ki agent` has no specification, and the `ki-delegation` contract wording stays with the harness.

### Guides

The background-agents guide describes held agents, the closed-gate status and gated queue entries.

### Roadmap

Approved immediate delivery stops at Awaiting review.

## Review

### Delivered

`--wait-for` is now held by `ki`, not by the agent. `ki agent launch` starts the agent at once when every named agent has written `DONE`, refuses with exit 1 when one has already exited without it, and otherwise writes the run packet, sets the status to `held until <names> finish` and detaches a hold process. The hold process checks every 30 seconds and starts the runtime once the gate opens; if a gating agent exits without `DONE` it ends with `gate cannot open: <name> exited without DONE`, which closes any gate behind it. `ki agent dispatch` launches the first queued agent whose gate is open and drops, with a log line, queued agents whose gate cannot open. The prompt-only wait-gate paragraph is gone.

### Change Summary

- `src/core/agent/runs.ts` adds gate evaluation, `startRuntime`, the detached hold (`startHold`) and `holdAgent`; `launchAgent` returns the names it is held for; `dispatchRun` launches by gate rather than queue head; `composePrompt` drops the wait-gate paragraph; an agent waiting for itself is rejected.
- `src/commands/agent/index.ts` adds the hidden `launch --foreground` hold mode and prints `held <run>/<name> until <names> finish` for a held launch.
- `src/tests/cli/agent.test.ts` proves the immediate start, the held launch and its hold-process arguments, the held status, the hold opening over two checks, closed-gate refusal, held-agent ending and propagation into `status`, self-wait rejection, and gated dispatch (skip-ahead, closed and never-opening gates).
- `docs/guides/user/background-agents.md`, `man/ki.1` and the regenerated `man/ki.commands.json` describe held launches and gated dispatch.
- `.ki.toml` declares the `agent` roadmap component, mirroring the existing command group.

### Verification

- `bun run test:coverage`: 67 files, 1,130 tests passed, 100% statements, branches, functions and lines.
- TypeScript, Biome on changed files (whole-tree warnings unchanged from baseline), `mandoc -T lint`, command inventory check and `rumdl` passed.
- `ki repo audit`: roadmap, work and authoring criteria pass. Remaining findings are pre-existing on `main`: KNIP-2 (unused `src/core/estate/index.ts` exports), CI-1, HOOK-1 and CLAUDEBIND-1 warnings.
- Compiled `dist/ki` against a temporary state root: a launch gated on a dead agent was refused; a launch gated on a live `sleep 40` was held by a real detached hold process, showed `held until slow finish` in `ki agent status`, and ended about a minute later with `gate cannot open: slow exited without DONE` without starting a runtime. The open-gate start of a real runtime was not exercised live, to avoid starting an agent; tests cover it.

### Outstanding concerns

- Takes effect on terra once `ki` runs from this checkout (Decision 108) or after a release; no release made.
- A gate naming an agent that is never launched keeps a held agent waiting until the owner stops it; the dispatcher drops such queued agents once nothing in the run is running.
- The `ki-delegation` skill's wording about prompt-held waits belongs to the harness; it may want a trade noting the launcher now holds gates.

### Post-change review

The gate reuses existing agent-state evaluation, so status, watch and wait need no change: a held agent's `.pid` names the hold process and reads as running. Agents launched without `--wait-for` follow the unchanged path. `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` stays for waits authored in prompts and agents' own builds.

### Mini recap

Decision 107 delivered: gates are a launcher behaviour for both `launch` and `dispatch`, with clean failure propagation. Not accepted or pruned; no release.

## Discussion

### Approval

Master state-of-play Decision 107 (12 October 2026, 06:12 BST): "KI-TOOL-CLI-116 adopted now - plan, implement and roll it out." It authorises adoption, planning, delivery to `main` and push after full gates; it grants no acceptance or release.

### Design choices

- **Hold process, gated queue.** `launch --wait-for` detaches a hold process (a hidden `--foreground` launch, so no new subcommand reaches help, completion or the manual); `dispatch` evaluates gates itself, so a gated queue entry never occupies a slot and queue order cannot deadlock it behind its own gate.
- **Which pid the run reports.** While held, `.pid` names the hold process, so `ki agent status`, `wait` and `watch` treat the agent as running; the runtime's pid replaces it at start. The hold process sleeps before its first check, because the launcher has just seen the gate shut.
- **Failure propagation.** A held agent ends at once when a gating agent exits without `DONE`, so a failure propagates down a chain; the owner relaunches under the same name to retry. A name not yet launched keeps the gate waiting, because owners often launch the dependent first.
- **The Claude ceiling variable.** `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` stays: owner prompts and agents' own builds and tests still wait inside a session.

### Earlier notes

- **Likely direction.** Reuse the dispatcher pattern: `launch --wait-for` starts a detached `ki agent hold <run> <name> --foreground` process that polls the named statuses with `context.processes.sleep` and then calls `launchAgent`, or records gates on queued requests so `dispatchRun` launches a request only once its gates are `DONE`. The second adds no new process kind but makes every gated launch go through the queue.
- **Which pid the run reports.** While held, `.pid` should name the holding process so `ki agent status` and `ki agent wait` treat the agent as running, and then be replaced by the runtime's pid.
- **Failure propagation.** When a gating agent exits without `DONE`, should the held agent end at once, or wait for an owner to relaunch the gating agent under the same name?
- **The Claude ceiling variable.** Once nothing waits inside a session, decide whether `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is still needed for other waits or can be removed.
