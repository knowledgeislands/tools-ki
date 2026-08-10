---
id: KI-TOOL-CLI-041
area: CLI
title: Separate repository progress
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Make interactive repository-operation progress understandable independently of final audit and conform reporting, without changing terminal output.

## Context

`src/core/repository-reporting.ts` is 948 lines. Its first two-thirds implement terminal progress timing, animation, cursor control, and execution wrappers; its final third renders audit, education, and conform results. Both areas are related to reporting but have distinct inputs, lifecycle, and test surfaces.

## Boundary

Do not alter CLI output, progress timing, terminal-control behaviour, or report vocabulary. Do not split final audit and conform rendering in this item, and do not create a generic UI framework.

## Current state

Progress wrappers (`runPreparedWithProgress`, `runWithProgress`, and `runWithEvidenceProgress`) share state and terminal rendering with no result-frame dependency. Final report functions consume completed results but do not need animation state.

## Steps

- [ ] Extract the progress model, terminal tracker, and execution wrappers to `src/core/repository-progress.ts`.
- [ ] Update the repository command factory to import progress and final-report contracts from their owning modules, without compatibility re-exports.
- [ ] Prove exact interactive and non-interactive audit and conform output contracts after the extraction.

## Files touched

- `src/core/repository-progress.ts`
- `src/core/repository-reporting.ts`
- `src/commands/repo/index.ts`
- `src/tests/cli/repo/repo.test.ts`
- `src/tests/cli/repo/progress-stages.test.ts`
- `src/tests/cli/repo/conform-writes.test.ts`

## Verify

- `bunx vitest run src/tests/cli/repo/repo.test.ts src/tests/cli/repo/progress-stages.test.ts src/tests/cli/repo/conform-writes.test.ts`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

No local dependency blocks this refactor. The existing repository CLI contract suite covers both progress and final result frames.

## Delegation

A worker may inspect or perform the mechanical progress extraction only within the listed files. The orchestrator reviews interactive and non-interactive output evidence and runs the full stated verification before this item can reach review.

## Discussion

### Chosen seam

Progress is a stateful in-flight concern; final reporting is a completed-result concern. Extracting the former preserves the reporting vocabulary while making the two responsibilities easier to navigate and test at the CLI boundary.
