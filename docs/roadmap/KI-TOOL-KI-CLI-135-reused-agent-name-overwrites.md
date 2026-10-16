---
id: KI-TOOL-KI-CLI-135
area: CLI
title: Reused agent name overwrites
project: tools-burndown
purpose: corrective
kind: deliver
component: agent
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T17:05:00Z
updated_at: 2026-10-16T01:19:25Z
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

## Current state

Read at `a17afa7e` on 16 October 2026; the Context above still holds.

- `launchAgent` (`src/core/agent/runs.ts:260`) refuses only a live pid (`is already running`), then rewrites `<name>.prompt.md` and `<name>.launch.json`, and `startRuntime` rewrites `<name>.status` and `<name>.pid` and appends to `<name>.log`; the composed protocol names `reportPath(thread, name)`, the same `+/_THREADS/<run>/<name>.report.md`.
- `queueAgent` (`runs.ts:321`) refuses a queued name or one with a pid file; `dispatchRun` launches a queued request through `launchAgent`, when only `<name>.queued.md` exists for it. `newPrompt` writes `<name>.draft.md` and refuses an existing draft. `holdAgent`, the `--foreground` hold process, does not go through `launchAgent`'s checks.

## Decision

1. **Refuse, with the suggestion.** A launch of a taken name fails `ki agent launch: <run>/<name> has already run (<files>); launch it as <name>-<n> or pass --relaunch`, where `<name>-<n>` is the first free suffix from 2. Refusal keeps names meaningful in reply blocks and checkpoints; the message gives the coordinator the suffix in one step.
2. **Taken** means any of `<name>.pid`, `.status`, `.prompt.md`, `.launch.json` or `.report.md` in the state folder, or `<name>.report.md` in the thread folder's working tree. `.queued.md` and `.draft.md` do not take a name, so the dispatcher's launch of a queued agent and a launch from a draft are unaffected.
3. **`--relaunch`** is the opt-in for a deliberate second start of the same agent, such as a resume. It moves the earlier state-folder packet files into `<name>.prev-<n>/` in the state folder and refuses when the thread-folder report has uncommitted changes, so the earlier report survives in Git or in the working tree; it never deletes anything.
4. `queueAgent` uses the same check, so a queued name cannot collide later.

## Steps

- [ ] In `src/core/agent/runs.ts`, add `takenBy(directory, thread, name)` returning the files that take a name, and `freeName(directory, thread, name)` for the first free `<name>-<n>`.
- [ ] Call the check in `launchAgent` after the live-pid check and in `queueAgent` beside its queue check; refuse per Decision 1, exit 1.
- [ ] Add `relaunch?: boolean` to `LaunchRequest`, and `--relaunch` to `ki agent launch` and `ki agent queue` in `src/commands/agent/index.ts`; on relaunch, refuse a dirty thread-folder report (`git status --porcelain -- <report>` through `git(context, ...)`), else move the packet files into `<name>.prev-<n>/` and continue.
- [ ] Keep `dispatchRun`'s launch path working: a queued request carries `relaunch` through the queue file.
- [ ] Contract tests in `src/tests/cli/agent.test.ts` (see Verify).
- [ ] `README.md` `ki agent` section, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` ("names are unique within a run") and `CHANGELOG.md`.

## Files touched

`src/core/agent/runs.ts`; `src/commands/agent/index.ts`; `src/tests/cli/agent.test.ts`; `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. Through `run(args, context)` and `sandbox()`: a finished agent `fix` (status `DONE`, report in the thread folder) blocks a second `ki agent launch <run> fix ...`, which exits 1 naming the files and `fix-2`; none of `fix`'s files change.
2. With `fix` and `fix-2` taken, the suggestion is `fix-3`.
3. A name with only a thread-folder report (state folder archived) is still refused.
4. `ki agent queue` refuses a taken name the same way; a queued agent is launched by the dispatcher without being refused by its own `.queued.md`.
5. `--relaunch` moves the earlier prompt, status, log, launch details and pid into `fix.prev-1/`, starts the agent, and leaves a committed thread-folder report untouched; with an uncommitted change to that report it refuses and changes nothing.
6. A launch from a `ki agent new` draft of a fresh name is unaffected.
7. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

None. Shares `src/core/agent/runs.ts` with [KI-TOOL-KI-CLI-137](KI-TOOL-KI-CLI-137-agent-run-tmp-home.md) and [KI-TOOL-KI-CLI-134](KI-TOOL-KI-CLI-134-launch-footer-follows-brief.md); deliver it first of the three, since both later records name per-agent paths that this makes unique. The `ki-delegation` run-packet table may add "names are unique within a run"; that line is the harness's and not a blocker.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

`README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`: the refusal, the suffix suggestion and `--relaunch`.

### Roadmap

None.

## Discussion

Origin: the `sol` bring-up, captured on Kris Brown's TOOL-RECORDS approval on 2026-10-14 (decision 70 in the thread's decisions log). Refusing is the simpler contract and keeps names meaningful in reply blocks and checkpoints; suffixing (`sol-fix-2`) is kinder to a coordinator relaunching after a failure. Either way the `ki-delegation` standard's run-packet table may want one line saying names are unique within a run. Capture only; adoption, priority and plan belong to this repository.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned and set Ready on 16 October 2026 under the tools-burndown thread's BURN-OVERNIGHT authority, refusing with a suffix suggestion and an explicit `--relaunch` (see Decision).
