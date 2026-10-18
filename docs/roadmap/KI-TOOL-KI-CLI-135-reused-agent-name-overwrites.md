---
id: KI-TOOL-KI-CLI-135
area: CLI
title: Reused agent name overwrites
project: tools-burndown
purpose: corrective
kind: deliver
component: agent
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: fed222765aebead409e0e53d4cd970dd4a0042aa
created_at: 2026-10-14T17:05:00Z
updated_at: 2026-10-18T06:52:00Z
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

- [x] In `src/core/agent/runs.ts`, add `takenBy(directory, thread, name)` returning the files that take a name, and `freeName(directory, thread, name)` for the first free `<name>-<n>`.
- [x] Call the check in `launchAgent` after the live-pid check and in `queueAgent` beside its queue check; refuse per Decision 1, exit 1.
- [x] Add `relaunch?: boolean` to `LaunchRequest`, and `--relaunch` to `ki agent launch` and `ki agent queue` in `src/commands/agent/index.ts`; on relaunch, refuse a dirty thread-folder report (`git status --porcelain -- <report>` through `git(context, ...)`), else move the packet files into `<name>.prev-<n>/` and continue.
- [x] Keep `dispatchRun`'s launch path working: a queued request carries `relaunch` through the queue file.
- [x] Contract tests in `src/tests/cli/agent.test.ts` (see Verify).
- [x] `README.md` `ki agent` section, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` ("names are unique within a run") and `CHANGELOG.md`.

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

## Review

### Delivered

A launch or queue of an agent name that has already run in the run now refuses, exit 1, naming the files that take the name and the first free suffix: `<run>/<name> has already run (<files>); launch it as <name>-<n> or pass --relaunch`. `--relaunch`, on both `ki agent launch` and `ki agent queue`, moves the earlier state-folder packet and log into `<name>.prev-<n>/` and starts the agent; it refuses, changing nothing, while the thread-folder report has uncommitted changes. A queued request carries `--relaunch` through to the dispatcher. Drafts and queue files do not take a name.

### Change Summary

- `src/core/agent/runs.ts`: `takenBy` lists the files taking a name (`pid`, `status`, `prompt.md`, `launch.json`, `report.md` in the state folder, and the thread-folder report); `refuseTaken` refuses with the first free `<name>-<n>` from 2, folding the planned `freeName` into the refusal; `setAside` checks the report with `git status --porcelain` and moves the packet and log into the first free `<name>.prev-<n>/`. `launchAgent` refuses after the live-pid check, or sets aside after the gate check on `--relaunch`. `queueAgent` refuses a queued duplicate as `is already queued` and a taken name through the same check, replacing its pid-file test.
- `src/commands/agent/index.ts`: `--relaunch` on launch and queue.
- `src/tests/cli/agent.test.ts`: four contract tests and the changed queued-duplicate message.
- `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md`, `CHANGELOG.md`: the refusal, the suffix and `--relaunch`.

### Verification

Verify 1 to 6 are covered by the new tests in `ki agent launch of a name that has already run`, through `run(args, context)` and `sandbox()`: refusal naming the files and `fix-2`, with `fix`'s files unchanged; `fix-3` once `fix-2` is taken; a thread-folder report alone refusing; queue refusal and the dispatcher's launch of a queued agent; `--relaunch` into `fix.prev-1/` then `fix.prev-2/`, a committed report untouched and a dirty report refused with nothing changed; a draft launch unaffected.

On 16 October 2026: `bun run test:coverage` passed 72 files and 1197 tests at 100% statements, branches, functions and lines; `bunx tsc --noEmit -p .`, biome on the changed files, `bunx knip` and rumdl clean; `bun run ki:tools:lint-man` showed only the warnings present before this change. `ki repo audit --repo .` reports one failure outside this record: DEPS-1, `@types/node` 26.6.3 → 26.6.4 past the 14-day window, which needs a network install this run may not make. Its KNIP-2 failure came from the link printer's unused `RecordLink` type export and was fixed separately in `f27c2fb1`.

### Outstanding concerns

- DEPS-1 in `ki repo audit` predates this record and needs a dependency update with network access.
- `holdAgent` (`--foreground`) still does not pass through `launchAgent`'s checks, as Current state notes; out of this record's boundary.
- The `ki-delegation` run-packet table may add "names are unique within a run"; that line is the harness's.

### Post-change review

The refusal and the relaunch share one notion of "taken", so launch, queue and dispatch cannot disagree. Nothing is deleted: relaunch moves files and refuses rather than overwrite an uncommitted report. Pre-existing run folders keep working; a name that ran before this change is refused on reuse, which is the intended behaviour.

### Mini recap

Agent names are now unique within a run unless `--relaunch` is passed, and a relaunch keeps the earlier packet in `<name>.prev-<n>/`.

## Discussion

Origin: the `sol` bring-up, captured on Kris Brown's TOOL-RECORDS approval on 2026-10-14 (decision 70 in the thread's decisions log). Refusing is the simpler contract and keeps names meaningful in reply blocks and checkpoints; suffixing (`sol-fix-2`) is kinder to a coordinator relaunching after a failure. Either way the `ki-delegation` standard's run-packet table may want one line saying names are unique within a run. Capture only; adoption, priority and plan belong to this repository.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned and set Ready on 16 October 2026 under the tools-burndown thread's BURN-OVERNIGHT authority, refusing with a suffix suggestion and an explicit `--relaunch` (see Decision).

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against Decisions 1 to 4 and Verify 1 to 7. No code was changed and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Decisions:** `takenBy` and `refuseTaken` in `src/core/agent/runs.ts:304` refuse a taken name with the first free `<name>-<n>` from 2; `.queued.md` and `.draft.md` do not take a name; `setAside` refuses a dirty thread-folder report and otherwise moves the packet, the state-folder report and the log into the first free `<name>.prev-<n>/`, deleting nothing. `queueAgent` uses the same check.
- **Still holds after [KI-TOOL-KI-CLI-147](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-147-agent-state-folder-tooling.md):** agents now write their report in the state folder, and `packetFiles` already lists `report.md`, so a relaunch sets the earlier state-folder report aside; the thread-folder copy stays in Git.
- **Verify 1 to 6:** the contract tests in `src/tests/cli/agent.test.ts` cover each step through `run(args, context)` and `sandbox()`.
- **Verify 7:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc, biome, knip, mandoc and rumdl were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1, neither from this record. The DEPS-1 failure the delivery recorded no longer appears.
- **Observation, not blocking:** `holdAgent` (`--foreground`) still bypasses the check, as the record's Outstanding concerns say; it is outside the boundary.
