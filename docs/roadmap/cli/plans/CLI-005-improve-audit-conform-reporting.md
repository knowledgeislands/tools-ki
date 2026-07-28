---
id: 'CLI-005'
title: 'Improve audit and conform reporting'
status: in-progress
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
