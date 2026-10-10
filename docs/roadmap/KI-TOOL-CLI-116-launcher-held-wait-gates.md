---
id: KI-TOOL-CLI-116
area: CLI
title: Launcher-held wait gates
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-10T05:41:22Z
updated_at: 2026-10-10T05:41:22Z
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

## Discussion

- **Likely direction.** Reuse the dispatcher pattern: `launch --wait-for` starts a detached `ki agent hold <run> <name> --foreground` process that polls the named statuses with `context.processes.sleep` and then calls `launchAgent`, or records gates on queued requests so `dispatchRun` launches a request only once its gates are `DONE`. The second adds no new process kind but makes every gated launch go through the queue.
- **Which pid the run reports.** While held, `.pid` should name the holding process so `ki agent status` and `ki agent wait` treat the agent as running, and then be replaced by the runtime's pid.
- **Failure propagation.** When a gating agent exits without `DONE`, should the held agent end at once, or wait for an owner to relaunch the gating agent under the same name?
- **The Claude ceiling variable.** Once nothing waits inside a session, decide whether `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is still needed for other waits or can be removed.
