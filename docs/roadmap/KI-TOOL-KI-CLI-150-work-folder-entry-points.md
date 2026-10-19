---
id: KI-TOOL-KI-CLI-150
area: CLI
title: Work folder entry points
project: ways-of-working
purpose: corrective
kind: deliver
component: agent
status: done
blocks: []
blocked_by: []
baseline_ref: b263ca455dff26555583317e5123104ae46a0f39
created_at: 2026-10-18T10:26:00Z
updated_at: 2026-10-19T07:18:00Z
---

# KI-TOOL-KI-CLI-150: Work Folder Entry Points

## Goal

`ki agent` keeps an agent's report out of the work folder, as the `ki-work-folder` standard and the `ki-delegation` run packet set: the run skeleton names the run's state-folder report path, and `ki agent launch` and `ki agent queue` refuse a brief that sends the agent's own report into `+/_WORK/<id>/`, the launcher alone homing it there.

## Context

Kris Brown made `ki-work-folder` the canonical specification of the work folder on 18 October 2026, in the ways-of-working decisions log under "owner answers, Summary queries; mark", with "Yep, and the workflow checks we can go with", read back as:

- WORK-FOLDER-OWNER a): "the work-folder skill is the canonical specification; ki-coordination timing and judgement; ki-delegation run side only; ki-work-design graduation; others check in on the four-point contract."
- WORK-FOLDER-CHECKS a): "audit checks into KI-HARNESS-GOV-200; one new tools-ki record for the close-gate parse, unnumbered `decide`, launch refusal and `ki work message`/`prune`." The same answer settles DECIDE-NUMBERS a).

The harness wording landed under [KI-HARNESS-GOV-217](https://github.com/knowledgeislands/ki-agentic-harness/blob/87da1b262fcc60678a31850461dd63c4a848e592/docs/roadmap/KI-HARNESS-GOV-217-coordination-and-work-design-renames.md): the [work-folder standard](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-work-folder/references/standards-work-folder.md#the-work-folder) owns the closed list, entry points, tidy rules and Messages line shape, and the `ki-delegation` [run packet](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-delegation/references/standards-background-runs.md#run-packet) says an agent writes its report to the run's state folder and nowhere else, the launcher homing it.

Kris Brown answered CLI-150-LAUNCH on 18 October 2026, recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) under "owner answers, re-bootstrap queries" (20:33 BST) with "do all the recommended items, we just need to move forwards", read back as "planning run to Ready, common rules move first". The recommended option it takes: "One planning run makes the launch part Ready with the harness wording. The coordinators' common rules move to the state-folder path first, and then the refusal ships in the next release." The close-gate parse, unnumbered `decide`, `ki work message` and `ki work prune` were left unplanned and split out to [KI-TOOL-KI-CLI-152](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-152-work-folder-housekeeping-commands.md), because a Ready record is planned whole.

- **Retired homes (built):** a run whose `thread.json` recorded `+/_THREADS/<run>/` kept copying its reports there, because `newRunFolder` fell back to the thread folder and matched a work folder only by its full slug, so the `chezmoi` run never found `ki.chezmoi`. Kris named the result THREADS-REGRESSION on 18 October 2026, in the ways-of-working decisions log under "owner answers, recap batch", after `+/_THREADS/chezmoi/host-locals-sol.report.md` reappeared in Knowledge Islands Principal at 09:19 BST.

## Boundary

- In (tools-ki): `ki agent new` filling `<report path>` with the run's state-folder report path; `launch` and `queue`, including a relaunch and a dispatcher launch, refusing a brief that names this agent's `<name>.report.md` inside a `+/_WORK/<id>/` folder; the manual, guide, changelog and tests that follow.
- In (ki-agentic-harness, a direct commit under CLI-150-LAUNCH): the run-prompt wording, so the skeleton's report line says the path is in the run's state folder and nowhere else, and the background-run standard's prompt shape says the same.
- In (coordinators, before the release): each live coordinator's common rules and queued briefs naming the state-folder report path, so no live brief is refused.
- In, built by the `threads-fix` run under THREADS-REGRESSION and released in `ki` v0.11.3: a run names its work folder by its slug or, for a run named before the slug, its id after the territory; a run that names none or two is refused, with no `+/_THREADS/<run>/` fallback; a recorded `+/_THREADS/` home is followed into that work folder and recorded there, and one with none stays readable but takes no launch, decision, reconcile, adopted state file or homed report; the run skeleton fills `+/_WORK/<id>` with the run's work folder; `ki agent status` and `ki agent home --work` say "work folder" for "thread home"; manual, changelog and tests follow.
- Out: the close-gate parse, unnumbered `decide` and `reconcile`, `ki work message` and `ki work prune`, which KI-TOOL-KI-CLI-152 carries; the rubric checks, which [KI-HARNESS-GOV-200](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md) owns; refusing a report path a brief reaches only through a file it points to, such as a common-rules file; the launcher's homing of the report, which stays; the CLI side of the skill rename, which [KI-TOOL-KI-CLI-148 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/a22214ee581b73a1f395da88f9a118ad89814bb9/docs/roadmap/KI-TOOL-KI-CLI-148-coordination-rename-cli-side.md) carried; the release itself, which the next `ki` release makes under `ki-repo-tools`.

## Current state

Read at `06caa2ab` on 18 October 2026.

- The progress protocol already names the state-folder path: `launchAgent` passes `stateReport(directory, name)` to `composePrompt` (`src/core/agent/runs.ts:106`, `:387`), and the protocol says that path governs.
- `reportConflicts` (`runs.ts:112`) warns on each other path to this agent's `<name>.report.md` but exempts any path ending `${thread.folder}/${name}.report.md`, so a brief sending the report into the work folder launches silently. `launchAgent` (`:386`) and `queueAgent` (`:494`) return its warnings, which `src/commands/agent/index.ts:148` and `:168` print and exit 0.
- `newPrompt` (`runs.ts:697`) fills `<report path>` with `${thread.folder}/${name}.report.md`, the work folder, so every `ki agent new` draft names the path the refusal will reject.
- The harness skeleton's report line, generated from the `run-report` source in the [ki-coordination standard](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/change-management/ki-coordination/references/standards-coordination.md) into `skills/governance/ki-delegation/assets/run-prompt.md` by `ki dev skill generate ki-coordination --write`, says only "**Report** to `<report path>`". The background-run standard's prompt shape lists "the report path" without saying where.
- Live briefs: of the coordinators' state folders under `~/.local/state/ki/agents/`, only ways-of-working keeps a common-rules file, `_common-1018b.md`, whose report line is "Write your run report to `$D/<your name>.report.md`". Its queued `roadmap-next.queued.md` names its own report inside `+/_WORK/ki.ways-of-working/`, so it would be refused once the refusal ships; five other queued briefs there point at the common rules.
- KI-TOOL-KI-CLI-134 (in progress) delivered the warning and the protocol's "governs" sentence; its Verify 3 says a brief naming the thread-folder path draws no warning, which this record replaces with a refusal.

## Decision

1. **What is refused.** A path in the brief body ending `/<name>.report.md`, for this agent's own name, whose folder is the run's work folder (`thread.folder`, absolute or as written) or any `+/_WORK/<id>/` folder. A brief may still cite other agents' reports there. A bare `<name>.report.md` names no folder and is neither refused nor warned. Every other differing path keeps the CLI-134 warning.
2. **How it is refused.** `KiError` with exit 1, before anything is written: "the brief sends the report to `<path>`; an agent reports only to `<state-folder report>`, and the launcher homes it in `<work folder>`". `queue` refuses the same way and leaves the queue unchanged. A brief queued before the refusal shipped and refused at dispatch becomes the launch failure the dispatcher already records as `failed`, and the queue moves on.
3. **Order.** The harness wording lands first, then the coordinators' common rules and queued briefs move to the state-folder path, then the refusal is built and ships in the next `ki` release. The skeleton fill may ship before the refusal; the refusal never ships before the coordinators have moved.

## Steps

- [x] **Harness wording (ki-agentic-harness).** In the `run-report` source of `skills/change-management/ki-coordination/references/standards-coordination.md`, change "**Report** to `<report path>` as an owner report" to "**Report** to `<report path>`, in the run's state folder and nowhere else, as an owner report"; regenerate with `ki dev skill generate ki-coordination --write`, so `skills/governance/ki-delegation/assets/run-prompt.md` follows. In `standards-background-runs.md` Prompt shape, item 4 becomes "the report path, in the run's state folder; the launcher homes the report in the work folder". Commit through the harness gate under `docs(ki-delegation): name the state-folder report path in the run prompt`, and push.
- [x] **Coordinators move (before the refusal ships).** The ways-of-working coordinator changes its common rules' report line to "Write your run report to `~/.local/state/ki/agents/<run>/<your name>.report.md`; the launcher homes it in `$D`", and rewrites `roadmap-next.queued.md`'s report path the same way. Each other live work whose coordinator keeps common rules or queued briefs gets a Messages line asking for the same move. Recorded in the ways-of-working work file before the release.
- [x] **Skeleton fill.** `newPrompt` fills `<report path>` with `stateReport(runDirectory(context, run), name)`.
- [x] **Refusal.** Split `reportConflicts` into a refusal check and the existing warning: `refusedReport(body, thread, name)` returns the first work-folder path to this agent's report, under Decision 1; `launchAgent`, before `mkdir` or any write, and `queueAgent`, before `copyFile`, throw under Decision 2. The warning keeps every other differing path and drops the work-folder exemption it no longer needs.
- [x] **Tests** through `run(args, context)` in `src/tests/cli/agent.test.ts`: the cases in Verify 1 to 5, with the fixture skeleton carrying the new report-line wording.
- [x] **Docs.** `man/ki.1` (`agent launch`, `agent queue`, `agent new`), `docs/guides/user/background-agents.md` and `CHANGELOG.md` (Unreleased) describe the state-folder path and the refusal; regenerate `man/ki.commands.json` if any help text changes.

## Files touched

tools-ki: `src/core/agent/runs.ts`; `src/tests/cli/agent.test.ts`; `man/ki.1`; `man/ki.commands.json` if help text changes; `docs/guides/user/background-agents.md`; `CHANGELOG.md`. ki-agentic-harness: `skills/change-management/ki-coordination/references/standards-coordination.md`; `skills/governance/ki-delegation/assets/run-prompt.md` (generated); `skills/governance/ki-delegation/references/standards-background-runs.md`. Coordinator state: `~/.local/state/ki/agents/ways-of-working/_common-*.md` and its queued briefs, outside Git.

## Verify

1. `ki agent new <run> one` writes a draft whose report line names `<state root>/agents/<run>/one.report.md` and no `+/_WORK/` report path.
2. A brief naming `<work folder>/one.report.md`, absolute or as `+/_WORK/<id>/one.report.md`, makes `ki agent launch` and `ki agent queue` exit 1 with the Decision 2 message; no pid, prompt, launch file, temporary folder or queue entry is written. A relaunch refuses the same way.
3. A brief that cites `<work folder>/other.report.md` launches with no warning; one naming `docs/one.report.md` warns as before; one naming only the state-folder path or a bare `one.report.md` draws neither.
4. A brief already queued with a work-folder report path is refused at dispatch, recorded as a `failed` event carrying the refusal, and the next queued agent launches.
5. The harness generated-surfaces check passes, and the skeleton's report line carries "in the run's state folder and nowhere else".
6. Before the release: no `_common-*.md` or `*.queued.md` under `~/.local/state/ki/agents/` names its own agent's report inside `+/_WORK/<id>/`.
7. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean; the harness gate clean.

## Dependencies / blocks

- The refusal ships only after Step 2; the release that carries it checks Verify 6 first.
- Shares `src/core/agent/runs.ts` and the report-path tests with [KI-TOOL-KI-CLI-134](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-134-launch-footer-follows-brief.md) (in progress, open grants Step); either order works, the second rebasing on the first, and this record's Verify 2 supersedes the thread-folder clause of its Verify 3.
- [KI-HARNESS-GOV-200](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md) plans a `run-prompt.md` footer line saying the agent writes nothing else into `+/_WORK/<id>/`; Step 1 here touches only the report line, so the two do not conflict.

## Delegation

One background run can take Steps 3 to 6 in tools-ki and Step 1 in ki-agentic-harness, with push authority for both; Step 2 is the coordinator's, not a run's.

## Documentation impact

### Decision Records

None; the report-path rule is the `ki-delegation` standard's.

### Specifications

None.

### Guides

`man/ki.1`, `docs/guides/user/background-agents.md` and `CHANGELOG.md`: the state-folder report path and the refusal.

### Roadmap

KI-TOOL-KI-CLI-152 carries the split-out parts.

## Review

### Delivered

The launch part, within the boundary above, from baseline `b263ca45` on 19 October 2026 by the `cli150-deliver` run, under the HARNESS-DIRECT a) answer in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, Summary queries", 19 October, 07:48 BST). Excluded as planned: KI-TOOL-KI-CLI-152's parts, the GOV-200 rubric checks, refusing paths a brief reaches only through a file it points to, and the release.

### Change Summary

- ki-agentic-harness `1fe52516`, pushed: the `run-report` source in `standards-coordination.md` and the regenerated `run-prompt.md` say "in the run's state folder and nowhere else"; Prompt shape item 4 in `standards-background-runs.md` names the state folder and the launcher's homing.
- Coordinator state, outside Git: in `~/.local/state/ki/agents/ways-of-working/`, the report lines of `_common-1016.md`, `_common-1018.md` and `_common-1018b.md`, and of the queued `roadmap-next.queued.md` and `migrate-apply.queued.md`, now name `~/.local/state/ki/agents/ways-of-working/<name>.report.md`, the launcher homing it, and no longer ask the agent to commit it. `work-folder-design.queued.md` named no report path. No other coordinator's state folder keeps common rules, and its queued briefs already named state-folder paths, so no Messages line was needed.
- `src/core/agent/runs.ts`: `reportPaths` collects the brief's paths to the agent's report; `refuseWorkReport` throws under Decision 2 for one in the run's work folder, absolute or as written, or any `+/_WORK/<id>/`; `launchAgent` and `queueAgent` call it before the thread home is recorded or anything else is written, so a relaunch and a dispatcher launch refuse too; `reportConflicts` drops the work-folder exemption; `newPrompt` fills `<report path>` with `stateReport`.
- `src/tests/cli/agent.test.ts`: the fixture skeleton carries the new wording; new tests for the refusal (absolute, as written, another work folder; launch, queue and relaunch; nothing written) and for a dispatcher refusal recorded as `failed`; the warning test covers a cited other report and a bare name.
- `man/ki.1`, regenerated `man/ki.commands.json`, `docs/guides/user/background-agents.md` and the `CHANGELOG.md` baseline bullet describe the state-folder path and the refusal.
- Deviation: the refusal resolves the thread home without recording it, so a refused first launch leaves no `thread.json`; Decision 2's "before anything is written" needed it.

### Verification

1. `ki agent new` draft names the state-folder report path: passed (`writes a prompt skeleton once`).
2. Work-folder report path refused by launch, queue and relaunch with exit 1, nothing written: passed.
3. Cited other report, warned `docs/` path, bare name: passed.
4. Queued brief refused at dispatch as `failed`, next agent launched: passed.
5. `ki dev skill generate ki-coordination`: 7 generated surfaces in sync; the skeleton carries the wording; harness commit gate and skill audit passed.
6. No `_common-*.md` or `*.queued.md` under `~/.local/state/ki/agents/` names its own agent's report inside `+/_WORK/<id>/`: passed by search.
7. `bun run test:coverage`: 1,350 tests passed, coverage thresholds met; `bunx tsc --noEmit`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` (FAIL=0, WARN=3) clean; command inventory in sync. `biome check .` fails on files this change does not touch (see below); the changed files pass Biome.

### Outstanding concerns

- `biome check .` fails at baseline: the installed and declared Biome is 2.5.15 while `biome.json` pins the 2.5.12 schema, and lint findings stand in untouched files such as `src/core/kb/contract.ts` and `src/commands/acquire/index.ts`. CI does not run it; outside this record's scope.
- Step 2's note in the ways-of-working work file is the coordinator's to make; this run did not write the work file.
- The refusal must not ship before the coordinators' move is confirmed (Verify 6), which the next release checks again.

### Post-change review

The goal holds: the skeleton names the state-folder path, and a brief sending the agent's own report into a work folder is refused at every launch entry point before any write. Scope held, with one deviation recorded above. Regression risk is low: the warning path is unchanged apart from the exemption, and other agents' reports in a work folder stay citable. Ready for review.

### Mini recap

Harness wording pushed, the ways-of-working common rules and queued briefs moved, and the tools-ki refusal and skeleton fill built with tests and docs. Not released. Learning route for review: the Biome schema drift could go to a small tools-ki chore record through `ki-next`.

## Done

Accepted 2026-10-19 as delivered (tools-ki `949ff512`, ki-agentic-harness `1fe52516`) by Kris Brown's CLI-150-ACCEPT a), recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) under "owner answers, mark recap" (19 October, 08:14 BST): "do all recommendations including any pushes needed", on the clean independent review by the `review-cli150` run. Re-checked on 19 October at `c2a9a062`, after the Biome drift was cleared: `bun run test:coverage` passed 1350 tests with thresholds met, and `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip` and `mandoc -T lint man/ki.1` passed, which closes the first Outstanding concern; the review confirmed the work file records Step 2, which closes the second.

Known limits, accepted as they stand rather than carried as follow-up records:

- Only a report placed directly in a work folder is refused; a brief naming `+/_WORK/<id>/design/<name>.report.md`, `+/_WORK_REVIEW/...` or `$D/<name>.report.md` draws the warning, not a refusal, as Decision 1 allows.
- When the dispatcher refuses a queued brief, its `<name>.queued.md` copy stays in the state folder, as it does after every other dispatcher launch failure; it does not take the name.
- For a run whose recorded home is a retired `+/_THREADS/<run>/` with no work folder to follow, the refusal says the launcher homes the report there, rather than that the run names no work folder; nothing is written and the brief is still refused.

## Discussion

Captured by the `work-folder-rename` run in the ways-of-working work on Kris Brown's WORK-FOLDER-CHECKS answer, as its one new tools-ki record. The `threads-fix` run built the retired-home part on 18 October 2026, and `ki` v0.11.3 released it that evening; before then the installed `ki` kept copying reports into the `+/_THREADS/` home of every run group recorded there. The `ki-release` run left the launch part for a later release, because the refusal would reject the live coordinators' common rules, which still send reports to `+/_WORK/<id>/<name>.report.md`.

Adopted as deliver / Now and planned to Ready on 18 October 2026 by the `cli150-plan` run under CLI-150-LAUNCH a), which approves both; the rest of the record moved to KI-TOOL-KI-CLI-152. Provisional, for Kris to confirm: the harness wording lands as a direct harness commit under the same answer rather than through a harness record, and the refusal covers only paths in the brief body, so the coordinators' move in Step 2 is what clears the common-rules files.
