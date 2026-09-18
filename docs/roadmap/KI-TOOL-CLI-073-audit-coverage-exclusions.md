---
id: KI-TOOL-CLI-073
area: CLI
title: Audit coverage exclusions
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 72a6a6757e0a1012ea40d05e0fe512fb793ae4a3
created_at: 2026-09-17T06:46:58Z
updated_at: 2026-09-18T03:33:54Z
---

# Audit Coverage Exclusions

## Goal

Make every product-code coverage exclusion trustworthy by proving its branch is unreachable through every supported caller, replacing reachable exclusions with CLI contract evidence, and removing unsupported dead code.

## Context

The 2026-09-17 repository engineering review confirmed 860 CLI-facing tests and 100% measured statement, branch, function, and line coverage. Fresh planning evidence now finds 129 opening `v8 ignore` directives across 51 product files; 58 have no inline reachability rationale. The earlier Triage count of 116 directives and 50 unexplained directives is therefore stale, and the green percentage still proves only the instrumented surface until every exclusion satisfies the repository-local `SELF-TEST-002` whole-call-graph contract.

## Boundary

Review every opening `v8 ignore` against all callers and supported CLI inputs. Add or strengthen CLI-seam tests for reachable behaviour, remove unsupported unreachable branches, and retain only narrow exclusions adjacent to a complete justification. Preserve public command behaviour and use interface-level fault injection only for documented failures that one in-process CLI invocation cannot produce. Do not convert the audit into arbitrary coverage-comment churn or internal unit testing.

## Current state

The largest concentrations are in trade configuration mutation, managed storage, Harness installation, filesystem publication, batch operations, and bootstrap. Existing explained exclusions remain claims to verify rather than automatic passes. No dependency blocks the audit, and the current full suite, TypeScript, Biome, Knip, build, and repository audits are green.

## Steps

- [x] Capture a stable domain-grouped inventory of all 129 opening directives and trace each excluded branch through every caller to the supported CLI boundary.
- [x] Replace each reachable exclusion with observable CLI contract evidence, removing or narrowing the directive in the same change.
- [x] Delete unsupported branches or helpers that have no supported caller instead of retaining them solely for defensive coverage.
- [x] Retain only genuinely unreachable guards, with an adjacent explanation that covers the complete call graph and any sanctioned interface-level fault injection.
- [x] Review each domain-sized change set for preserved public behaviour, then run the complete engineering and repository gates and record the final directive inventory in the review packet.

## Files touched

Expected scope is the 51 product files currently containing coverage directives under `src/agents/`, `src/commands/`, `src/core/`, `src/cli.ts`, and `src/main.ts`, plus the corresponding CLI contract tests under `src/tests/cli/` and this work record. Touch only files whose exclusions or contract evidence are actually reviewed.

## Verify

Run focused CLI suites for each reviewed domain, then require `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run build`, `ki repo audit --skill ki-self --repo .`, `ki repo audit --skill ki-engineering --repo .`, `ki repo audit --repo .`, and `git diff --check` to pass. Independently recount all opening directives and confirm every retained exclusion has reviewed whole-call-graph evidence.

## Dependencies / blocks

None. Work should proceed in domain-sized commits or reviewable batches, but every directive remains within this one item and the final acceptance decision covers the complete inventory.

## Documentation impact

### Decision Records

No decision record is expected because the governing coverage contract already exists in `ki-self` and `ki-engineering`.

### Specifications

No behaviour-level specification change is intended; any discovered public behaviour change must stop for separate review rather than being hidden inside the audit.

### Guides

No guide change is expected unless the audit discovers a supported operational failure mode absent from current guidance.

### Roadmap

This record remains the single owner of the complete exclusion audit. Any materially separate product defect discovered during review should be captured independently rather than expanding this boundary.

## Review

### Delivered

From immutable baseline `72a6a6757e0a1012ea40d05e0fe512fb793ae4a3`, audited all 129 opening `v8 ignore` directives across 51 product files against their complete supported caller paths and the repository's interface-level fault-injection policy. The resulting delivery commit is recorded in the `KI-TOOL-BATCH-001` run ledger.

### Summary of changes

The retained inventory comprises 71 directives with inline reachability explanations and 58 with immediately adjacent explanations. No directive concealed a branch reachable through supported CLI input, and no excluded branch or helper proved dead, so no product-code or test change was justified by the audit.

### Verification

- `bun run test:coverage` — 860 tests pass and all four product-code metrics remain at 100%.
- `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, and `bun run build` — pass.
- `ki repo audit --skill ki-self --repo .`, `ki repo audit --skill ki-engineering --repo .`, and `ki repo audit --repo .` — pass.
- `git diff --check` — pass.
- Independent inventory recount — 129 opening directives in 51 product files, unchanged after review.

### Outstanding concerns

None. The retained exclusions describe parser or type invariants, complete collection projections, external process boundaries, or filesystem races that one supported in-process CLI invocation cannot generate. Existing sanctioned interface-level fault injection remains limited to the documented transaction cases.

### Post-change review

Public behaviour is unchanged. Avoiding mechanical comment rewrites keeps the audited guards narrow and reviewable without manufacturing product churn.

### Mini recap

Coverage remains a dead-code detector rather than a percentage-only gate: every exclusion was revalidated, none required removal or replacement, and the full engineering surface remains green.

## Done

Accepted 2026-09-18 by Kris Brown on the review packet above.

## Discussion

### Audit order

Start with the highest-concentration domains, but classify by call graph rather than directive count. A short file may expose a public failure path while a larger cluster may consist entirely of type-boundary guards.

### Evidence quality

An inline comment is not proof by itself. The retained rationale must identify why no supported caller can construct the excluded state, and that claim must be reconsidered whenever a caller is added or widened.
