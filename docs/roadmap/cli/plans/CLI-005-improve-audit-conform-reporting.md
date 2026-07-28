---
id: 'CLI-005'
title: 'Improve audit and conform reporting'
status: open
roadmap: cli/make-audit-and-conform-output-name-its-target-and-its-passes
blocks: —
blocked-by: —
baseline-ref: —
---

## Context

`ki repo audit` and `ki repo conform` report the supplying harness and skill, but not the repository being assessed. In a multi-repository sweep this makes repeated provider prefixes look like targets. Their default reporter also omits a skill with no visible finding, leaving a successful assessment indistinguishable from a skill that was never run.

## Current state

- `renderReports` in `src/commands/repo.ts` renders `==> <provider>:<skill>:<operation>` only when a report has a finding selected by `--reporter-levels`.
- The command resolves a physical repository root before each operation, but does not pass it into reporting.
- The recap is aggregate-only; it cannot prove that an individual clean skill ran.
- Existing CLI contract tests cover level filtering, clean operations, progress, and conform re-audit output, providing the appropriate public seam for this change.

## Steps

1. Define the stable human-readable reporting contract for audit and conform: target repository identity first, provider identity retained as provenance, and one per-skill terminal result even when no finding is selected for display.
2. Thread the resolved repository target through the host-owned renderer and implement the contract consistently for audit, dry-run conform, successful conform re-audit, and failure reporting without changing finding levels, exit status, or progress streams.
3. Make the unconditional per-skill result concise and deterministic, including a positive clean/pass indication and the existing judgment-unevaluated count where applicable; preserve detailed findings only for requested reporter levels.
4. Update CLI help or user documentation where the settled reporting surface needs to explain the target/provenance distinction and default clean-result visibility.
5. Add CLI-contract cases through `sandbox()` for clean audit and conform results, filtered findings, multiple declared skills, target identity, provider provenance, and unchanged error and progress behavior; retain 100% coverage.
6. Run the complete verification gate and update this plan with the implemented contract and evidence, without a tag, release, push, or Homebrew-tap change.

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
