---
id: KI-TOOL-CLI-021
title: Rebuild repository-operation progress rendering
theme: cli
horizon: now
status: done
blocks: [KI-TOOL-CLI-022]
blocked-by: []
baseline-ref: null
---

## Goal

Make the live progress row of `ki repo audit` and `ki repo conform` report the work actually in flight: name the running item rather than the last completed one, carry an elapsed clock through the phase that is actually slow, show how large the current item is, distinguish the conform sweep from the verify sweep, and restore the terminal cleanly on failure and interrupt.

## Context

The progress layer in `src/core/repository-reporting.ts` misreports the operation, and does so worst during the long tail of a run where a user most needs it. A real `ki repo audit --skill ki-engineering` run over 42 items took roughly 34 seconds and exhibited every defect below.

The row names the item that just finished rather than the one running, because `onItemComplete` fires after the `auditItem` await resolves. During a twelve-second subprocess-backed item the display sits frozen naming the previous item. There is no elapsed clock during the item phase at all — `elapsed()` is used only by the loading phase, which completes in a fraction of a second — so a stall is indistinguishable from a hang. Every item advances the bar by the same amount, although one item is a single `lstat` and another is a full test run, so the bar leaps and then parks.

`ki repo conform` drives the bar from zero to complete twice, once conforming and once re-auditing, with no label distinguishing the two sweeps; it reads as though the command restarted. On failure the multi style stamps every row `failed` while the single style writes only a bare newline, leaving a partial frame that is indistinguishable from success.

Two structural facts constrain any design here, both confirmed against the code. Execution is strictly sequential: skills run in a `for`-`await` loop, and so do the items within a skill, which share a stateful session. "Started" and "completed" therefore differ by exactly one item, so a dual-measure bar is not a fan-out display — its value is that the width of the in-flight band shows how large the running item is, which is the missing signal explaining an apparently stalled bar. It becomes a genuine dual measure only if skills are later run concurrently.

Nothing statically declares which items are slow. `commands` lives on `ConformProposal`, a runtime result, not on `RubricItem`; slow items are slow because their `audit.run` shells out internally. Duration weighting therefore has to be learned by observation, which is why it is separated into `KI-TOOL-CLI-022` rather than attempted here.

## Boundary

This item does not introduce the persisted duration-weight cache, does not add concurrency to skill or item execution, does not change the audit or conform report bodies below `├─ results`, and does not alter the `--progress`, `--progress-style`, or `--reporter-levels` command grammar. It renders the in-flight band at uniform width until `KI-TOOL-CLI-022` makes that width proportional.

## Current state

The tracker is created by `createProgressTracker` and exposes `loading`, `planned`, `item`, `complete`, and `failed`. It samples terminal width once at creation, redraws on every item completion with no frame-rate cap, keys its internal state map on the non-harness-qualified `skill.declaration.name`, and carries a `lineRenderer` parameter threaded through four signatures to two exported aliases, `auditProgressLine` and `conformProgressLine`, which are both the same function and differ in nothing.

Progress writes to stderr while the surrounding frame writes to stdout. That split is retained deliberately: progress is ephemeral status, and `ki repo audit > report.txt` must capture a clean report. The consequence — a redirected report contains the frame without the live row — is accepted.

## Steps

- [ ] Thread an `onItemStart` hook through `auditSkill`, `runSkillAudit`, and `runSkillConform` in `src/core/runtime.ts`, firing immediately before the `auditItem` await, using a single options object rather than a further positional parameter. Add a matching `start` member to the private `ProgressTracker` interface that does not increment the completed count.
- [ ] Bridge the hook at the three real call sites in `src/commands/repo/index.ts` — audit, conform, and the `reAuditAndRender` inner function — mirroring the existing `(item) => onItemComplete(item.code)` shape. The one-argument `educate` lambda compiles untouched.
- [ ] Compose the bar with its status text centred inside it and three zones applied by column index: completed weight as reverse video, the in-flight item as reverse plus dim, and pending as plain. The treatment is deliberately colour-free so it survives `NO_COLOR` and monochrome terminals.
- [ ] Retain the bracket form when stderr is not a TTY, one line per update, adding a distinct character for the in-flight band so CI logs stay readable.
- [ ] Carry the elapsed clock through the item phase as well as the loading phase.
- [ ] Give the tracker a phase label and pass it from the conform call sites so the conform and verify sweeps are distinguishable.
- [ ] Make `failed()` symmetric across both styles, rendering a terminal failure frame naming the item that failed.
- [ ] Read the terminal width per render rather than sampling once, so a mid-run resize does not corrupt every subsequent frame.
- [ ] Throttle redraws using the injected clock, always flushing the final frame; the multi style currently rewrites every row on every item.
- [ ] Animate the indeterminate bar so a slow definition load is distinguishable from a hang.
- [ ] Hide the cursor during the run, and restore it plus emit a newline on `SIGINT`.
- [ ] Guard the multi style when the skill count exceeds terminal height, where the cursor-up sequence assumes all rows are on screen; give each skill its own three-zone row plus a totals row.
- [ ] Remove the dead `lineRenderer` parameter and the two identical progress-line aliases; phase labelling replaces the only distinction they could have carried.
- [ ] Model tracker state as a discriminated union over loading, running, and done, removing the two `as number` casts and the zero-total percentage special case.
- [ ] Unify the tracker's skill key on `skill.identity` rather than the non-harness-qualified declaration name.

## Files touched

- `src/core/repository-reporting.ts` — the tracker, the renderer, and the exported runners.
- `src/core/runtime.ts` — `auditSkill`, `runSkillAudit`, `runSkillConform` hook signatures.
- `src/commands/repo/index.ts` — the audit, conform, and re-audit call sites.
- `src/tests/cli/repo/repo.test.ts`, `src/tests/cli/repo/conform-writes.test.ts` — the pinned progress expectations.
- `man/ki.1`, `README.md`, `CHANGELOG.md` if the rendered examples or documented behaviour change.

## Verify

The renderer is exercised only through the CLI seam, per the repository's contract-testing convention. The mode matrix currently pinned by tests must survive: `auto` and `never` on a non-TTY emit nothing; `never` on a TTY emits nothing; `always` on a non-TTY emits plain lines with no clear sequences; `auto` or `always` on a TTY emits clear-sequence-delimited frames padded to terminal width. The guarantee that the stdout header flushes before the first stderr frame must also survive, since the merged sandbox stream depends on it.

Several assertions are invalidated by design and need rewriting rather than preserving: the fixed eighty-character frame padding, the bar inner width at 240 columns — the width formula changes fundamentally once text sits inside the bar rather than beside it — the exact frame sequence, which transitively pins the number of clock samples and needs a monotonic stub in place of the current draining queue, the five-rung narrow-terminal ladder, and the whole-output equality assertion for the non-interactive path.

Coverage is enforced at 100% over product code, so each new branch — `NO_COLOR`, the multi-height guard, the throttle — needs a CLI test. The signal handler is not reachable from an in-process invocation: structure the cursor-restore as an ordinary function invoked by the failure path so it is covered, leaving only the signal binding under an ignore comment carrying its justification, per `AGENTS.md`.

Manual confirmation against a genuinely slow rubric in this repository: the row names the running item while it runs, the clock advances, the in-flight band is visible, the conform run labels its two sweeps, the piped form falls back to brackets, a redirected report is clean, `NO_COLOR` emits no styling, an interrupt restores the cursor, and a mid-run resize leaves frames intact.

## Dependencies / blocks

This item blocks `KI-TOOL-CLI-022`, which makes the in-flight band width proportional to observed item duration. Nothing blocks this item; both the hook surface and the renderer are wholly local to this repository, and no other caller of the progress runners exists in `src/`.

## Discussion

### Why the dual measure is still worth building under sequential execution

With one item in flight at a time the started and completed measures differ by exactly one item, which invites the objection that a second measure conveys nothing. It conveys the size of the current item. Under uniform weighting that is one slot; under `KI-TOOL-CLI-022` it becomes proportional, so a wide dim band directly answers "why has this stopped moving". Building the three-zone renderer now also means the weighting item is a pure data change with no further presentation work, and the display is already correct if skills are ever run concurrently.

### Why the visual treatment avoids colour

Reverse video plus dim gives two distinguishable zone states without introducing the first colour dependency into the CLI. Colour would be more legible, but it would bring `NO_COLOR`, `FORCE_COLOR`, and `TERM=dumb` handling as new concerns, each requiring a degraded path — which is to say, requiring the colour-free treatment to be implemented anyway as the fallback.

### Why the stream split is retained

Making the frame coherent under redirection would mean moving progress to stdout, which puts every redraw into any captured report or downstream pipeline — in the non-TTY case one line per rubric item. Keeping progress on stderr is the conventional split and preserves the more valuable property, that a redirected report is clean.
