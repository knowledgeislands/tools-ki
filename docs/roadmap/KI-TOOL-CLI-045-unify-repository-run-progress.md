---
id: KI-TOOL-CLI-045
title: Unify repository run progress
area: CLI
theme: cli
horizon: now
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Give `ki repo audit` and `ki repo conform` one honest progress model: the same phase and per-skill evidence presentation, timings that agree with the total they sit beside, and tree punctuation that closes the tree exactly once.

## Context

`KI-TOOL-CLI-041` separated repository progress into its own presentation surface, and `KI-TOOL-CLI-043` gave shared CLI concepts one named mapping. The progress renderer was not carried through either pass, so it now reports four things a reader cannot trust: a phase breakdown that contradicts its own total, a row that closes the tree while more rows follow, an evidence model that only one of the two commands presents, and a second conform pass whose label does not name the work it performs.

The reader-facing cost is concrete. A run that takes 32.2s reports `loading 0.0s · evidence 0.0s · audit 0.0s`, which tells a reader nothing about where the time went and actively misleads anyone diagnosing a slow skill.

## Boundary

Do not change what audit or conform actually execute, their findings, exit codes, or result tree; do not introduce a new progress dependency or an alternate renderer; do not make the phase model a public scripting contract; and do not alter the non-TTY path, which correctly emits no progress frames at all.

## Current state

Four defects, observed on `ki repo audit --repo .` and `ki repo conform` against this repository at `62d9482`.

- **Premature tree closure** — `src/core/repository-progress.ts:356` always renders the timings row with the `last-root` prefix, emitting `╰─ timings` even though `├─ verify`, `├─ results`, and `╰─ summary` follow it. A conform run emits two such rows, each falsely closing the tree.
- **Zeroed phase timings** — `evidence()` calls `openPhase('evidence')` unconditionally at line 417, outside the guard that protects the matching `closePhase()`. Because `evidence()` fires once per gathered session, every call resets `phaseStarted`, so the recorded phase elapsed is the gap since the last tick rather than the phase duration. `planned()` calls `openPhase(phase)` unconditionally at line 431 and is the likely cause of the same zero for the audit phase; this half is inference from the code and needs a measurement to confirm. `total` is computed from `started`, which nothing resets, which is why the total remains correct while its parts read `0.0s`.
- **Conform has no per-skill evidence rows** — audit renders nested children under `evidence`; conform renders one flat root bar. The evidence-row machinery is driven by `report()` stage events, so conform either does not emit those events or does not receive the same tracker callbacks.
- **Conform phase labels misdescribe the work** — evidence gathering renders inside the conform bar as `conform […] gathering evidence · 42/181 23% 5.5s` with no evidence root row of its own, and the second pass is labelled `verify` although it runs the audit rubric.
- **A full progress sweep repeats about three times during one audit** — `ki-engineering` shells out to five commands, of which `tsc --noEmit`, `knip`, and `bun run test:coverage` are slow enough to render a visible full sweep each, and they share one row position. The rubric invokes `test:coverage` exactly once, at `audit-evidence.ts:1243`, and no other skill invokes it, so the repetition is most likely one bar per slow stage rather than a repeated suite run. This needs a measurement: count actual `vitest` spawns across a single audit before deciding whether the fix is presentational or a genuine duplicate execution.

## Steps

- [ ] Give the timings row a caller-supplied position so it uses `last-root` only when no root row follows, and cover both the single-timings audit shape and the two-timings conform shape.
- [ ] Open a phase only on an actual transition, so a repeated `evidence()` or `planned()` call cannot reset `phaseStarted`; confirm by measurement that each reported phase sums to the reported total.
- [ ] Emit the same evidence stage events from the conform path so it renders per-skill child rows exactly as audit does.
- [ ] Give conform its own `evidence` root row rather than borrowing the conform bar's detail line.
- [ ] Rename conform's second pass from `verify` to `re-audit` across the renderer, its tests, and any user-facing material that names it.
- [ ] Measure how many times a single audit spawns `vitest`, then either give each slow stage its own labelled row so a reader can tell the sweeps apart, or fix the duplicate execution if the count exceeds one.
- [ ] Reconcile the presentation vocabulary with the `KI-TOOL-CLI-043` icon registry rather than adding new ad-hoc symbols.

## Files touched

Expected implementation: `src/core/repository-progress.ts`, and the conform and audit command modules that construct the tracker.

Expected tests: `src/tests/cli/repo/` progress coverage driving both commands through the `sandbox()` seam.

Expected material: `README.md`, `man/ki.1`, and `CHANGELOG.md` where the progress surface or the `verify` label is named.

## Verify

`bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, `ki repo audit --repo .`, and a captured TTY run of both commands showing the phase breakdown summing to the total, one tree closure, and per-skill rows under both.

## Dependencies / blocks

No external dependency. Builds on the presentation surface established by `KI-TOOL-CLI-041` and the icon registry from `KI-TOOL-CLI-043`, both delivered and pruned.

## Discussion

### Naming the second pass

`verify` named a reassurance rather than an activity: the pass runs the audit rubric a second time to prove conform's writes land clean. `re-audit` names what it does, and keeps the vocabulary shared with the audit command instead of inventing a conform-only word.

### One model for both commands

Audit and conform run the same rubric over the same skills and differ only in whether they write. A reader who has learned audit's progress shape should not have to learn a second one, so conform adopts audit's phase and evidence model rather than the two converging on a compromise.
