---
id: KI-TOOL-CLI-045
title: Unify repository run progress
area: CLI
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: ae10b6f31fd8591bb52d160d68b939d3615a459a
---

## Goal

Give `ki repo audit` and `ki repo conform` one honest progress model: the same phase and per-skill evidence presentation, timings that agree with the total they sit beside, tree punctuation that closes the tree exactly once, and a bar weighted by declared effort. Stop conform re-auditing when it staged nothing to verify.

## Context

`KI-TOOL-CLI-041` separated repository progress into its own presentation surface, and `KI-TOOL-CLI-043` gave shared CLI concepts one named mapping. The progress renderer was not carried through either pass, so it now reports four things a reader cannot trust: a phase breakdown that contradicts its own total, a row that closes the tree while more rows follow, an evidence model that only one of the two commands presents, and a second conform pass whose label does not name the work it performs.

The reader-facing cost is concrete. A run that takes 32.2s reports `loading 0.0s · evidence 0.0s · audit 0.0s`, which tells a reader nothing about where the time went and actively misleads anyone diagnosing a slow skill.

## Boundary

Do not change which rubric items audit or conform evaluate, their findings, exit codes, or result tree; do not introduce a new progress dependency or an alternate renderer; do not make the phase model a public scripting contract; and do not alter the non-TTY path, which correctly emits no progress frames at all.

The single permitted execution change is skipping conform's re-audit pass when nothing was staged, because that pass exists only to prove staged writes landed clean. Do not extend it into caching, result reuse between invocations, or skipping any item on the grounds that its inputs look unchanged: rubric items do not declare their input surface, so any such key would be inferred, and a stale `PASS` from a correctness gate is a worse failure than a slow one.

## Current state

Four defects, observed on `ki repo audit --repo .` and `ki repo conform` against this repository at `62d9482`.

- **Premature tree closure** — `src/core/repository-progress.ts:356` always renders the timings row with the `last-root` prefix, emitting `╰─ timings` even though `├─ verify`, `├─ results`, and `╰─ summary` follow it. A conform run emits two such rows, each falsely closing the tree.
- **Zeroed phase timings** — `evidence()` calls `openPhase('evidence')` unconditionally at line 417, outside the guard that protects the matching `closePhase()`. Because `evidence()` fires once per gathered session, every call resets `phaseStarted`, so the recorded phase elapsed is the gap since the last tick rather than the phase duration. `planned()` calls `openPhase(phase)` unconditionally at line 431 and is the likely cause of the same zero for the audit phase; this half is inference from the code and needs a measurement to confirm. `total` is computed from `started`, which nothing resets, which is why the total remains correct while its parts read `0.0s`.
- **Conform has no per-skill evidence rows** — audit renders nested children under `evidence`; conform renders one flat root bar. The evidence-row machinery is driven by `report()` stage events, so conform either does not emit those events or does not receive the same tracker callbacks.
- **Conform phase labels misdescribe the work** — evidence gathering renders inside the conform bar as `conform […] gathering evidence · 42/181 23% 5.5s` with no evidence root row of its own, and the second pass is labelled `verify` although it runs the audit rubric.
- **Conform re-audits even when it staged nothing** — `src/commands/repo/index.ts:430-433` applies writes and commands and then calls `reAuditAndRender()` unconditionally, with no short circuit for an empty `writes` and `commands` pair. An observed run reported `conform 28.4s` followed by `verify 27.3s` at `FIXED=0`, so a full second 181-item pass, including a second `bun run test:coverage`, ran to verify writes that never happened. The pass exists to prove staged writes landed clean, so when nothing is staged its premise is already satisfied by the initial audit.
- **The declared `cost` weighting is discarded at the load boundary** — the harness rubric type documents `cost` as "relative expected effort against the other criteria in the same catalogue, used to weight progress", and ten items across five skills declare one: `TEST-5` 60, `DEPS-1` 12, `KNIP-2` 8, `TSC-1` 5, `BIO-1` 4, `SYNC-1` 2. The local `MechanicalRubric` in `src/core/rubric.ts` omits the field, and `validateItem` in `src/core/runtime-loader.ts` destructures only `code`, `title`, `description`, `sources`, `mechanical`, and `judgment`, so the value never enters the CLI. Every one of the 181 items therefore advances the bar equally, and the declared sixty-fold difference between a coverage run and an `lstat` is invisible. The declared weights track the measured durations closely enough to be useful as they stand, so this needs no persisted timing history.
- **An evidence bar sweeps repeatedly with no completion signal** — this is working as designed, not a defect, and is recorded here only so it is not mistaken for one. Evidence stages carry no known total, so `barZones` renders an animated band cycling on `tick % (width + band)` rather than progress toward an end. A stage therefore sweeps once per cycle for as long as it runs: `test:coverage` at 8.8s crosses roughly three times while `syncpack` at 0.1s never completes one crossing. `ki-engineering` shells out to five commands and renders one row each, and the rubric invokes `test:coverage` exactly once at `audit-evidence.ts:1243` with no other skill invoking it, so there is no duplicate execution to fix. The open question is presentational only: whether a long indeterminate stage should show elapsed time against a typical duration instead of an unbounded loop.

## Steps

- [x] Give the timings row a caller-supplied position so it uses `last-root` only when no root row follows. Check: an audit run renders one `╰─` for the whole tree, and a conform run renders `├─ timings` for its first pass.
- [x] Open a phase only on an actual transition, so a repeated `evidence()` or `planned()` call cannot reset `phaseStarted`. Check: the reported phases sum to the reported total, measured on a run of at least ten seconds rather than asserted from the code.
- [x] Skip conform's re-audit when no write and no command was staged, reporting plainly that there was nothing to verify rather than silently omitting the pass. Check: a clean conform reports one pass and runs `test:coverage` once; a conform that stages a write still runs and reports the re-audit in full.
- [x] Emit the same evidence stage events from the conform path so it renders per-skill child rows exactly as audit does. Check: a conform run shows the five `ki-engineering` command rows.
- [x] Give conform its own `evidence` root row rather than borrowing the conform bar's detail line. Check: no conform frame renders a conform counter beside an evidence detail string.
- [x] Rename conform's second pass from `verify` to `re-audit` across the renderer, its tests, and any user-facing material that names it. Check: `grep -rn "verify" src/commands/repo/` returns no phase label, and `README.md` and `man/ki.1` agree.
- [x] Carry the harness `cost` field through `validateItem` and the local `MechanicalRubric` type, and weight the phase bar by it. Check: an item declaring `cost: 60` advances the bar sixty times as far as an unweighted one, and an item declaring no `cost` still counts as one unit.
- [x] Reconcile the presentation vocabulary with the `KI-TOOL-CLI-043` icon registry rather than adding new ad-hoc symbols. Check: no new literal glyph is introduced outside the registry.

## Delegation

Single lane, no subagents. Every step converges on `src/core/repository-progress.ts`, so parallel lanes would contend on one file for no scheduling gain, and the sequencing above is what keeps a failure attributable.

## Files touched

Expected implementation: `src/core/repository-progress.ts`, `src/core/rubric.ts` and `src/core/runtime-loader.ts` for the `cost` field, and `src/commands/repo/index.ts` for the re-audit short circuit and tracker construction.

Expected tests: `src/tests/cli/repo/` progress coverage driving both commands through the `sandbox()` seam.

Expected material: `README.md`, `man/ki.1`, and `CHANGELOG.md` where the progress surface or the `verify` label is named.

## Verify

`bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, `ki repo audit --repo .`, and a captured TTY run of both commands showing the phase breakdown summing to the total, one tree closure, per-skill rows under both, and a bar that advances proportionally to declared `cost`.

A conform run against a clean repository must report one pass and no re-audit, while a conform run that stages a write must still run and report the re-audit. Cover both through the `sandbox()` seam.

## Dependencies / blocks

No external dependency. Builds on the presentation surface established by `KI-TOOL-CLI-041` and the icon registry from `KI-TOOL-CLI-043`, both delivered and pruned.

## Review

### Delivered

Delivered the approved unified repository-progress model from immutable baseline `ae10b6f31fd8591bb52d160d68b939d3615a459a`, with implementation evidence in `f23e30b26c0d6486f7a2897f34d37626762ab7f9`.

The execution boundary held: audit and conform still evaluate every selected rubric item, and the only execution change skips conform's re-audit when both its staged writes and commands are empty. No caching, cross-invocation result reuse, input inference, alternate renderer, public scripting contract, or non-TTY progress path was introduced.

### Summary of changes

- `src/core/repository-progress.ts` now assigns timings their caller-selected tree position, records only real phase transitions, aggregates repeated phase spans, reconciles displayed rounded phase durations with their total, gives conform the shared evidence model, and weights bars by rubric cost while retaining item-count text.
- `src/commands/repo/index.ts` selects root timing placement for audit and conform, names the second pass `re-audit`, and reports an icon-registry-backed skip row before omitting a clean conform's unnecessary re-audit.
- `src/core/rubric.ts` and `src/core/runtime-loader.ts` carry and validate the optional positive finite `cost` field. This load-boundary change was made after the presentation and execution work as planned.
- CLI tests under `src/tests/cli/repo/` cover timing reconciliation, tree placement, evidence parity, clean and staged conform paths, weighted and default costs, load validation, and educate's terminal timing placement through `sandbox()`.
- `README.md`, `man/ki.1`, and `CHANGELOG.md` describe the `re-audit` name, clean skip, and unified progress behavior.

No approved deviation was needed. The required pre-change measurement confirmed the recorded Step 2 inference: a 29.3-second audit reported `audit 0.0s` because repeated `planned()` calls reopened the same phase.

### Verification

- `bun run test` — passed 41 files and 628 tests.
- `bun run test:coverage` — passed at 100% statements, branches, functions, and lines.
- `bunx tsc --noEmit` — passed.
- `bunx biome check` — passed across 143 files with no fixes required.
- `ki repo audit --repo .` — passed with `PASS=17 WARN=0 FAIL=0` and no findings.
- Captured final TTY audit — `loading 0.0s · evidence 31.7s · audit 0.0s · total 31.7s`; five `ki-engineering` evidence command rows appeared, the weighted `TEST-5` transition visibly advanced the bar, and the complete tree had one root closure.
- Captured final clean TTY conform — one 27.5-second pass, five `ki-engineering` evidence command rows, one timings row, one root closure, `nothing staged; no re-audit required`, and `FIXED=0`.
- CLI regression coverage proves a staged write still renders and runs `re-audit`, a clean conform invokes its audit only once, a `cost: 60` item occupies 37 rendered bar columns where a default-cost item occupies one, and no conform frame mixes a conform counter with evidence detail.
- `rg -n 'verify' src/commands/repo` returned no old phase label; the remaining matches are the `re-audit` implementation wording. The skip status uses `presentationText('status.skip')`; no literal status glyph was added.

### Outstanding concerns

Review feedback identified one unresolved presentation issue: direct conform evidence retains a completed root row for every quick skill instead of one logical evidence-phase root. The item has returned to implementation for that focused correction.

One repository-state expectation in the handoff and `AGENTS.md` also disagreed with measured evidence: both the immutable-baseline preflight and final audit returned `PASS=17 WARN=0 FAIL=0`, not the expected `PASS=16 WARN=1 FAIL=0` with `TOOL-RELEASE-MARKERS`. This item did not alter release markers or their audit rule, so no out-of-scope change was made to manufacture or suppress that warning; the discrepancy remains for separate triage if desired.

### Post-change review

The goal is met: audit and conform now share honest phases and evidence rows, displayed timings reconcile, the output tree closes once, cost controls visual progress, and clean conform avoids only the pass whose premise is absent. The approved file and behavior scope held, including the deliberate last placement of the rubric load-boundary change.

Regression risk is concentrated in progress state transitions, rounded timing display, and optional-cost loading. The repeated conform evidence roots show that the first CLI coverage did not exercise enough consecutive quick evidence sessions. The record is back in progress until that case is corrected and the full verification is refreshed.

### Mini recap

`KI-TOOL-CLI-045` delivered unified, cost-weighted repository run progress and removed the empty clean-conform re-audit from baseline `ae10b6f` in implementation commit `f23e30b`. All engineering gates and the required real TTY scenarios pass; the only concern is the pre-existing release-marker audit-total discrepancy recorded above.

Proposed learning route: none automatically. The timing-reset cause, displayed-rounding edge case, and clean-versus-staged conform distinction are implementation-local and are now preserved by CLI regression tests; the release-marker discrepancy can enter the selected change-management queue separately if the reviewer chooses.

## Discussion

### Step order

The steps run from self-contained rendering repairs to the one change that alters a data contract, so each stage is independently verifiable and a failure is easy to isolate. The first two touch only `repository-progress.ts` internals. The re-audit skip is the sole behavioural change and is deliberately separated from the rendering work, so a regression there cannot be mistaken for a presentation bug. The conform parity steps follow. Carrying `cost` is last because it widens the load boundary and would otherwise sit underneath every earlier verification.

### Naming the second pass

`verify` named a reassurance rather than an activity: the pass runs the audit rubric a second time to prove conform's writes land clean. `re-audit` names what it does, and keeps the vocabulary shared with the audit command instead of inventing a conform-only word.

### Why the re-audit skip is not caching

Skipping a pass because nothing was staged is an argument from the pass's own premise: it verifies staged writes, and there were none. Skipping an item because its inputs look unchanged is an argument from inferred state, and rubric items do not declare what they read. The first is sound with the information already present; the second needs a contract that does not exist. Caching and any per-item `inputs` declaration are deliberately out of scope here.

### One model for both commands

Audit and conform run the same rubric over the same skills and differ only in whether they write. A reader who has learned audit's progress shape should not have to learn a second one, so conform adopts audit's phase and evidence model rather than the two converging on a compromise.

### Review correction

The first review found that conform retained `gathering evidence complete` once per quick skill before the useful long-running evidence children appeared. Those rows are fragments of one logical evidence phase, not separate completed phases. The correction must retain one aggregate root, preserve useful per-skill children, and keep timing attribution across the interleaved conform work.
