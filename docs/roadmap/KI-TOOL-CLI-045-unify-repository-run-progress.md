---
id: KI-TOOL-CLI-045
title: Unify repository run progress
area: CLI
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: ae10b6f31fd8591bb52d160d68b939d3615a459a
---

## Goal

Give `ki repo audit` and `ki repo conform` one honest, concise progress model: shared phase and evidence receipts, one Homebrew-like mutable activity row, elapsed timings that agree with the total they sit beside, and tree punctuation that closes the tree exactly once. Stop conform re-auditing when it staged nothing to verify.

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
- [x] Replace the review-stage cost-weighted multi-row panel with an activity-only receipt stream: hide queued work, animate only the current row, and print completed work once. Check: a recorder that preserves carriage returns no longer receives the full skill panel on every timer tick.
- [x] Render every `evidence ready` receipt with a completed bar, then collapse the temporary skill receipts into one timed evidence receipt before the operation phase. Check: the full-catalogue TTY audit shows each selected skill once with a full bar and leaves no incomplete bar beside `evidence ready`.

## Delegation

Single lane, no subagents. Every step converges on `src/core/repository-progress.ts`, so parallel lanes would contend on one file for no scheduling gain, and the sequencing above is what keeps a failure attributable.

## Files touched

Implementation: `src/core/repository-progress.ts` and its focused `src/core/repository-progress/` modules, `src/core/repository-reporting.ts` and its focused `src/core/repository-reporting/` modules, `src/core/rubric.ts` and `src/core/runtime-loader.ts` for the `cost` field, and `src/commands/repo/index.ts` for the re-audit short circuit and tracker construction.

Expected tests: `src/tests/cli/repo/` progress coverage driving both commands through the `sandbox()` seam.

Expected material: `README.md`, `man/ki.1`, and `CHANGELOG.md` where the progress surface or the `verify` label is named.

## Verify

`bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, `ki repo audit --repo .`, and captured TTY runs showing one mutable activity row, completed evidence receipts, retained elapsed time, one tree closure, and bounded output independent of declared `cost`.

A conform run against a clean repository must report one pass and no re-audit, while a conform run that stages a write must still run and report the re-audit. Cover both through the `sandbox()` seam.

## Dependencies / blocks

No external dependency. Builds on the presentation surface established by `KI-TOOL-CLI-041` and the icon registry from `KI-TOOL-CLI-043`, both delivered and pruned.

## Documentation impact

### Decision Records

No decision record is needed: this correction applies the established lifecycle record shape.

### Specifications

No specification change is needed: the CLI progress and reporting contract remains covered by its existing CLI tests and user-facing documentation.

### Guides

No guide change is needed: the README and man page remain the user-facing operation guidance.

### Roadmap

This record retains the implementation and review evidence; no additional roadmap item is needed.

## Review

### Delivered

Delivered the approved unified repository-progress model from immutable baseline `ae10b6f31fd8591bb52d160d68b939d3615a459a`. The original implementation and first review correction are in `f23e30b` and `a9d08ce`; the modularity and clean-summary pass is in `c60d5e0` through `d9f30f0`; and the approved receipt-stream correction is in `fcfd4b1` through `c2d405f`.

The execution boundary held: audit and conform still evaluate every selected rubric item, and the only execution change skips conform's re-audit when both its staged writes and commands are empty. No caching, cross-invocation result reuse, input inference, alternate renderer, public scripting contract, or non-TTY progress path was introduced.

### Summary of changes

- Interactive repository progress is now a receipt stream with one mutable activity row. Queued work is hidden, active work has an indeterminate bar unrelated to estimated complexity, and each completed evidence item prints once with a full bar and elapsed time before those temporary receipts collapse into the aggregate evidence receipt. `--progress-style single` suppresses the temporary per-skill receipts.
- `src/core/repository-progress.ts` is now a small barrel over focused options, rendering, run-orchestration, and tracker modules. `src/core/repository-reporting.ts` is likewise a barrel over audit, conform, education, and shared reporting modules. The split preserves the public imports while separating responsibilities that had accumulated in two large files.
- Terminal mechanics live in the focused `repository-progress/display.ts`; the tracker owns phase and activity state rather than cursor geometry. It assigns timings their caller-selected tree position, records only real phase transitions, reconciles displayed rounded phase durations with their total, and gives audit and conform the same evidence model.
- `src/commands/repo/index.ts` selects root timing placement for audit and conform, names the second pass `re-audit`, and reports an icon-registry-backed skip row before omitting a clean conform's unnecessary re-audit.
- `src/core/rubric.ts` and `src/core/runtime-loader.ts` carry and validate the optional positive finite `cost` field. This load-boundary change was made last as planned; the field remains contract metadata but no longer drives presentation after the reviewer rejected estimated progress.
- Clean skill rows now end at `PASS` instead of repeating zero counters. Clean audit and conform summaries use `PASS · N skills`; exceptional outcomes and multi-repository recaps retain their diagnostic counters.
- CLI tests cover the behavior through `sandbox()`, including receipt completion, bounded cursor movement, activity-only bars, failures, timing reconciliation, tree placement, evidence parity, clean and staged conform paths, and cost loading. `README.md`, `man/ki.1`, and `CHANGELOG.md` describe the receipt stream, compact summaries, `re-audit`, and the clean skip.

The reviewer explicitly approved doing the focused core refactor inside this item, so no separate roadmap record was created. The required pre-change measurement confirmed the recorded Step 2 inference: a 29.3-second audit reported `audit 0.0s` because repeated `planned()` calls reopened the same phase.

### Verification

- `bun run test` — passed 41 files and 627 tests.
- `bun run test:coverage` — passed at 100% statements, branches, functions, and lines: 5,662/5,662 statements, 3,316/3,316 branches, 1,269/1,269 functions, and 4,813/4,813 lines.
- `bunx tsc --noEmit` — passed.
- `bunx biome check` — passed across 152 files with no fixes required.
- `ki repo audit --repo .` — passed all 17 skills with no warnings or failures and rendered `summary: KI REPO AUDIT on tools-ki PASS · 17 skills`.
- Captured final full-catalogue TTY audit — passed in 33.8s; every `evidence ready` receipt had a full bar, queued rows were absent, the audit phase used one mutable activity row, and the complete tree had one root closure.
- Captured final clean TTY conform for `ki-authoring` — passed in 0.1s with a full evidence-ready receipt, one aggregate evidence receipt, `nothing staged; no re-audit required`, and the compact `PASS · 1 skill` summary. A separate full-catalogue capture exercised the same renderer but correctly failed when the restricted sandbox denied the engineering fixture's localhost listener; the verifier declined an unrestricted full conform because conform can mutate.
- CLI regression coverage proves a staged write still renders and runs `re-audit`, a clean conform invokes its audit only once, failed activity receives the registered failure glyph, loaded costs do not change the indeterminate activity bar, completed evidence renders a full bar, and no conform frame mixes a conform counter with evidence detail.
- `rg -n 'verify' src/commands/repo` returned no old phase label; the remaining matches are the `re-audit` implementation wording. The skip status uses `presentationText('status.skip')`; no literal status glyph was added.

### Outstanding concerns

No implementation concern remains. A passing full-catalogue conform TTY capture cannot be repeated outside the restricted sandbox without approval because conform is potentially mutating; the clean conform TTY path passed, the full catalogue passed through audit, and both clean/staged conform execution paths are covered through the CLI boundary. The handoff expected a standing `TOOL-RELEASE-MARKERS` warning, but both the immutable-baseline preflight and final audit measured all 17 skills passing. This item did not alter release markers or their audit rule.

### Post-change review

The goal is met: audit and conform share honest phase and evidence receipts, displayed timings reconcile, the output tree closes once, the bar communicates activity without pretending to estimate completion, clean output removes redundant zero counters, and clean conform avoids only the pass whose premise is absent. Redirected output remains compact and non-progress output remains deterministic.

The refactor improves comprehension without widening the API: callers continue importing the same two barrel modules, while progress options, display mechanics, rendering, orchestration, tracking, and each reporting concern now have clear homes. The main capture-noise risk is bounded by construction because timer ticks rewrite only the current activity line; completed receipts are never part of a periodic redraw. The record is ready again for human acceptance review.

### Mini recap

`KI-TOOL-CLI-045` now delivers Homebrew-like activity progress, one-time completion receipts, compact clean results and summaries, focused progress and reporting modules behind compatible barrels, and the approved clean-conform re-audit skip. All 627 tests, all four coverage metrics at 100%, the engineering gates, and the final full-catalogue audit pass.

Proposed learning route: none automatically. The timing-reset cause, stable-panel transitions, displayed-rounding edge case, clean-summary rules, and clean-versus-staged conform distinction are implementation-local and preserved by CLI regression tests.

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

The first review found that conform retained `gathering evidence complete` once per quick skill before the useful long-running evidence children appeared. Those rows are fragments of one logical evidence phase, not separate completed phases. The correction now keeps those interleaved sessions live without committing their partial roots, clears stale rows when a detailed evidence panel shrinks, and retains one final aggregate root with its useful children. Execution order and the rubric/runtime boundary remain unchanged.

### Second review correction

The second review found that periodically redrawing a multi-row panel produces excessive permanent output when a terminal recorder strips or cannot honour cursor movement. The approved correction replaces that panel with a receipt stream and one mutable activity row: queued skills are hidden, evidence-ready skills render once with a full bar, only the current skill animates, and the temporary evidence receipts collapse to one timed phase receipt. The activity bar is deliberately indeterminate and no longer claims that declared cost predicts elapsed work; actual elapsed time remains visible.

### Third review correction

The receipt stream made the all-pass `results` tree redundant: it repeated completed evidence without adding a decision. Clean audit and conform runs now end at their compact summaries. Detailed per-skill rows remain for WARN, FAIL, FIXED, and registration-failure outcomes, where they identify action a reader needs to take.
