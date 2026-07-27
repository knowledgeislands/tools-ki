---
id: 'CLI-004'
title: Deliver native repository maintenance through registered skills
status: done
roadmap: cli/deliver-native-repository-maintenance-through-registered-skills
blocks: —
blocked-by: —
baseline-ref: 99e714d5084cd58e026daaf70086efd006177478
---

## Context

`ki repo educate`, `ki repo audit`, and `ki repo conform` replace repository-vendored runners with direct Bun capabilities. `ki` resolves the selected repository's `.ki-config.toml` declarations against installed compatible harnesses and runs their rubrics through one `tools-ki`-owned governed-rubric runtime.

[ADR-KI-TOOLS-001](../../decisions/ADR-KI-TOOLS-001-typescript-native-command-host.md) and [ADR-KI-TOOLS-002](../../decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md) define the tools-owned host and registry boundary. Harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) owns the remaining skill-catalogue and source-harness cutover.

## Current state

The planned implementation is delivered: verified installed-harness acquisition, explicit user and repository activation, `.ki-config.toml` dependency resolution, development links, static rubric education, in-process audit, bounded subprocess actions, transactional conform and dry-run, guarded publication, post-conform re-audit, rubric publication, progress, and finding rendering.

The canonical harness has proved the runtime through a development-linked payload. No CLI-004 implementation unit remains.

The repository-wide verification baseline is clean: 305 CLI-contract tests pass, including 100% statements, branches, functions, and lines over product code. TypeScript, Biome, Knip, and the roadmap audit also pass.

## Steps

1. [x] Present the completed implementation and clean verification evidence for manual acceptance.

## Files touched

- The files responsible for the current verification drift
- This plan

## Verify

1. `bun run test` and `bun run test:coverage` pass at the repository's configured thresholds.
2. `bunx tsc --noEmit`, `bunx biome check .`, and `bunx knip` pass.
3. The roadmap audit passes.
4. A canonical development-linked harness still proves audit, byte-identical conform dry-run, host-owned conform, and post-conform re-audit.

## Dependencies / blocks

No implementation dependency remains. FND-004 owns the separate migration of the remaining harness catalogues and source-harness integration surfaces.

## Delegation

- Round 1 — research, `gpt-5.6-terra`: classify every remaining coverage span as a CLI-contract test, a justified unreachable guard, or removable code; files: read-only `src/` and `src/tests/`; gate: orchestrator review of a complete file-and-line disposition before any write.
- Round 2 — mechanical, `gpt-5.6-terra`: add only approved CLI-contract coverage tests in exclusive test-file scopes; gate: orchestrator diff review and the complete coverage gate.
- Orchestrator: owns dispositions, reviews every worker diff, runs final verification, and commits only a clean acceptance unit.

## Acceptance

### Delivered

Native `ki repo educate`, `ki repo audit`, and `ki repo conform` now execute repository-declared skill catalogues from installed compatible harnesses without repository-vendored runners.

### Summary of changes

The CLI owns harness resolution, catalogue loading, governed-rubric execution, transactional conform, publication, progress, and finding rendering. The canonical harness proved the contract through its development-linked payload, and the remaining harness catalogue migration is separately owned by FND-004.

### Verification

- `bun run test:coverage`: 305 tests pass; statements, branches, functions, and lines are all 100%.
- `bunx tsc --noEmit`: passes.
- `bunx biome check .`: passes.
- `bunx knip`: passes.
- `bun bin/ki repo audit --skill ki-roadmap --repo .`: passes.
- The canonical development-linked harness proved audit, byte-identical conform dry-run, host-owned conform, and post-conform re-audit during implementation.

### Outstanding concerns

None within CLI-004. Release acquisition and installer delivery remain owned by CLI-006.

### Mini recap

The repository-maintenance command surface is complete and accepted. The clean end state replaces repository-local executors with one CLI-owned runtime while leaving skill policy and catalogue ownership in compatible harnesses.

## Done

Accepted by the user on 2026-07-27 after review of the completed command surface and verification evidence.
