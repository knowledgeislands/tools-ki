---
id: KI-TOOL-CLI-056
title: Adopt compositional report ignores
area: CLI
theme: cli
horizon: next
status: in-progress
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

- [ ] Run the complete declared repository conform operation so the active Harness reconciles `.gitignore` through its sole composer.
- [ ] Inspect the conform diff and preserve repository-specific rules beneath the terminal unmanaged header; do not hand-edit any managed marker block.
- [ ] Set Vitest's coverage reports directory to `reports/coverage` and remove imports used only by the temporary-directory path.
- [ ] Confirm any generated output considered for removal is untracked and reproducible before removing it; retain `dist/` as build output.
- [ ] Run the complete repository audit and the repository's TypeScript, coverage, and formatting gates.

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

## Discussion

### Source

Adopted from inbound work trade `TRD-24b05090` from `knowledgeislands/ki-agentic-harness`.

### Delivery boundary

The conform operation is authoritative for `.gitignore`; a manual managed-block edit or second writer would violate the contract even if it produced the same lines. Coverage output relocation and generated-output cleanup remain separately reviewable local effects within the same bounded item.
