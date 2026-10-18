---
id: KI-TOOL-KI-CLI-147
area: CLI
title: Agent state-folder tooling
project: tools-burndown
purpose: corrective
kind: deliver
component: agent
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: aa185bf7f56c97ba0e0bb4d61ecbbe978d29bb88
created_at: 2026-10-18T05:30:00Z
updated_at: 2026-10-18T07:36:00Z
---

# Agent State-Folder Tooling

## Goal

`ki agent` keeps the run state folder tidy without hand work: a run report defaults to the run's state folder, briefs are not stored twice, `_archive/` keeps a bounded history and a sweep prunes what has outlived it.

## Context

At 22:50 BST on 17 October 2026, in the ways-of-working thread (TOOLS-PUSH), Kris Brown said: "the tools-ki state tooling joins KI-TOOL-KI-CLI-137." The ways-of-working restart design names that tooling as:

- the report path default (a run report written to the run's state folder);
- de-duplicated briefs;
- `_archive/` retention;
- sweep pruning.

[KI-TOOL-KI-CLI-137](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-137-agent-run-tmp-home.md) carried it unplanned. The tools-burndown run split it out on 18 October 2026, so that the temporary home could be delivered on its own. The split is provisional, for Kris to confirm.

## Boundary

- In: the four items above, in `src/core/agent/` and its commands, with tests through `run(args, context)` and the manual, guide and changelog.
- Out: the temporary folder, which KI-TOOL-KI-CLI-137 delivers; and the thread-folder closed list and run-packet wording, which the harness owns.
- Adopted into Now on 18 October 2026 under fable-opinion-2: "KI-TOOL-KI-CLI-147, agent state-folder tooling... Adopt and plan provisionally, build to Awaiting review." The adoption is provisional, for Kris to confirm.

## Current state

Read at `aa185bf7` on 18 October 2026.

- **Report path.** `reportPath` (`src/core/agent/thread.ts:56`) is the tracked work or thread folder, and the progress protocol `composePrompt` writes (`src/core/agent/runs.ts:224`) names it, so each agent writes straight into the tracked folder. The harness standard (`ki-delegation` `standards-background-runs.md`, Run packet) now says "A run report is written to the run's state folder, and the launcher copies it into the owning work folder". `adoptStateFiles` already moves a state-folder report into the tracked folder at `decide` and `close`, unless the tracked folder holds it or Git ever has.
- **Briefs.** `queueAgent` copies the brief to `<name>.queued.md` (`runs.ts:478`) and `newPrompt` writes `<name>.draft.md` (`runs.ts:676`); the launch composes `<name>.prompt.md`, which holds the whole brief, and leaves the queued or draft copy in place. The live ways-of-working state folder holds about sixty `.queued.md` files, each a byte copy of a brief also held in that agent's `.prompt.md`.
- **`_archive/`.** `closeRun` (`src/core/agent/close.ts`) moves a closed run to `_archive/<run>/`, or writes `_archive/<run>.tar.gz` with `--compress`, or deletes it with `--delete`, and writes a close note (`_archive/<run>/close.md` or `_archive/<run>.close.md`). Nothing ever removes an archived run.
- **Sweep.** No verb removes anything from the state folders.

## Decision

All four answers are provisional, for Kris to confirm.

1. **Report default.** The progress protocol names `<state>/<name>.report.md`. When the launcher first observes the agent's `DONE`, it copies the report into the work or thread folder, so the coordinator reads and commits it there as before; it overwrites a tracked copy only when Git holds that copy unchanged, as after a relaunch. Readers keep looking in the tracked folder first, so an agent launched under the old protocol still reports where it was told. A brief that names the tracked copy draws no warning.
2. **One brief copy.** A launch from `<name>.queued.md` or `<name>.draft.md` removes that file once the runtime or hold process has started, because `<name>.prompt.md` then holds the brief. A failed launch keeps it. The coordinator's own brief, such as `briefs/<name>.md`, is never touched.
3. **Retention.** `_archive/` keeps the ten most recently closed runs, counted by run: a run's folder, tarball and close note go together. The age of a closed run is its close note's modification time.
4. **Sweep.** A separate verb, `ki agent sweep [--keep <n>] [--write]`, previews by default and with `--write` removes the archived runs beyond the newest `<n>` (default 10) and each open run's leftover `.queued.md` or `.draft.md` beside a `.prompt.md`. `close` stays as it is: it retires one run, and the sweep is the housekeeping across all of them.

## Steps

- [x] Core: `stateReportPath(context, run, name)` in `src/core/agent/thread.ts`; the progress protocol in `launchAgent` names it; `reportConflicts` accepts both the state and the tracked report paths.
- [x] Core: on an attempt's first observed `DONE` in `agentChanges` (`src/core/agent/events.ts`), copy the state-folder report into the tracked folder when it has none or Git holds its copy unchanged.
- [x] Core: `launchAgent` removes the `.queued.md` or `.draft.md` it launched from after a successful start.
- [x] Core: `sweepAgents` in a new `src/core/agent/sweep.ts`, returning the files it would remove or removed.
- [x] Command: `ki agent sweep [--keep <n>] [--write]` in `src/commands/agent/index.ts`.
- [x] Contract tests through `run(args, context)` and `sandbox()` (see Verify).
- [x] Documentation: `man/ki.1` and regenerated `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`.

## Files touched

- `src/core/agent/thread.ts`, `runs.ts`, `events.ts`, new `sweep.ts`
- `src/commands/agent/index.ts`
- `src/tests/cli/agent.test.ts`, `agent-events.test.ts`, new `agent-sweep.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md`, `CHANGELOG.md`

## Verify

1. A launched agent's prompt names `<state>/<name>.report.md`; a brief naming either that path or the tracked copy draws no warning, and any other path still does.
2. An agent that writes its report to the state folder and `DONE`: the next `ki agent wait` or `status` copies the report into the tracked folder, reports `done` and its queries; a tracked copy with uncommitted changes is left alone; an agent launched under the old protocol, with its report already in the tracked folder, is reported as before.
3. A launch from the queue or a draft leaves `<name>.prompt.md` and no `.queued.md` or `.draft.md`; a queued launch that fails keeps its `.queued.md`.
4. `ki agent sweep` previews the archived runs beyond `--keep` and the leftover briefs and changes nothing; `--write` removes exactly those; a folder, tarball and close note of one run go together; `--keep` rejects a value below 1.
5. Gates: `bun run test:coverage` at 100%, `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, the command-inventory check and `ki repo audit --repo .`.

## Dependencies / blocks

None open. [KI-TOOL-KI-CLI-137](KI-TOOL-KI-CLI-137-agent-run-tmp-home.md), awaiting review, delivered the temporary folder this record leaves out; the two touch the same launcher but neither needs the other.

## Documentation impact

### Decision Records

None; the state folder is a `tools-ki`-owned machine-local layout.

### Specifications

None. The harness's `ki-delegation` standard already says the report is written to the state folder and copied into the work folder; this record makes the launcher match it.

### Guides

`man/ki.1` (the `ki agent` section and FILES), `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md` (run packet and closing a run) and `CHANGELOG.md`.

### Roadmap

None.

## Review

### Delivered

The launcher now keeps the run state folder tidy without hand work. The progress protocol names `<state>/<name>.report.md`, and the first `status`, `watch` or `wait` that sees the agent's `DONE` copies the report into the tracked work or thread folder, leaving a tracked copy with changes Git does not hold. A launch from the run's `<name>.queued.md` or `<name>.draft.md` removes that copy once started, because `<name>.prompt.md` holds the brief. `ki agent sweep [--keep <n>] [--write]` previews, and with `--write` removes, closed runs in `_archive/` beyond the newest ten and leftover briefs beside a newer prompt.

### Change Summary

- `src/core/agent/runs.ts`: `stateReport`; the progress protocol names it; `reportConflicts` accepts the state report and the tracked copy; `launchAgent` removes its spent queued or draft brief after a successful start, in both the open and the held branch.
- `src/core/agent/events.ts`: `homeReport`, called on an attempt's first observed `DONE` before the report is read.
- `src/core/agent/sweep.ts` (new): `sweepAgents`, `expiredArchives`, `spentBriefs` and `archiveKept`.
- `src/commands/agent/index.ts`: the `sweep` verb.
- Tests: `src/tests/cli/agent.test.ts`, `agent-events.test.ts`, new `agent-sweep.test.ts`, and `src/tests/cli/manage/inventory.test.ts`.
- `man/ki.1`, `man/ki.commands.json`, `README.md`, `docs/guides/user/background-agents.md`, `CHANGELOG.md`.

### Verification

Verify 1 to 4 are covered through `run(args, context)` and `sandbox()`:

- the prompt names the state report; a brief naming the state report, the tracked copy by absolute or relative path draws no warning, and `docs/one.report.md` does, in launch and queue (`agent.test.ts`);
- a state-folder report reaches the tracked folder on the first `wait`, with its `done` and `needs-owner` events; an uncommitted hand-edited tracked copy stays; a committed earlier copy is replaced; the existing old-protocol tests, with reports written straight into the thread folder, pass unchanged (`agent-events.test.ts`);
- launches from a draft, from the queue and held from a draft leave no `.draft.md` or `.queued.md`; a queued launch the dispatcher cannot start keeps its `.queued.md` (`agent.test.ts`);
- the sweep on an empty agents directory, `_archive/` with folder, tarball-and-note, note-only, note-less and stray entries under `--keep 3` and `--keep 1 --write`, spent and kept briefs (newer draft, queued again, no prompt) in two runs, and `--keep 0` refused with exit 2 (`agent-sweep.test.ts`).

On 18 October 2026, `bun run test:coverage` passed 1321 tests at 100% statements, branches, functions and lines; `bunx tsc --noEmit`, `bunx biome check .` (no errors; its warnings predate this record), `bunx knip`, `mandoc -T lint man/ki.1`, the command-inventory check and rumdl were clean; and `ki repo audit --repo .` passed with FAIL=0 and two warnings, as at the baseline.

### Outstanding concerns

- All four Decision answers are provisional, for Kris to confirm: the copy on first observed `DONE` rather than at close only, removing the queued or draft copy at launch, a retention of ten closed runs, and a separate `sweep` verb.
- The copy happens only when a `status`, `watch` or `wait` runs after the agent's `DONE`; a run nobody observes gets its reports moved at `decide` or `close`, as before.
- The sweep was exercised only on sandbox fixtures. It has not been run against this host's real `~/.local/state/ki/agents/`, whose ways-of-working folder holds about sixty spent `.queued.md` files; running it there with `--write` is the owner's call.
- The live `ki` runs from this checkout, so agents launched after this commit write their reports in the state folder. Agents already running keep the thread-folder path their prompt names, which every reader still checks first.

### Post-change review

The change is additive for readers: `reportOf`, the relaunch check, the taken-name check and `adoptStateFiles` already looked in both places, so no reader needed changing. The harness standard's run packet and this launcher now agree on where a report is written.

### Mini recap

Agents now report into the state folder and `ki` files the copy for the coordinator; briefs are kept once; and `ki agent sweep` clears out old archived runs and spent briefs on request.

## Discussion

Open questions for planning:

- Where the run report defaults to when a thread folder exists.
- Which brief copies count as duplicates: the brief, the draft and the composed prompt.
- The retention limit for `_archive/`.
- Whether the sweep is a separate verb or part of `close`.

ki-burndown-3 adopted and planned this on 18 October 2026, answering the four questions in Decision provisionally, for Kris to confirm, and built it to Awaiting review the same day.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against Decisions 1 to 4 and Verify 1 to 5. No code was changed, the sweep was run only as a preview, and nothing was accepted.

- **Verdict:** one finding, minor; otherwise ready for acceptance.
- **Finding:** `homeReport` (`src/core/agent/events.ts:158`) writes the state-folder report into the tracked folder whenever no tracked copy is present, without the Git-history check `held` that [KI-TOOL-KI-CLI-133](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-133-retired-reports-come-back.md) added to `adoptStateFiles`. It runs on an attempt's first observed `DONE`, which is normally safe. A run whose `events.state.json` is lost, though, derives from empty ([KI-TOOL-KI-CLI-144](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-144-older-runs-start-seen.md)), and its next `status`, `watch` or `wait` writes back every report the thread has retired: the defect KI-TOOL-KI-CLI-133 closed. A fix might skip a held path unless the attempt is newer than the commit that retired it. Kris may also accept the rare path as it is.
- **Decisions otherwise:** the protocol names `<state>/<name>.report.md`; readers look in the tracked folder first; a launch removes its spent `.queued.md` or `.draft.md` only after a successful start; `sweepAgents` keeps ten closed runs by default, removing each run's folder, tarball and note together.
- **Verify 1 to 4:** covered through `run(args, context)` in `src/tests/cli/agent.test.ts`, `agent-events.test.ts` and `agent-sweep.test.ts`, as the Verification lists.
- **Verify 5:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc, biome, knip, mandoc and rumdl were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1.
- **Live, read-only:** `ki agent sweep` without `--write` listed spent briefs across this host's runs and changed nothing.
- **Observation, not blocking:** a long-lived `ki agent dispatch` keeps the code it started with. The ways-of-working dispatcher started at 06:36 BST, before this delivery's commit at 07:16 BST, and at 07:27 it launched this review under the old protocol: a tracked report path, and `ki-review.queued.md` left beside the prompt. Readers handle it, but the new behaviour reaches a run only once its dispatcher is restarted. Outstanding concerns could say so beside its note on running agents.
- **For Kris:** the four Decision answers are provisional.
