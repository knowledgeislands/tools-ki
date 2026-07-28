---
id: 'CLI-005'
title: 'Improve audit and conform reporting'
status: acceptance
roadmap: cli/make-audit-and-conform-output-name-its-target-and-its-passes
blocks: —
blocked-by: —
baseline-ref: ae67ee6ad7eaeef855232e110cfd9a28fb41732f
---

## Context

`ki repo audit` and `ki repo conform` report the supplying harness and skill, but not the repository being assessed. In a multi-repository sweep this makes repeated provider prefixes look like targets. Their default reporter also omits a skill with no visible finding, leaving a successful assessment indistinguishable from a skill that was never run.

## Current state

- `renderReports` in `src/commands/repo.ts` renders `==> <provider>:<skill>:<operation>` only when a report has a finding selected by `--reporter-levels`.
- The command resolves a physical repository root before each operation, but does not pass it into reporting.
- The recap is aggregate-only; it cannot prove that an individual clean skill ran.
- Existing CLI contract tests cover level filtering, clean operations, progress, and conform re-audit output, providing the appropriate public seam for this change.

## Steps

1. ✓ Defined the stable human-readable reporting contract: `target repository [supplier:skill] operation`, with supplier provenance retained and one terminal result per skill even when no finding is selected for display.
2. ✓ Threaded the resolved physical repository target through the host-owned renderer for audit, dry-run conform, successful conform re-audit, and failure reporting without changing finding levels, exit status, or progress streams.
3. ✓ Added deterministic terminal `pass`, `warn`, `fail`, or `fixed` lines; existing detailed-finding filtering and per-skill judgment-unevaluated summaries remain intact.
4. ✓ Updated `ki(1)` to explain target-first reporting, supplier provenance, and visible clean results under the default reporter levels.
5. ✓ Extended sandboxed CLI-contract coverage for target identity, provider provenance, clean audit and conform results, filtered findings, fixed results, dependency ordering, and unchanged progress output; 100% coverage remains enforced.
6. ✓ Ran the complete verification gate without a tag, release, push, publication, or Homebrew-tap change.

## Files touched

- `src/commands/repo.ts` reporting and operation call sites
- `src/tests/cli/repo.test.ts` CLI-contract output coverage
- Relevant CLI reference documentation only if the settled public reporting contract requires it

## Verify

1. CLI-contract tests show every audit and conform invocation names its resolved repository target and its supplier provenance, including clean skills filtered by default reporter levels.
2. Tests prove detailed findings remain filtered by `--reporter-levels`, while a per-skill completion result remains visible; audit and conform exit semantics, guarded publication, and progress output remain unchanged.
3. `bun run test` and `bun run test:coverage` pass with required 100% coverage.
4. `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, applicable documentation formatting checks, and `git diff --check` pass.
5. No tag, release, push, publication, or Homebrew-tap modification occurs.

## Dependencies / blocks

CLI-005 has no plan dependency. It follows CLI-003 and CLI-004 in the current delivery queue, whose retained done records will be pruned separately when the tranche closes.

## Acceptance

### Delivered

`ki repo audit` and `ki repo conform` now identify every assessed repository and provide a positive terminal result for every selected skill.

### Summary of changes

- Changed `src/commands/repo.ts` to render each report as `target repository [supplier:skill] operation`, retaining supplier provenance while making the assessment target unambiguous.
- Added unconditional terminal `pass`, `warn`, `fail`, or `fixed` results while preserving the selected detailed findings, existing summaries, recap, exit semantics, and progress streams.
- Updated sandboxed CLI contracts for clean, filtered, fixed, dependency-ordered, and progress output; physical target paths are asserted deliberately.
- Updated `ki(1)` with the target/provenance and clean-result reporting contract.

### Verification

- `bun run test` — passed: 23 files and 373 tests.
- `bun run test:coverage` — passed: 100% statements, branches, functions, and lines.
- `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `mandoc -T utf8 man/ki.1`, `bunx prettier --check docs/roadmap/cli/plans/CLI-005-improve-audit-conform-reporting.md`, `./bin/ki repo audit --skill ki-roadmap --repo .`, `./bin/ki repo audit --skill ki-authoring --repo .`, and `git diff --check` — passed.
- Evidence revision: `efcae46` (`feat(repo): identify audit and conform targets`).

### Outstanding concerns

None.

### Mini recap

Separating the target from the supplier in the report header makes the result usable in sweeps without removing provenance. A terminal per-skill status is sufficient to show that a clean skill ran while preserving detailed-level filtering for the findings themselves.
