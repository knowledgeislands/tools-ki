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
updated_at: 2026-10-18T02:46:11Z
---

# Agent Run Temporary Home

## Goal

`ki agent launch` creates `$TMPDIR/ki-agents/<run>/<name>/` and names it in the composed prompt, and `ki agent close` removes it, so a background agent's temporary output has one home outside every repository that does not outlive its run. The record also carries the tools-ki state-folder tooling handed over under TOOLS-PUSH.

## Context

Kris Brown, in the ways-of-working thread on 15 October 2026, set where temporary output lives (THREADS-TMP-HOME): "Temporary output goes in <primary checkout>/tmp/<run>/<name>/ in the repository the agent works in, ignored and deleted when the run closes or they are superflous to requirements; machine-only scratch may stay in the state folder as <name>.work/." The same day (THREADS-CONTENT) Kris closed the thread folder's contents: "A thread folder holds a closed list, decisions.md and <name>.report.md only; briefs live in the state folder, work products in their owning home, temporary output in the temporary location." Kris asked for this record in THREADS-TELL: "Open one ki-agentic-harness record (closed list in the ki-delegation run packet, one run-prompt.md footer line, a ki-pmo rubric item) and one tools-ki record (ki agent launch creates tmp/<run>/<name>/, ki agent close removes it)."

Kris then set the temporary root on 17 October 2026 at 22:25 BST, in the tools-burndown thread (TMP-HOME): "Use $TMPDIR/ki-agents/<run>/<name>/ for KI-TOOL-KI-CLI-137." That follows the 16 October system-temp rule behind KI-HARNESS-GOV-196 and replaces THREADS-TMP-HOME's `<primary checkout>/tmp/` for this record. At 22:50 BST the same day, in the ways-of-working thread (TOOLS-PUSH), Kris added: "the tools-ki state tooling joins KI-TOOL-KI-CLI-137." The ways-of-working restart design names that tooling as the report path default (a run report written to the run's state folder), de-duplicated briefs, `_archive/` retention and sweep pruning.

What `ki` does today, observed at `86adda02`:

- **Launch.** `launchAgent` ([runs.ts:260](../../src/core/agent/runs.ts)) resolves the thread home, creates only the tracked thread folder for the report and writes the prompt and packet into the state folder; it makes no temporary folder and the prompt names none.
- **Close.** `closeRun` ([close.ts:199](../../src/core/agent/close.ts)) gates on the thread folder, then archives, compresses or deletes the state folder; nothing in a working checkout is touched.
- **Ignore.** This repository already ignores `tmp/`; other repositories may not, so launch cannot assume the folder is ignored.

## Boundary

- In: launch creating `$TMPDIR/ki-agents/<run>/<name>/` and passing its absolute path into the composed prompt beside the report path; close removing each `$TMPDIR/ki-agents/<run>/<name>/` folder its run's packets name and reporting each path removed; the TOOLS-PUSH state-folder tooling (report path default, de-duplicated briefs, `_archive/` retention, sweep pruning), still to be planned; tests through `run(args, context)` and `sandbox()`; `README.md`, `man/ki.1`, the background-agents guide and `CHANGELOG.md`.
- Out: the `<name>.work/` state-folder scratch, which already lives in the state folder; editing any repository's `.gitignore`; the closed thread-folder list, its run-packet and run-prompt wording and the ki-pmo rubric item, which the paired ki-agentic-harness record owns; removing an output earlier than close because it is superfluous, which stays the agent's own act.

## Current state

Read at `bb446bb0` on 16 October 2026; the Context above still holds.

- `launchAgent` (`src/core/agent/runs.ts:260`) creates only the thread folder and writes the packet; `composePrompt` (`runs.ts:166`) names the status and report paths and no temporary folder. Each agent's working directory is recorded in `<name>.launch.json` (`workdir`).
- `closeRun` (`src/core/agent/close.ts:199`) gates, then archives, compresses or deletes the state folder; it touches no working checkout.
- **Owner rule reconciled.** Kris's 16 October system-temp rule (KI-HARNESS-GOV-196) contradicted THREADS-TMP-HOME's `<primary checkout>/tmp/<run>/<name>/`; TMP-HOME on 17 October settled it as `$TMPDIR/ki-agents/<run>/<name>/`.
- **Pair record.** The paired harness record is KI-HARNESS-GOV-200 (`docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md`, triage on `ki-agentic-harness` `origin/main`), renumbered from its earlier local KI-HARNESS-GOV-195.

## Decision

Settled:

1. **One folder per agent**, `$TMPDIR/ki-agents/<run>/<name>/` (TMP-HOME), created at launch and named in the composed prompt beside the report path, in one sentence of the progress protocol.
2. **Close keeps a non-empty folder under the strict gate** (TMP-CLOSE). `ki agent close` lists each non-empty `$TMPDIR/ki-agents/<run>/<name>/` and refuses, as it does for any other unreconciled run output; `--reconciled` is Kris's waiver. A draft that must survive is homed first, as an uncommitted change named in the report or committed in its owning repository. Once the gate passes, close removes each agent's folder and reports each path removed.
3. **No repository is touched.** The root sits outside every checkout, so launch needs no ignore check and no linked-worktree resolution.

Still to plan: the TOOLS-PUSH state-folder tooling, whose steps are not yet written.

## Steps

- [ ] Resolve `$TMPDIR/ki-agents/<run>/<name>/` in one helper in `src/core/agent/context.ts` (`agentTempDirectory(context, request, thread)`), reading `TMPDIR` from the injected environment, through `AgentContext` for tests.
- [ ] `launchAgent`: create the folder (recursive), pass its absolute path into `composePrompt`, and add it to the agent's writable directories.
- [ ] `composePrompt`: name the folder in the progress protocol ("Temporary output goes in <path>; it is removed when the run closes").
- [ ] `closeRun`: list each non-empty agent folder recorded in the run's `<name>.launch.json` files as a gate finding, refusing without `--reconciled`; after the gate passes and before archiving, remove each agent folder recorded in the run's `<name>.launch.json` files and add one line per path to the close output and close note.
- [ ] Plan the TOOLS-PUSH state-folder tooling (report path default, de-duplicated briefs, `_archive/` retention, sweep pruning) through `ki-plan` and add its steps here.
- [ ] Contract tests in `src/tests/cli/agent.test.ts` (see Verify).
- [ ] `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

`src/core/agent/context.ts`, `runs.ts`, `close.ts`; `src/tests/cli/agent.test.ts`; `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. Launch creates `$TMPDIR/ki-agents/<run>/<name>/` under the injected `TMPDIR`, the composed prompt names it, and the runtime's writable directories include it.
2. Close refuses while an agent folder is non-empty and lists it; with `--reconciled` it removes both agents' folders and lists them in its output and close note; a failing gate removes nothing.
3. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- TMP-HOME answered on 17 October 2026: the root is `$TMPDIR/ki-agents/`. The record stays draft until the TOOLS-PUSH state-folder tooling is planned.
- Pairs with the harness thread-folder record KI-HARNESS-GOV-200 (`docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md`) and with KI-HARNESS-GOV-196 (`docs/roadmap/KI-HARNESS-GOV-196-scratch-output-in-temp.md`); their run-prompt wording should name the same root. Neither is a `blocked_by`.
- Shares `src/core/agent/runs.ts` with [KI-TOOL-KI-CLI-135](KI-TOOL-KI-CLI-135-reused-agent-name-overwrites.md) (deliver first) and [KI-TOOL-KI-CLI-134](KI-TOOL-KI-CLI-134-launch-footer-follows-brief.md).

## Documentation impact

### Decision Records

None in `tools-ki`; the location rule is owned by the harness `ki-delegation` standard.

### Specifications

None.

### Guides

`README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`: the temporary folder and its removal at close.

### Roadmap

None.

## Discussion

Capture only, on Kris Brown's explicit request in THREADS-TELL; adoption, priority and plan belong to this repository. Questions for planning: whether close removes the folder unconditionally or only when it holds nothing tracked; and whether launch should resolve the primary checkout from the workdir's Git common directory, so that a run in a linked worktree still writes to the primary checkout's `tmp/`.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned on 16 October 2026 in the tools-burndown thread as far as the open owner question allows: the Decision settles both planning questions above (close removes only a folder holding nothing tracked; launch resolves the primary checkout through the Git common directory) and leaves the temp root to Kris, because THREADS-TMP-HOME and the 16 October system-temp rule disagree. It stays draft until Kris chooses the root.

TMP-CLOSE answered on 16 October 2026 in the ways-of-working thread, by Kris Brown's ROUTINE answer taking option a): close lists each non-empty `tmp/<run>/<name>/` and keeps it under the strict close gate, with `--reconciled` as the owner's waiver; a draft that must survive is homed first, as an uncommitted change named in the report or committed in its owning repository. Decision 2, the close step and Verify 4 now say so. The record stays draft on TMP-HOME.

TMP-HOME answered on 17 October 2026 at 22:25 BST in the tools-burndown thread: "Use $TMPDIR/ki-agents/<run>/<name>/ for KI-TOOL-KI-CLI-137." The Goal, Boundary, Decision, Steps and Verify now use that root, and the option a) ignore warning and linked-worktree resolution are dropped. The same answer set (PUSH-REBASE-CODE) repointed the pair record to KI-HARNESS-GOV-200. TOOLS-PUSH (ways-of-working thread, 17 October 22:50 BST) added the tools-ki state-folder tooling to this record's boundary; it is captured, not planned, so the record stays draft.
