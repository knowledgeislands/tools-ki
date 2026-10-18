---
id: KI-TOOL-KI-CLI-133
area: CLI
title: Retired reports come back
project: tools-burndown
purpose: corrective
kind: deliver
status: done
blocks: []
blocked_by: []
baseline_ref: f0f2192251cad452fb0f4cb3b47c35ce79e32aaa
created_at: 2026-10-14T23:40:00Z
updated_at: 2026-10-18T08:53:02Z
---

# Retired Reports Come Back

## Goal

A report that a thread has retired from its tracked thread folder stays retired. `ki agent` never writes a report back into `+/_THREADS/<run>/` merely because a copy still sits in the run's state folder, so a thread that tidies its folder under the `ki-pmo` tidy rule does not see the reports return.

## Context

Adopted into Now under Kris Brown's decision of 14 October 2026 in the techne thread: "Capture the ki agent report re-copy defect in tools-ki as a triage record via a Sonnet agent, and tell state-of-play. I also feel that this needs some prioritization to it, because it's clearly a defect that would be good to get out of the way quickly." The priority is his: get it out of the way quickly.

Observed on 14 October 2026 by the techne thread, which coordinates the agent-host Project from the ki-principal repository. The thread retired 55 answered reports from `+/_THREADS/techne/` by explicit path in a commit and pushed it, as the `ki-pmo` rule "Tidying the thread folder" directs; Git history holds them. It then ran `ki agent launch --repo <ki-principal> techne <name> ...` twice. Afterwards all 55 retired reports were back in `+/_THREADS/techne/` as untracked files, while the run's state folder `~/.local/state/ki/agents/techne/` still held its `<name>.report.md` files. Every thread that tidies would see the same, and a careless `git add` of the folder would re-commit the reports.

## Boundary

- In: making every path that moves or copies a run's reports into the thread folder leave a retired report alone; contract tests through `run(args, context)`; the manual, user guide and changelog sentences that describe the move.
- Out: the thread's own tidy and commit of its folder, which stay the thread's; `decisions.md` handling beyond not regressing it; changes to the `ki-pmo` tidy rule; release.

## Current state

**Which build the installed `ki` runs.** `~/.local/bin/ki` links to `~/.local/bin/.ki-local-runner`, which executes `bun /Users/krisbrown/workspaces/knowledge-islands/tools-ki/src/main.ts`: the working tree's source, not a built release. `ki --version` prints 0.10.4, as `package.json` does. At planning, `main` was `634f73e`, clean and level with origin, so the installed `ki` and HEAD behave the same, and `0fcc593` is in them.

**Source, as read at `634f73e`.** The only code that copies state-folder reports into the thread folder is `adoptStateFiles` in `src/core/agent/thread.ts`, added by `0fcc593` under [KI-TOOL-KI-CLI-132](https://github.com/knowledgeislands/tools-ki/blob/c57d01e59fdf19d4fa42e53c7acef239b715faaf/docs/roadmap/KI-TOOL-KI-CLI-132-launcher-only-thread-writer.md). It lists the state folder's `decisions.md` and every `*.report.md`, skips a file only when `stat` finds the target present in the thread folder, and otherwise copies it in and removes the state copy. Callers: `appendDecision` (`ki agent decide`, unless `--log` is given) and `gateLines` in `src/core/agent/close.ts` (`ki agent close`). `launchAgent`, `queue` and `new` do not call it, so they cannot re-copy a report.

**Reproduced 2026-10-15 against the installed `ki`, in a throwaway setup.** A temporary Git repository (`git init`, one commit) under `/tmp`, `KI_STATE_HOME` pointed at a temporary directory, a state folder `agents/demo/` seeded with `a.report.md`, and `ki agent decide --repo <temp repo> demo "<text>"`. No real run, thread folder or checkout was touched; the setup is removed.

1. `decide` moved `a.report.md` into `+/_THREADS/demo/` and removed the state copy (the `0fcc593` migration working as designed). Committed the folder, then `git rm` of the report and a commit: tree clean.
2. `decide` again with no state copy: only `decisions.md` modified. No re-copy.
3. State copy put back (a state folder that still holds a report, as in the field), then `decide`: `Moved a.report.md from the state folder into .../+/_THREADS/demo` and `?? +/_THREADS/demo/a.report.md`. The retired report is back, untracked.
4. Retired again, state copy put back, `ki agent close demo`: the gate printed `ok: moved a.report.md from the state folder into +/_THREADS/demo`, `blocker: thread folder +/_THREADS/demo has uncommitted changes`, and the report is untracked again.

So `decide` and `close` both re-copy, and `launch` alone does not (source reading; the throwaway run did not launch an agent).

**Root cause.** Presence in the thread folder is the only test for "already delivered", so a retired report is indistinguishable from one never delivered. The state copy survives because the move removes it only when it moves it: a state folder kept copies when the thread (or an earlier `ki`) copied reports into the folder by hand before `0fcc593`, which fits the field case of 55 reports that the state folder still held. After the thread retired them, the next `decide` adopted all 55; a `launch` in between did not copy them, and the one later `decide` re-copied one more. The open question the draft raised is therefore settled: the field reports came from `decide`, not `launch`.

## Decision

Chosen rule: **adopt a state-folder file only when the thread folder has never held it.** "Held" means Git knows the path: `git log -1 --format=%H --all -- <path>` prints a commit, or `git ls-files -- <path>` lists it, run in the thread's repository. A file the folder has held is skipped and its state copy is left untouched, to be archived with the run by `ki agent close`, as the `0fcc593` comment already says of a superseded copy.

Why this over the candidates under Discussion:

- It covers the field case, where the state copies were never recorded anywhere; recording adopted names in `thread.json` (candidate 1) would not, since the legacy copies were never adopted by `ki`.
- It needs no new state and no change to `thread.json`, which keeps the run folder runtime-only.
- Stopping adoption once a home is recorded (candidate 3) would break the migration of a legacy log and reports for a run whose home is recorded by `decide` itself on the same call.
- Copying only on completion (candidate 2) has no signal today beyond the `DONE` line, and does not help a report already retired.

Known limit, stated in the guide: a shallow clone that lacks the history re-adopts a retired report; a report that was never committed and was deleted from the working tree is adopted again. Both leave the state copy in place and can be deleted by hand.

`adoptStateFiles` keeps its return value (names moved) and gains no new output, so `decide` and `close` print as they do now when nothing is adopted; a skipped file is not announced.

## Steps

- [x] In `src/core/agent/thread.ts`, add a helper that asks Git, through `git(context, home.repository, ...)` from `context.ts`, whether a thread-folder path is known (history or index), and have `adoptStateFiles` skip a file for which it says yes, as it already skips one that exists.
- [x] Confirm `close.ts` needs no change beyond the skip (its `gateLines` line prints only what `adoptStateFiles` returns); change `appendDecision` only if its `adopted` printout needs the new skip.
- [x] Add the contract tests under Verify to `src/tests/cli/agent.test.ts`, beside the legacy migration test at line 914.
- [x] Update `docs/guides/user/background-agents.md`, `man/ki.1` and `man/ki.commands.json` (the `decide` and `close` descriptions of the move) and the `CHANGELOG.md` entry under Unreleased.

## Files touched

`src/core/agent/thread.ts`; possibly `src/core/agent/close.ts` (comment only); `src/tests/cli/agent.test.ts`; `docs/guides/user/background-agents.md`; `man/ki.1`; `man/ki.commands.json`; `CHANGELOG.md`.

## Verify

1. Contract test, through `run(args, context)` with `sandbox()`: a run whose state folder holds `a.report.md`, adopted by `decide`, committed, deleted by a second commit, with the state copy put back, is not re-created by `decide`, and the same for `close` (its gate prints no `moved a.report.md` line and the folder stays clean); `launch`, `queue` and `new` leave it absent too.
2. The skipped state copy is still in the state folder after `decide` and `close`.
3. A report new since the last move (no Git history in the thread folder) is still delivered by `decide` and `close`, and a retired one beside it stays retired in the same call.
4. A report tracked and present in the thread folder is untouched, as today; a tracked report deleted in the working tree but not yet committed is not re-copied (index check).
5. The pre-tracked migration `0fcc593` added still moves a legacy state-folder log and reports on the first use (the existing test at `src/tests/cli/agent.test.ts:914` keeps passing unchanged).
6. `bun run test:coverage` passes at 100%; `bunx tsc --noEmit`, `bunx biome check .` and `bunx knip` are clean; `ki repo audit --skill ki-work-roadmap` and rumdl pass.
7. After delivery, repeat the throwaway reproduction above with the fixed source: steps 3 and 4 leave the tree clean.

## Dependencies / blocks

None. It amends behaviour delivered by [KI-TOOL-KI-CLI-132](https://github.com/knowledgeislands/tools-ki/blob/c57d01e59fdf19d4fa42e53c7acef239b715faaf/docs/roadmap/KI-TOOL-KI-CLI-132-launcher-only-thread-writer.md), accepted done and pruned.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

`man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md` where they describe the move of state-folder reports.

### Roadmap

None.

## Review

### Delivered

Within the approved boundary: `ki agent decide` and `ki agent close` no longer move a state-folder `decisions.md` or `<name>.report.md` into `+/_THREADS/<run>/` when Git knows the thread-folder path, in the index or in any commit reachable from a ref, so a report the thread has retired stays retired and its state copy stays to be archived with the run. Contract tests, manual, user guide and changelog updated. Out of scope and untouched: the thread's own tidy and commits, `decisions.md` handling beyond the shared rule, the `ki-pmo` tidy rule, and release. Immutable baseline `f0f2192251cad452fb0f4cb3b47c35ce79e32aaa`; the delivery is the single commit that sets this record to Awaiting review.

### Change Summary

- `src/core/agent/thread.ts`: new private `held` helper asks `git ls-files` and then `git log -1 --format=%H --all` in the thread's repository; `adoptStateFiles` skips a file it says is held, after the existing presence check. Its return value and output are unchanged, so a skipped file is not announced.
- `src/core/agent/close.ts`: no change needed; its gate prints only what `adoptStateFiles` returns, and `appendDecision` likewise needed no change.
- `src/tests/cli/agent.test.ts`: two contract tests beside the legacy migration test, covering `decide`, `close`, `launch`, `queue` and `new`.
- `man/ki.1` and the regenerated `man/ki.commands.json` (`decide` and `close`), `docs/guides/user/background-agents.md` (the move, the rule and its two known limits), and the `ki agent` entry of `CHANGELOG.md`. The changelog has no Unreleased section; it is a consolidated Pre-1.0 baseline, so the existing `ki agent` bullet was amended in place.
- Record: `project: tools-burndown` added under the tools-burndown thread's BURN-OVERNIGHT authority (RETIRED-REPORTS option a).

### Verification

1. Verify 1 to 4: the new test `leaves a report the thread has retired, delivering only one Git has never held` passes: a committed-then-retired `a.report.md` with its state copy put back is not re-created by `decide` or `close` (no `moved` line, `close` reports the folder committed and clean and exits 0); the state copy survives `decide` and is archived by `close`; a new `b.report.md` is delivered in the same `decide` call; a tracked present report is untouched; a report staged then deleted from the working tree is not re-copied (index check). The test `launch, queue and new never bring back a retired report` passes. With the `held` skip disabled the first test fails, so it guards the fix.
2. Verify 5: the legacy migration test passes unchanged.
3. Verify 6: `bun run test:coverage` 71 files, 1191 tests passed, 100% statements, branches, functions and lines; `bunx tsc --noEmit` clean; `bunx biome check .` no errors (26 warnings and 14 infos, none in the changed files, which check clean); `bunx knip` exit 0 (configuration hints only); `mandoc -T lint man/ki.1` clean; rumdl clean on the changed Markdown; `ki repo audit --skill ki-work-roadmap` PASS (15/15 criteria evaluated).
4. Verify 7: the throwaway reproduction repeated with the fixed source under `/tmp` with its own `KI_STATE_HOME`: step 3 left only `decisions.md` modified, and step 4 printed no `moved` line, reported the thread folder committed and clean, and archived the state copy of `a.report.md`. The setup was removed.

### Outstanding concerns

None. The two known limits, a shallow clone lacking the history and a report never committed before deletion, are stated in the guide as the Decision requires.

### Post-change review

The goal holds: the field case, a state folder still holding reports the thread retired by commit, no longer re-creates them on `decide` or `close`. Scope stayed within the listed files; `close.ts` needed no comment change. Regression risk is low: the new check runs only for a state-folder file absent from the thread folder, costs at most two local `git` calls per such file, and a failing `git` (for example a home that is no longer a repository) answers "not held", which keeps the previous behaviour. Ready for the owner's acceptance review.

### Mini recap

Delivered the "adopt only what Git has never held" rule for `ki agent decide` and `close`, with contract tests, docs and a clean full gate at 100% coverage; the field reproduction now leaves the tree clean. No concerns. Learning route proposed, not promoted: threads that tidy their folder can rely on `ki` again, which the tools-burndown and techne threads may note when they next tidy.

## Done

Accepted 2026-10-18 by Kris Brown on the review packet above and the independent review of 18 October, which found it ready for acceptance. In the ways-of-working walk-through Kris answered "Tools-sitting, yes, accepted", recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, batch 5") as TOOLS-SITTING a): accept the ten reviewed tools-ki records, then cut v0.11.1 and install it on this Mac. Kris accepted what is there, so any provisional call named under Outstanding concerns stands as delivered.

## Discussion

Captured as triage, then adopted into Now as a deliver record at the techne thread's request; planned on 15 October 2026 and set Ready for the owner's go-ahead to deliver. The background-agents guide, [Background agents](../guides/user/background-agents.md), describes the launcher's thread-folder writes.

Candidate rules considered, with the choice under Decision:

- copy a state-folder report only when it is new or changed since the run's last copy, recorded in the run's `thread.json` or beside it;
- copy a report only on the run's own completion, when the agent that wrote it finishes;
- stop adopting reports at all once a run's thread home is recorded, keeping adoption for the pre-tracked migration that `0fcc593` was written for.

The "changed since" part of the first candidate is dropped from this record: the agent writes into the thread folder, so a state copy that changes after delivery is not an expected case.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against its Decision and Verify 1 to 7. No code was changed and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Decision:** `held` in `src/core/agent/thread.ts:62` asks `git ls-files` and then `git log -1 --all` in the thread's repository, and `adoptStateFiles` skips a held file after the presence check, leaving its state copy, exactly as decided. `decide` and `close` reach the thread folder only through `adoptStateFiles`.
- **Verify 1 to 5:** the two contract tests at `src/tests/cli/agent.test.ts:1358` and `:1412` cover `decide`, `close`, `launch`, `queue` and `new`, the surviving state copy, a new report delivered beside a retired one, and the index check; the legacy migration test passes.
- **Verify 6:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc, biome, knip, mandoc and rumdl were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1, neither from this record. Verify 7's throwaway reproduction was not repeated; the contract tests reproduce it.
- **Observation for a later record, not this one:** `homeReport` in `src/core/agent/events.ts:158`, added afterwards by [KI-TOOL-KI-CLI-147](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-147-agent-state-folder-tooling.md), is a second path that copies a state-folder report into the thread folder, and it does not ask `held`. It is recorded in that record's review.
