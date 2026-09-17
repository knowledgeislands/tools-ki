---
id: KI-TOOL-CLI-073
area: CLI
title: Audit coverage exclusions
theme: cli
horizon: now
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T06:46:58Z
updated_at: 2026-09-17T21:02:57Z
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

- [ ] Capture a stable domain-grouped inventory of all 129 opening directives and trace each excluded branch through every caller to the supported CLI boundary.
- [ ] Replace each reachable exclusion with observable CLI contract evidence, removing or narrowing the directive in the same change.
- [ ] Delete unsupported branches or helpers that have no supported caller instead of retaining them solely for defensive coverage.
- [ ] Retain only genuinely unreachable guards, with an adjacent explanation that covers the complete call graph and any sanctioned interface-level fault injection.
- [ ] Review each domain-sized change set for preserved public behaviour, then run the complete engineering and repository gates and record the final directive inventory in the review packet.

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

## Discussion

### Audit order

Start with the highest-concentration domains, but classify by call graph rather than directive count. A short file may expose a public failure path while a larger cluster may consist entirely of type-boundary guards.

### Evidence quality

An inline comment is not proof by itself. The retained rationale must identify why no supported caller can construct the excluded state, and that claim must be reconsidered whenever a caller is added or widened.
