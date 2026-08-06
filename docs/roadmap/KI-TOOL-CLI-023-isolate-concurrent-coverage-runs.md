---
id: KI-TOOL-CLI-023
title: Isolate concurrent coverage runs
theme: cli
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make `ki repo audit` deterministic in a repository whose rubric runs a coverage-producing test command, so that a clean repository never reports an intermittent `TEST-5` failure caused by the audit racing against itself.

## Context

`ki repo audit` in this repository fails `TEST-5` intermittently while the repository is genuinely clean. Six consecutive full-audit runs against an unchanged working tree produced `FAIL=0`, `FAIL=2`, `FAIL=0`, `FAIL=1` and `FAIL=0`, while `bun run test:coverage` run directly passes every time at 100% on all four metrics, and `ki repo audit --skill ki-engineering` alone passes every time.

The captured failure is unambiguous:

```text
Error: Something removed the coverage directory ".../tools-ki/coverage/.tmp" Vitest created earlier.
Make sure you are not running multiple Vitests with the same "coverage.reportsDirectory" at the same time.
Caused by: ENOENT: no such file or directory, open '.../coverage/.tmp/coverage-26.json'
```

Two Vitest processes are alive at once in the same tree, and the second one's startup clears `coverage/.tmp` from under the first. An intermittently red audit on a green repository is corrosive: it trains the reader to discount `TEST-5`, which is the one criterion protecting the 100% coverage contract.

## Boundary

This item does not change the coverage thresholds, the `ki-engineering` rubric contract, or the `test` / `test:coverage` script idioms — those are owned by the harness. It does not introduce a general job scheduler, and it does not make coverage a release-publishing gate.

## Current state

The proximate cause is confirmed; the source of the second process is not, and diagnosing it is the first step of this item rather than an assumption to build on.

`runCheck` in the `ki-engineering` audit evidence context uses `execSync`, so a single skill evaluation cannot overlap itself, and `test:coverage` is invoked from exactly one place. The second Vitest therefore comes from a concurrently evaluated audit unit sharing the same working tree. The most likely candidate is the repository being audited as more than one root in a single invocation — the pre-commit path is already observed emitting two `KI REPO AUDIT` blocks, one for the repository and one for its `.agents` projection — but this has not been proven, and a parallel skill evaluation would produce the same symptom.

Vitest's `coverage.reportsDirectory` defaults to `./coverage`, so any two runs in one tree collide regardless of which units they belong to.

## Steps

- [ ] Reproduce deterministically: run the full audit in a loop and capture the concurrent process tree at the moment of failure, so the second Vitest's owning unit is identified rather than inferred.
- [ ] Decide the correct fix at that boundary — deduplicate the repeated root so a tree is audited once, or serialise subprocess-backed rubric items across concurrently evaluated units.
- [ ] Prefer eliminating the duplicate work over serialising it: running an expensive test command twice per audit is itself a defect, not only a race.
- [ ] Confirm that `.agents` and `.claude` skill projections are not audited as independent repository roots when they are projections of the tree already under audit.
- [ ] Cover the chosen behaviour with a CLI test that fails against today's scheduling.

## Files touched

- The repository audit orchestration in `src/core/` that selects and evaluates roots and skills.
- `src/tests/cli/repo/` — a regression test for the chosen invariant.

## Verify

Twenty consecutive `ki repo audit` runs against an unchanged clean tree must all report `FAIL=0`; today that loop reports a failure roughly one run in three. A single audit must invoke `bun run test:coverage` exactly once, observable by instrumenting the command or by timing the run.

`bun run test`, `bunx tsc --noEmit` and `bun run test:coverage` must remain green, with coverage at 100% over product code.

## Dependencies / blocks

None. The fix is local to this repository's audit orchestration and does not require a harness rubric change.

## Discussion

### Why not simply give coverage a unique reports directory

Randomising `coverage.reportsDirectory` per run would silence the error while leaving the underlying waste in place: the audit would still run a full test suite twice. It would also diverge from the `ki-engineering` standard's fixed `"test:coverage": "vitest run --coverage"` shape, which is deliberately uniform across the estate.

### Why this surfaced now

The repository only recently reached 100% coverage, so `TEST-5` previously failed for a real reason on every run and the intermittency was invisible beneath it. A criterion that is always red hides its own flakiness; one that is usually green exposes it.
