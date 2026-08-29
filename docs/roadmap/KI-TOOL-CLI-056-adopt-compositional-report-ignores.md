---
id: KI-TOOL-CLI-056
title: Adopt compositional report ignores
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: cef9b02b04e32f486aab197460a6db836b4866cd
---

# KI-TOOL-CLI-056: Adopt compositional report ignores

## Goal

Adopt the Harness-owned compositional `.gitignore` contract and reserved generated-report namespace by moving Vitest coverage output to `reports/coverage` and reconciling repository ignores through the declared conform operations.

## Context

`TRD-24b05090` carries the accepted Harness operating model: `ki-repo` is the sole `.gitignore` composer, managed skill blocks remain marker-bounded, repository-specific rules remain under the terminal unmanaged header, and disposable generated reports live beneath `reports/`.

The repository currently redirects Vitest coverage to a process-specific temporary directory and retains a standalone `coverage/` ignore rule, so its local configuration does not yet express that shared contract.

## Boundary

This item owns the repository conform pass, Vitest coverage-output configuration, generated-output hygiene, and the audits and engineering gates needed to verify the result. It does not hand-edit managed marker blocks, introduce another `.gitignore` writer, remove tracked or non-reproducible output, change `dist/` as the build-output directory, or mutate another repository.

## Current state

Vitest writes coverage reports to a process-specific directory under the operating system's temporary directory. The repository's unmanaged `.gitignore` section separately ignores `coverage/`; it has no generated `reports/` namespace. No `coverage/` or `reports/` output is tracked, and neither directory currently exists in the working tree.

The selected `ki-work-roadmap` and `ki-trades` audits pass before this item. A complete repository conform dry run exceeded the initial 30-second observation window without producing a result, so implementation must run it to completion rather than infer its writes.

## Steps

- [x] Run the complete declared repository conform operation so the active Harness reconciles `.gitignore` through its sole composer.
- [x] Inspect the conform diff and preserve repository-specific rules beneath the terminal unmanaged header; do not hand-edit any managed marker block.
- [x] Set Vitest's coverage reports directory to `reports/coverage` and remove imports used only by the temporary-directory path.
- [x] Confirm any generated output considered for removal is untracked and reproducible before removing it; retain `dist/` as build output.
- [x] Run the complete repository audit and the repository's TypeScript, coverage, and formatting gates.

## Files touched

- `.gitignore`
- `vitest.config.ts`

The complete conform operation may update additional managed projection files; any such write must be reviewed and attributed before it enters the implementation commit.

## Verify

- `ki repo conform --repo .`
- `ki repo audit --repo .`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx biome check`
- Confirm Vitest produces ignored, reproducible output beneath `reports/coverage` while `dist/` remains the build-output directory.

## Dependencies / blocks

No local work-item dependency blocks delivery. The compatible Harness contract arrived through `TRD-24b05090`; implementation remains local to `tools-ki`.

## Documentation impact

### Decision Records

No local Decision Record is planned because `ADR-KI-HARNESS-013` owns the compositional ignore and report-output contract.

### Specifications

No behaviour specification change is planned; this item conforms repository tooling configuration to the accepted Harness contract.

### Guides

No guide change is planned unless implementation reveals a user-visible generated-report workflow.

### Roadmap

Retain this record through implementation review and acceptance. The adopted inbound trade remains linked as its source.

## Review

### Delivered

Delivered the approved local configuration boundary from immutable baseline `cef9b02b04e32f486aab197460a6db836b4866cd`. The Harness composer now owns the marker-bounded `.gitignore` blocks, Vitest writes disposable coverage reports beneath `reports/coverage`, repository-specific ignores remain in the terminal unmanaged section, and `dist/` remains build output. No tracked or non-reproducible generated output was removed, and no other repository was changed.

### Summary of changes

- `.gitignore` now contains the `ki-repo` and `ki-engineering` managed ignore blocks produced by the complete conform operation, followed by the preserved repository-specific `.claude/agents/` rule.
- `vitest.config.ts` now uses the repository-relative `reports/coverage` directory and no longer imports temporary-directory path helpers.
- The generated coverage tree is ignored by the managed `reports/` rule and remains untracked.

### Verification

- `ki repo conform --repo . --progress never --concise` — PASS across all 18 declared skills after the completed configuration change.
- `ki repo audit --repo . --progress never` — PASS across all 18 declared skills.
- `bunx tsc --noEmit` — PASS.
- `bun run test:coverage` — PASS: 42 files and 685 tests; 100% statements, branches, functions, and lines.
- `bunx biome check` — PASS with no fixes; Biome reported one informational schema-version notice.
- `git check-ignore -v reports/coverage reports/coverage/lcov.info` — both paths resolve to the managed `reports/` rule; `git ls-files 'reports/**' 'coverage/**'` returns no tracked output.

### Outstanding concerns

Biome reports that `biome.json` references schema `2.5.7` while the installed CLI is `2.5.10`. This informational, pre-existing toolchain drift did not fail the gate and is outside this item's approved boundary.

### Post-change review

The delivered changes meet the goal without introducing another ignore writer or a compatibility path. The main regression risk was hiding tracked output or losing repository-specific rules; the tracked-output check and preserved terminal unmanaged section address both. The item is ready for acceptance review.

### Mini recap

`KI-TOOL-CLI-056` adopted the Harness report-output convention locally, verified the full repository governance and engineering gates, and leaves only an unrelated informational Biome schema notice. No durable learning needs promotion beyond the existing Harness Decision Record and this retained work record.

## Done

Accepted by the user on 2026-08-29. The reviewed delivery is recorded in `cbdc7412e37598ada93907ff48b4af7c9d725a04`; its six-part review packet is complete, the delivery paths remain unchanged from that commit, and the informational Biome schema notice remains non-blocking. This acceptance action did not push the repository.

## Discussion

### Source

Adopted from inbound work trade `TRD-24b05090` from `knowledgeislands/ki-agentic-harness`.

### Delivery boundary

The conform operation is authoritative for `.gitignore`; a manual managed-block edit or second writer would violate the contract even if it produced the same lines. Coverage output relocation and generated-output cleanup remain separately reviewable local effects within the same bounded item.
