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
updated_at: 2026-10-16T21:35:00Z
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

Read at `bb446bb0` on 16 October 2026; the Context above still holds.

- `launchAgent` (`src/core/agent/runs.ts:260`) creates only the thread folder and writes the packet; `composePrompt` (`runs.ts:166`) names the status and report paths and no temporary folder. Each agent's working directory is recorded in `<name>.launch.json` (`workdir`).
- `closeRun` (`src/core/agent/close.ts:199`) gates, then archives, compresses or deletes the state folder; it touches no working checkout.
- **Conflicting owner rule.** After this record was captured, Kris decided on 16 October 2026, in the 5G Emerge Phase 3 thread, that "screenshots and other scratch output go in the system temp folder, never in a thread folder or repository", captured on `ki-agentic-harness` `origin/main` as KI-HARNESS-GOV-196 (`docs/roadmap/KI-HARNESS-GOV-196-scratch-output-in-temp.md`) (triage, not yet in the local harness checkout). That contradicts THREADS-TMP-HOME's `<primary checkout>/tmp/<run>/<name>/` "in the repository the agent works in". The path this record creates cannot be fixed until Kris reconciles the two.
- **Pair record.** The paired harness record exists only as an unpushed local commit in `ki-agentic-harness` under the identifier KI-HARNESS-GOV-195 (`f0f62c02`, `c068e4be`), and `origin/main` has already used KI-HARNESS-GOV-195 for a different record (Granola workflow). The pair's identifier will change when that session reconciles; this record names it by subject until then.

## Decision

Settled now, whichever location Kris chooses:

1. **One folder per agent**, `<temp root>/<run>/<name>/`, created at launch and named in the composed prompt beside the report path, in one sentence of the progress protocol.
2. **Close keeps a non-empty folder under the strict gate** (TMP-CLOSE). `ki agent close` lists each non-empty `<temp root>/<run>/<name>/` and refuses, as it does for any other unreconciled run output; `--reconciled` is Kris's waiver. A draft that must survive is homed first, as an uncommitted change named in the report or committed in its owning repository. Once the gate passes, close removes each agent's folder and reports each path removed; it never removes a folder that holds a Git-tracked file (only possible under a repository root) and reports that as a line, not a blocker.
3. **Linked worktrees** resolve to the primary checkout through `git rev-parse --git-common-dir`, if the root is a repository's `tmp/`.

Waiting on Kris (see Dependencies): the temp root. Option a) keeps THREADS-TMP-HOME, `<primary checkout>/tmp/`, with a launch warning when `tmp/` is not ignored. Option b) follows the 16 October rule, `$TMPDIR/ki-agents/` (as KI-HARNESS-GOV-196's Discussion suggests), which needs no ignore check and leaves every repository untouched.

## Steps

- [ ] Resolve the temp root per Kris's answer in one helper in `src/core/agent/context.ts` (`agentTempDirectory(context, request, thread)`), injected through `AgentContext` for tests.
- [ ] `launchAgent`: create the folder (recursive), pass its absolute path into `composePrompt`, and add it to the agent's writable directories; for option a), warn when `git check-ignore -q tmp/` fails in that checkout.
- [ ] `composePrompt`: name the folder in the progress protocol ("Temporary output goes in <path>; it is removed when the run closes").
- [ ] `closeRun`: list each non-empty agent folder recorded in the run's `<name>.launch.json` files as a gate finding, refusing without `--reconciled`; after the gate passes and before archiving, remove each agent folder recorded in the run's `<name>.launch.json` files, skipping any that holds a tracked file, and add one line per path to the close output and close note.
- [ ] Contract tests in `src/tests/cli/agent.test.ts` (see Verify).
- [ ] `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

`src/core/agent/context.ts`, `runs.ts`, `close.ts`; `src/tests/cli/agent.test.ts`; `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. Launch creates `<temp root>/<run>/<name>/`, the composed prompt names it, and the runtime's writable directories include it.
2. A run launched from a linked worktree resolves to the primary checkout's root (option a only).
3. Option a): launch warns, and still launches, when `tmp/` is not ignored.
4. Close refuses while an agent folder is non-empty and lists it; with `--reconciled` it removes both agents' folders and lists them in its output and close note; a folder holding a tracked file is left and reported; a failing gate removes nothing.
5. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- **Blocked on Kris (TMP-HOME):** THREADS-TMP-HOME (15 October) and the system-temp rule behind KI-HARNESS-GOV-196 (16 October) disagree on the temp root. Set Ready once the root is chosen; the Steps above need only the helper's body filled in.
- Pairs with the harness thread-folder record (local KI-HARNESS-GOV-195, to be renumbered) and with KI-HARNESS-GOV-196 (`docs/roadmap/KI-HARNESS-GOV-196-scratch-output-in-temp.md`); their run-prompt wording should name the same root. Neither is a `blocked_by`.
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
