---
id: KI-TOOL-CLI-038
area: CLI
title: Resolve code audit
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 268b256ae8539a36011e3503f68bc2e2fe6557ea
---

## Goal

Improve the CLI's test-contract fidelity and preserve codebase navigability by resolving the validated findings from the 2026-08-10 code audit without changing user-facing behaviour.

## Context

The code audit found no high-severity concern and confirmed that the CLI's `run(args, context)` seam and isolated sandbox are strong architectural test boundaries. This delivery addresses its two bounded test-contract improvements: retain stdout and stderr separately in the shared test helper, and make the boundary guard resolve imports rather than match a narrow pattern.

## Boundary

Do not change the public CLI contract, introduce a broad rewrite, or apply the separate portable `ki-engineering` standards change here. The `core` to `agents` dependency direction and responsibility hotspots remain separate follow-up work. Do not replace clear local duplication with a generic abstraction.

## Current state

`Sandbox.run()` merges both streams into `output`; the optional capture callback is the only way to assert an individual stream. The CLI boundary guard matches only one relative-import spelling and misses nested imports such as `../../../core/runtime.ts`.

## Steps

- [x] Expose separate `stdout` and `stderr` transcripts from `Sandbox.run()` while retaining its merged chronological `output` for existing assertions.
- [x] Assert normal output and parser diagnostics through their respective stream transcripts in the root CLI contract tests.
- [x] Replace the test-boundary import regex with relative-specifier resolution and prove that it detects a nested product import without flagging the shared sandbox.

## Files touched

- `src/tests/cli/_cli_helper.ts`
- `src/tests/cli/root/unknown.test.ts`
- `src/tests/cli/root/test-boundary.test.ts`

## Verify

- `bunx vitest run src/tests/cli/root/unknown.test.ts src/tests/cli/root/test-boundary.test.ts`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check src/tests/cli/_cli_helper.ts src/tests/cli/root/unknown.test.ts src/tests/cli/root/test-boundary.test.ts`

## Dependencies / blocks

No local work-item dependencies. This delivery has no external coordination or migration prerequisite.

## Review

### Delivered

The bounded test-contract slice is ready for review. It strengthens the test harness and test-boundary guard without changing the public CLI.

### Summary of changes

`Sandbox.run()` now records separate `stdout` and `stderr` transcripts as well as its existing merged chronological `output`. The new stream properties are non-enumerable so existing exact assertions over `{ exitCode, output }` remain valid. Root CLI tests verify that version output reaches stdout and parser diagnostics reach stderr.

The import-boundary guard now resolves each static or dynamic import specifier relative to its test file and rejects any resolved product-code import outside the shared CLI sandbox. A temporary nested fixture proves it detects `../../../core/runtime.ts` while the real CLI tests remain clean.

### Verification

- `bunx vitest run src/tests/cli/root/unknown.test.ts src/tests/cli/root/test-boundary.test.ts` — passed (3 tests).
- `bunx tsc --noEmit` — passed.
- `bunx @biomejs/biome check src/tests/cli/_cli_helper.ts src/tests/cli/root/unknown.test.ts src/tests/cli/root/test-boundary.test.ts` — passed.
- `bun run test:coverage` — passed (39 files, 585 tests; 100% statements, branches, functions, and lines).

### Outstanding concerns

The audit's dependency-direction and responsibility-hotspot findings remain intentionally out of scope for this narrow test-contract delivery. They need separately scoped work before any structural refactor.

### Post-change review

No public CLI behaviour changed. The test harness retains the established combined transcript and only adds independently assertable stream transcripts. The boundary guard now detects the nested import form that motivated the audit finding.

### Mini recap

This item completes the first, low-risk audit response: improve the architectural test boundary before considering broader code movement or module splits.

## Discussion

### Audit findings

The audit observed that the shared CLI test helper merges stdout and stderr, obscuring an important Unix CLI contract. Its import-boundary test does not resolve realistic nested product imports.

### Delivery approach

The test-harness changes are independent and should precede structural refactors, so later work has stronger regression protection. The dependency direction and module splits remain separate, bounded changes: no aggregate "cleanup" pass and no mandatory decomposition of a coherent module.
