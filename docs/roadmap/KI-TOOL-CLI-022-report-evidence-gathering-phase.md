---
id: KI-TOOL-CLI-022
title: Report evidence gathering phase
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: d782f20d8a97c77f9d6d18958acfc2cf42d9b99e
---

## Goal

Make the repository-operation progress display account for the time an operation actually spends, by reporting the evidence-gathering phase that currently runs entirely unreported between planning and the first item.

## Context

This item was originally specified to weight the progress bar by learned per-item duration, on the assumption that rubric items differ enormously in cost and that a uniformly weighted bar therefore leaps and then parks. The assumption was wrong, and measuring it is what showed that.

An instrumented `ki repo audit --skill ki-engineering` against this repository divides as follows: loading the rubric definition takes 0.02 seconds, the session's evidence gathering takes 22.13 seconds, and the sum of all forty-two item durations is 0.00 seconds. A persisted weight table was implemented and run against this rubric; every item recorded either zero or one millisecond. Weighting items by observed duration would therefore weight a set of zeros, and the bar would still sit at nothing for twenty-two seconds before racing to complete. That implementation was reverted rather than shipped, because a learned cache that learns zeros adds an on-disk artifact and a maintenance burden for no observable change.

The time is not mysterious once located. The `ki-engineering` evidence collector runs six commands synchronously through one `execSync` helper before any item is evaluated: `bunx @biomejs/biome check`, `tsc --noEmit`, `bunx syncpack format --check`, `bunx knip --no-config-hints`, `bun outdated`, and `bun run test:coverage`. Process sampling across a run showed `bun run test:coverage` alive for thirty-three of forty-four samples, so the repository's own test suite accounts for the large majority of the twenty-two seconds. None of that is waste; it is the criterion doing exactly what it is specified to do. It is simply invisible.

The real shape of the problem is that the expensive work happens in one unreported block. A skill's session gathers its evidence up front, running the subprocesses that cost the time, and the items that follow merely inspect what it produced. Between the host announcing its plan and the first item reporting, nothing is emitted at all, so the display shows zero of forty-two items for the entire period during which the operation is doing all of its work.

## Boundary

This item does not reintroduce per-item duration weighting, which the measurement above rules out for the reference rubric. It does not change the rubric contract, which is portable and owned by the Harness, and it does not move execution off the main thread. Whether a session can report its own internal progress is the Harness's to decide; this item covers what the host can represent with the information it has, and what it would represent if the Harness offered more.

## Current state

The host reports `loading N/M definitions` while preparing skills, then announces its plan, then reports at each item edge. Session creation happens inside the first call into a prepared skill, after the plan is announced and before any item edge, and is invisible to the host except as elapsed time.

The display also could not refresh during that block, because the evidence gathering ran its subprocesses synchronously and held the event loop. That constraint is recorded separately in `KI-TOOL-CLI-027` and the Harness has now applied the fix, so the display does refresh during the block. This item remains about representing the phase, not about animating it, but the animation it produces is no longer inert.

The fourth step below is also answered. `TRD-dbcda0ce` carries `decision_status: applied` against harness commit `a6f7b2c3fb86fc4db74bc2e45a69b61aa85a0eca`: sessions now take an optional emitter reporting named stages and steps, and `ki-engineering` emits one step per external command. So the Harness can report progress within evidence gathering, the minimal contract that carries it exists, and this item's remaining work is to consume it rather than to establish whether it could exist.

That emitter is not in the CLI's canonical archive pin `501b40111aefa774aff49f10893dc235708a823c`, which predates it by 253 commits. Implementation here can proceed against a `ki dev local` checkout, but the feature only reaches users once the pin moves — the same external prerequisite `KI-TOOL-CLI-018` records.

## Steps

- [x] Report the transition into evidence gathering as its own phase, so the display names what is happening instead of showing a stalled item count. The host brackets `createSession` itself and renders `gathering evidence` for its whole duration, closing the span with a `gathering evidence done` frame before the first item edge.
- [x] Confirm by measurement how much of a representative operation falls inside that phase, for this repository and for at least one other, so the reporting is proportionate to reality rather than to this one rubric. Measured below: the share tracks the rubric's evidence cost, not the repository, and a rubric that gathers nothing expensive shows a phase of 0.0 s rather than a spurious one.
- [x] Decide what the bar should show while a single unreported block dominates the operation. The applied emitter answers it: a session that emits reports named stages and one step per external command, so the phase is determinate — step _k_ of _n_ within a named stage — and needs no indeterminate animation. Because the emitter postdates the archive pin, the host must render both cases: a determinate step count where the session emits, and a named phase with an indeterminate bar where it does not. The fallback is not a transitional shim but the permanent contract for a session that declines the optional emitter.
- [x] Establish whether the Harness could report progress within evidence gathering, and if it could, what minimal contract would carry it; capture the outcome rather than assuming it. It can: an optional session emitter reporting named stages and steps, with `ki-engineering` emitting one step per external command.
- [x] Keep the plain-stream form informative, since a phase transition is exactly the kind of event a log should carry. A plain stream gains one greppable line per transition — each stage edge and each step — and nothing else; only an interactive display ticks on the refresh timer.

## Files touched

- `src/core/rubric.ts` — the optional `emit` capability and the `RubricProgressEvent` shape a session reports through.
- `src/core/runtime.ts` — validation of a rubric-supplied event, and the host's own stage bracket around session construction.
- `src/core/repository-reporting.ts` — stage and step state, what the bar and the counters show inside an unmeasured span.
- `src/commands/repo/index.ts` — the event channel threaded to audit, conform, and the conform re-audit.
- `src/tests/cli/repo/progress-stages.test.ts` — coverage for the new phase through the CLI seam.
- `man/ki.1`, `CHANGELOG.md` — the user-visible change to what progress reports.

## Verify

Run an audit against a skill whose evidence gathering dominates, and confirm the display names that phase for its duration rather than showing an unchanging item count. Confirm the reported phase boundary matches the measured one, and that a fast rubric does not gain a spurious phase it spends no time in.

Re-run the phase measurement afterwards and confirm the reported structure matches where time is genuinely spent.

### Measured

`ki repo audit --skill <skill>` against this repository, and one other repository, on a quiet tree:

| Repository      | Skill            | Phase closes at | Operation total | Items |
| --------------- | ---------------- | --------------- | --------------- | ----- |
| `tools-ki`      | `ki-engineering` | 20.1 s          | 20.1 s          | 42    |
| `tools-ki`      | `ki-roadmap`     | 0.0 s           | 0.0 s           | 13    |
| `tools-ki`      | `ki-tools`       | 0.1 s           | 0.1 s           | 13    |
| `tools-ki`      | `ki-authoring`   | 0.2 s           | 0.2 s           | 5     |
| `mcp-git-audit` | `ki-roadmap`     | 0.0 s           | 0.0 s           | 13    |

The `ki-engineering` figure reproduces the 22.13 s originally recorded here, and confirms its shape: the phase accounts for the entire operation and the forty-two criteria for none of it. The reported boundary matches the measurement — the closing frame's clock equals the process wall time (19.5 s to 20.1 s across runs) — so the phase duration is measured, not asserted. The three fast rubrics gain no spurious phase: their span opens and closes within a tenth of a second and the item count takes over immediately.

The installed harness emits, so the run also exercises the emitter rather than the fallback: `ki-engineering` reports one step per external command — `biome check`, `tsc --noEmit`, `syncpack format (check)`, `knip`, `test:coverage` — and `test:coverage` alone holds the display from 1.2 s to 20.1 s. Because that session awaits between commands, the 250 ms refresh advances the clock throughout, which is the difference `KI-TOOL-CLI-027` records.

A subprocess-backed measurement in a second repository was deliberately not taken: `ki-engineering` evidence runs that repository's test suite, and this repository holds no authority to provoke build artefacts in a checkout another writer may hold. The second repository is therefore measured with a rubric that runs no subprocess, which is enough to show the share follows the rubric rather than the repository.

## Dependencies / blocks

Nothing local blocks this item, and the Harness dependency its fourth step raised is now resolved and applied. The host does not depend on it: it names the phase whether or not a session emits, so the CLI's canonical archive pin needs no move for this item to land. It overlaps `KI-TOOL-CLI-027`, which records that the display cannot refresh while an item or a session holds the event loop: naming the phase helps even while frozen, since a named phase that does not tick is still more informative than an item count that does not move.

## Review

Delivered in `8126021`. Coverage 100% on all four metrics across 4911 measured statements, with no ignore pragma added. Both paths are exercised: the fixture harnesses in `src/tests/cli/repo/` emit nothing and prove the host's own bracket, while the installed harness emits and was measured driving a determinate step count through five external commands.

Two aspects are worth flagging to a reviewer. Progress events are rubric-supplied and land directly in a terminal, so they are validated exactly as audit outcomes are and their labels have control characters stripped — a rubric is catalogue data from another repository, and a label may carry a path or a command line. Separately, the pinned frame expectations in `repo.test.ts` were updated rather than relaxed: every frame is still asserted at exactly 80 columns and the in-flight band still at 22, with the frame index moved to account for the two new stage frames.

The record's premise that implementation needed a `ki dev local` checkout proved wrong in one direction that matters. The host names the phase whether or not a session emits, so this item lands and helps users without the archive pin moving; only the determinate step count waits on the pin.

## Discussion

### Why the original premise failed

The rubric contract offers no way to declare what an item costs, and the natural inference was that cost must therefore be learned by observation. The inference was sound but the target was wrong: the cost is not distributed across items at all, it is concentrated in a phase the host never reports. Measuring before building is what surfaced that, and the measurement is recorded here so the same inference is not made again.

### Why not weight by session cost instead

Learning how long a skill's session takes and weighting whole skills by it would be the direct analogue of the reverted design, and it may be worth doing. It is deliberately not proposed yet, because a single-skill operation would gain nothing from it, and the multi-skill case should be measured before it is designed.
