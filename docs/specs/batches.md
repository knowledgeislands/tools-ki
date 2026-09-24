# Batch execution — BATCH

This area specifies the observable lifecycle of governed batch records; see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Execution and evidence

### BATCH-001 — Live open-batch validation

An open batch MUST validate its selected work records through the currently declared work adapter and MUST remain subject to its execution expiry.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/batch.test.ts` — `prepares, validates, starts, records, closes one exact batch without changing work items` and `rejects non-canonical, symbolic, expired, malformed, cross-repository records`.

_Evidence:_ The named batch contract tests are part of the passing `bun run test:coverage` gate.

### BATCH-002 — Exact close evidence

`ki batch close` MUST require an evidence commit containing the exact selected target states and required dependency order before recording completion.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/batch.test.ts` — `requires explicit coherent run results all-item close evidence`.

_Evidence:_ The named batch contract test is part of the passing `bun run test:coverage` gate.

### BATCH-003 — Immutable archival validation

A closed batch MUST validate its selected work state from its recorded evidence commit, independent of later work-record pruning or expiry, and MUST fail if that historical evidence is unavailable or inconsistent.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/batch.test.ts` — `validates closed Knowledge Base batch selected adapter snapshot after pruning` and `leaves failed evidence resolution open and rejects mutation after close`.

_Evidence:_ The named batch contract tests are part of the passing `bun run test:coverage` gate.
