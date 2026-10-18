---
id: KI-TOOL-KI-CLI-137
area: CLI
title: Agent run temporary home
project: tools-burndown
purpose: capability
kind: deliver
component: agent
status: done
blocks: []
blocked_by: []
baseline_ref: c79ff4c6a9c5a019d8132f0c180ef52936eb3478
created_at: 2026-10-15T21:48:02Z
updated_at: 2026-10-18T08:53:02Z
---

# Agent Run Temporary Home

## Goal

`ki agent launch` creates `$TMPDIR/ki-agents/<run>/<name>/` and names it in the composed prompt, and `ki agent close` removes it, so a background agent's temporary output has one home outside every repository that does not outlive its run. The tools-ki state-folder tooling handed over under TOOLS-PUSH moved to [KI-TOOL-KI-CLI-147](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-147-agent-state-folder-tooling.md).

## Context

Kris Brown, in the ways-of-working thread on 15 October 2026, set where temporary output lives (THREADS-TMP-HOME): "Temporary output goes in <primary checkout>/tmp/<run>/<name>/ in the repository the agent works in, ignored and deleted when the run closes or they are superflous to requirements; machine-only scratch may stay in the state folder as <name>.work/." The same day (THREADS-CONTENT) Kris closed the thread folder's contents: "A thread folder holds a closed list, decisions.md and <name>.report.md only; briefs live in the state folder, work products in their owning home, temporary output in the temporary location." Kris asked for this record in THREADS-TELL: "Open one ki-agentic-harness record (closed list in the ki-delegation run packet, one run-prompt.md footer line, a ki-pmo rubric item) and one tools-ki record (ki agent launch creates tmp/<run>/<name>/, ki agent close removes it)."

Kris then set the temporary root on 17 October 2026 at 22:25 BST, in the tools-burndown thread (TMP-HOME): "Use $TMPDIR/ki-agents/<run>/<name>/ for KI-TOOL-KI-CLI-137." That follows the 16 October system-temp rule behind KI-HARNESS-GOV-196 and replaces THREADS-TMP-HOME's `<primary checkout>/tmp/` for this record. At 22:50 BST the same day, in the ways-of-working thread (TOOLS-PUSH), Kris added: "the tools-ki state tooling joins KI-TOOL-KI-CLI-137." The ways-of-working restart design names that tooling as the report path default (a run report written to the run's state folder), de-duplicated briefs, `_archive/` retention and sweep pruning.

What `ki` does today, observed at `86adda02`:

- **Launch.** `launchAgent` ([runs.ts:260](../../src/core/agent/runs.ts)) resolves the thread home, creates only the tracked thread folder for the report and writes the prompt and packet into the state folder; it makes no temporary folder and the prompt names none.
- **Close.** `closeRun` ([close.ts:199](../../src/core/agent/close.ts)) gates on the thread folder, then archives, compresses or deletes the state folder; nothing in a working checkout is touched.
- **Ignore.** This repository already ignores `tmp/`; other repositories may not, so launch cannot assume the folder is ignored.

## Boundary

- In: launch creating `$TMPDIR/ki-agents/<run>/<name>/` and passing its absolute path into the composed prompt beside the report path; close removing each `$TMPDIR/ki-agents/<run>/<name>/` folder its run's packets name and reporting each path removed; tests through `run(args, context)` and `sandbox()`; `README.md`, `man/ki.1`, the background-agents guide and `CHANGELOG.md`.
- Out: the TOOLS-PUSH state-folder tooling, now KI-TOOL-KI-CLI-147; the `<name>.work/` state-folder scratch, which already lives in the state folder; editing any repository's `.gitignore`; the closed thread-folder list, its run-packet and run-prompt wording and the ki-pmo rubric item, which the paired ki-agentic-harness record owns; removing an output earlier than close because it is superfluous, which stays the agent's own act.

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

The TOOLS-PUSH state-folder tooling moved to KI-TOOL-KI-CLI-147 (provisional, for Kris to confirm).

## Steps

- [x] Resolve the folder in one helper in `src/core/agent/context.ts`: `temporaryDirectory(context, run, name)` under `temporaryRoot(context, run)`, reading `TMPDIR` from the injected environment and falling back to `/tmp`.
- [x] `launchAgent`: create the folder (recursive), pass its absolute path into `composePrompt`, and add it to the agent's writable directories, so a held launch's hold process passes it on too.
- [x] `composePrompt`: name the folder in the progress protocol, beside the report sentence.
- [x] `closeRun`: list each non-empty agent folder under the run's temporary root as a blocker, which `--reconciled` waives; after the gate passes and before archiving, remove the run's temporary root, printing one `ok: removed <path>` line per agent folder in the output and the close note.
- [x] Split the TOOLS-PUSH state-folder tooling into KI-TOOL-KI-CLI-147.
- [x] Contract tests in `src/tests/cli/agent.test.ts`; the sandbox sets `TMPDIR` under its root.
- [x] `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md`, `CHANGELOG.md` and the `--reconciled` help text.

## Files touched

`src/core/agent/context.ts`, `runs.ts`, `close.ts`; `src/commands/agent/index.ts`; `src/tests/cli/agent.test.ts`, `_cli_helper.ts`; `README.md`; `man/ki.1`; `man/ki.commands.json`; `docs/guides/user/background-agents.md`; `CHANGELOG.md`.

## Verify

1. Launch creates `$TMPDIR/ki-agents/<run>/<name>/` under the injected `TMPDIR`, the composed prompt names it, and the runtime's writable directories include it, for Claude Code, Codex, a held launch's hold process and a launch from outside the owning repository; with `TMPDIR` unset the prompt names `/tmp/ki-agents/<run>/<name>/`.
2. Close refuses while an agent folder holds output and lists it, changing nothing; with `--reconciled` it waives that line, removes both agents' folders and lists each in its output and close note, leaving another run's folder alone.
3. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, Biome, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.

## Dependencies / blocks

- TMP-HOME answered on 17 October 2026: the root is `$TMPDIR/ki-agents/`. The TOOLS-PUSH state-folder tooling is KI-TOOL-KI-CLI-147.
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

KI-TOOL-KI-CLI-147 captures the TOOLS-PUSH state-folder tooling split out of this record.

## Review

### Delivered

Each launched agent gets `$TMPDIR/ki-agents/<run>/<name>/`, named in its prompt and writable; close refuses while one holds output, unless `--reconciled`, and then removes the run's temporary root.

### Change Summary

`context.ts` gains `temporaryRoot` and `temporaryDirectory`; `launchAgent` creates the folder, adds it to the writable directories and passes it to `composePrompt`; `closeRun` gains the temporary-folder gate line and the removal step; the `--reconciled` help, manual, README, guide and changelog say so.

### Verification

Two new and five updated public-CLI tests in `agent.test.ts`; the full coverage suite, `tsc`, Biome, mandoc, rumdl and `ki repo audit` pass.

### Outstanding concerns

Provisional choices, for Kris to confirm:

- Close derives each folder from `TMPDIR` at close time rather than recording it in `<name>.launch.json`, so a close run with a different `TMPDIR` from the launch would not see the folder. On macOS `TMPDIR` is fixed per user.
- `/tmp` is the fallback when `TMPDIR` is unset.
- An empty folder passes the gate silently.
- The TOOLS-PUSH tooling is split into KI-TOOL-KI-CLI-147.

The paired harness wording, KI-HARNESS-GOV-200 and KI-HARNESS-GOV-196, should name the same root.

### Post-change review

No repository is touched; launch only adds a directory and a sentence, and close removes only the run's own root under `ki-agents/` after the gate passes.

### Mini recap

Background agents now have a temporary folder outside every repository that the run's close checks and removes.

## Done

Accepted 2026-10-18 by Kris Brown on the review packet above and the independent review of 18 October, which found it ready for acceptance. In the ways-of-working walk-through Kris answered "Tools-sitting, yes, accepted", recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, batch 5") as TOOLS-SITTING a): accept the ten reviewed tools-ki records, then cut v0.11.1 and install it on this Mac. Kris accepted what is there, so any provisional call named under Outstanding concerns stands as delivered.

## Discussion

Capture only, on Kris Brown's explicit request in THREADS-TELL; adoption, priority and plan belong to this repository. Questions for planning: whether close removes the folder unconditionally or only when it holds nothing tracked; and whether launch should resolve the primary checkout from the workdir's Git common directory, so that a run in a linked worktree still writes to the primary checkout's `tmp/`.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned on 16 October 2026 in the tools-burndown thread as far as the open owner question allows: the Decision settles both planning questions above (close removes only a folder holding nothing tracked; launch resolves the primary checkout through the Git common directory) and leaves the temp root to Kris, because THREADS-TMP-HOME and the 16 October system-temp rule disagree. It stays draft until Kris chooses the root.

TMP-CLOSE answered on 16 October 2026 in the ways-of-working thread, by Kris Brown's ROUTINE answer taking option a): close lists each non-empty `tmp/<run>/<name>/` and keeps it under the strict close gate, with `--reconciled` as the owner's waiver; a draft that must survive is homed first, as an uncommitted change named in the report or committed in its owning repository. Decision 2, the close step and Verify 4 now say so. The record stays draft on TMP-HOME.

TMP-HOME answered on 17 October 2026 at 22:25 BST in the tools-burndown thread: "Use $TMPDIR/ki-agents/<run>/<name>/ for KI-TOOL-KI-CLI-137." The Goal, Boundary, Decision, Steps and Verify now use that root, and the option a) ignore warning and linked-worktree resolution are dropped. The same answer set (PUSH-REBASE-CODE) repointed the pair record to KI-HARNESS-GOV-200. TOOLS-PUSH (ways-of-working thread, 17 October 22:50 BST) added the tools-ki state-folder tooling to this record's boundary; it is captured, not planned, so the record stays draft.

Delivered on 18 October 2026 by the tools-burndown run under Kris Brown's overnight instruction to burn down the tools roadmap, after splitting the unplanned TOOLS-PUSH tooling into KI-TOOL-KI-CLI-147; the split and the choices under Outstanding concerns are provisional, for Kris to confirm.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against Decisions 1 to 3 and Verify 1 to 3. No code was changed and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Verify 1:** `src/tests/cli/agent.test.ts` asserts the folder under the injected `TMPDIR`, its sentence in the composed prompt, and `--add-dir` for it in the Claude Code, Codex and hold-process launches, with the `/tmp` fallback when `TMPDIR` is unset. Live: this review run's own prompt names `$TMPDIR/ki-agents/ways-of-working/ki-review/`, which `ki agent launch` created.
- **Verify 2:** the close test at `src/tests/cli/agent.test.ts:1176` refuses on a non-empty folder without changing it, waives it with `--reconciled`, removes both agents' folders, lists each removal and leaves another run's folder alone.
- **Verify 3:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc, biome, mandoc and rumdl were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1, neither from this record.
- **Observations, not blocking:** the Review packet's Verification gives no date, head or test counts, which this review supplies. The `TMPDIR`-unset test writes to the real `/tmp/ki-agents/<run>` and removes it afterwards, a small step outside the sandbox. The four provisional choices under Outstanding concerns still need Kris's confirmation.
