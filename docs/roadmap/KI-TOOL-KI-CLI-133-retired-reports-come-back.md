---
id: KI-TOOL-KI-CLI-133
area: CLI
title: Retired reports come back
purpose: corrective
kind: deliver
horizon: now
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T23:40:00Z
updated_at: 2026-10-14T23:45:00Z
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

**Source, as read at `0fcc593`.** The only code that copies state-folder reports into the thread folder is `adoptStateFiles` in `src/core/agent/thread.ts`, added by `0fcc593` under [KI-TOOL-KI-CLI-132](KI-TOOL-KI-CLI-132-launcher-only-thread-writer.md). It lists the state folder's `decisions.md` and every `*.report.md`, skips a file only when `stat` finds the target already present in the thread folder, and otherwise copies it in and removes the state copy. A report the thread has deleted is therefore indistinguishable from one never copied, so it is copied again. Callers:

- `appendDecision` in `src/core/agent/thread.ts`, which serves `ki agent decide`;
- `gateLines` in `src/core/agent/close.ts`, which serves `ki agent close`.

`launchAgent` in `src/core/agent/runs.ts` does not call it: it creates the thread folder and gives the agent the report path `reportPath(thread, name)` in the thread folder, and nothing more. So the source at this commit does not explain a re-copy after `launch` alone, and it removes each state copy as it moves it, whereas the state folder was observed to keep every report. Either the installed `ki` (0.10.4, a local runner) predates or differs from `0fcc593` and mirrors reports on launch, or `decide` or `close` ran in between. Planning must settle which before choosing the fix.

Reproduce:

1. In a repository with a tracked `+/_THREADS/<run>/`, run `ki agent launch` for a run whose state folder holds `<name>.report.md`, and let the report reach the thread folder.
2. Commit, then delete `+/_THREADS/<run>/<name>.report.md` by explicit path in a second commit, as the tidy rule directs.
3. Run `ki agent launch <run> <other-name> ...`, then `ki agent decide` and `ki agent close` in turn, checking `git status` after each.
4. Expected today, by the source: after `decide` or `close` the deleted report is back as an untracked file wherever the state folder still holds it; whether `launch` alone does it is the open question above.

## Steps

- [ ] Settle from the installed `ki` and `0fcc593` which commands copy a report into the thread folder, and whether `launch` does.
- [ ] Make each such path leave a report the thread has retired alone, choosing among the candidate rules under Discussion.
- [ ] Add the contract tests under Verify, then update the documentation named below.

## Files touched

To be confirmed at planning; expected to be `src/core/agent/thread.ts`, `src/core/agent/close.ts`, possibly `src/core/agent/runs.ts`, and `src/tests/cli/agent.test.ts`.

## Verify

1. A contract test: a run whose state folder holds `a.report.md`, adopted once, then deleted from the thread folder, is not re-created by `launch`, `queue`, `decide`, `close` or `new`.
2. A report new since the last copy, or changed since it, is still delivered.
3. The pre-tracked migration `0fcc593` added still moves a legacy state-folder log and reports on the first use.
4. `bun run test:coverage` passes at 100%; `bunx tsc --noEmit`, `bunx biome check .` and `bunx knip` are clean.

## Dependencies / blocks

None. It amends behaviour delivered by [KI-TOOL-KI-CLI-132](KI-TOOL-KI-CLI-132-launcher-only-thread-writer.md), which is awaiting review.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

`man/ki.1`, `man/ki.commands.json`, `docs/guides/user/background-agents.md` and `CHANGELOG.md` where they describe the move of state-folder reports.

### Roadmap

None.

## Discussion

Captured as triage, then adopted into Now as a deliver record at the techne thread's request; planning is next. The background-agents guide, [Background agents](../guides/user/background-agents.md), describes the launcher's thread-folder writes.

Candidate rules for the expected behaviour, not decided here:

- copy a state-folder report only when it is new or changed since the run's last copy, recorded in the run's `thread.json` or beside it;
- copy a report only on the run's own completion, when the agent that wrote it finishes;
- stop adopting reports at all once a run's thread home is recorded, keeping adoption for the pre-tracked migration that `0fcc593` was written for.
