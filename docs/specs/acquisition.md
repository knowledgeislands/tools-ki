# Knowledge package acquisition — ACQUIRE

This area specifies the as-built `ki acquire` boundary; see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Package construction

### ACQUIRE-001 — Deterministic ChatGPT package layout

`ki acquire import --adapter chatgpt` MUST create a deterministic Knowledge Exchange Package conforming to the KIS-0002 payload layout.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `creates a deterministic KEP that conforms to the KIS-0002 payload layout`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-002 — Safe capture validation

ChatGPT acquisition MUST reject malformed metadata, unsafe capture trees, symbolic captures, unsafe output locations, and missing relationship assets before publishing a package.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` malformed-input and unsafe-path cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-003 — No-write dry run

Every adapter supporting import dry run MUST report its proposed result without writing repository or package state.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `reports a dry run without writing`; `src/tests/cli/acquire/granola.test.ts` dry-run assertions.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Granola meetings

### ACQUIRE-004 — Read-only provider boundary

`ki acquire import --adapter granola` MUST use only allowlisted read-only Granola MCP account, folder, meeting-list, meeting-detail, and transcript operations without initiating OAuth, mutating Granola, harvesting knowledge, or writing another repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` provider-contract, read-only, and no-provider-mutation assertions.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-005 — Complete identity enumeration

Granola acquisition MUST enumerate the global population and every live folder across inclusive ISO-date windows, recursively split a saturated 100-result window, deduplicate stable identities, and fail when saturation or conflicting projections prevent proof of completeness.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `splits saturated date windows and fails closed on a saturated single day` and conflicting-projection cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-006 — Explicit receiver reconciliation

Granola acquisition MUST route meetings through registered repositories' stable folder, unfoldered, and residual selectors; report exclusions and inferred-unfoldered identities; and fail closed on uncovered or conflicting receivers unless every duplicated folder mapping is explicit.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` receiver-conflict, coverage, duplication, and peer-selector cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-007 — ~~Content-addressed Granola KEP publication~~ (deprecated)

Deprecated in 2026-09-16 when receiver-local meeting Markdown and component checkpoints replaced immutable per-version KEP directories.

### ACQUIRE-008 — ~~Pre-ledger package recovery~~ (deprecated)

Deprecated in 2026-09-16 when the schema-three in-progress journal became the authoritative interrupted-run recovery mechanism.

### ACQUIRE-009 — ~~Granola KEP source projections~~ (deprecated)

Deprecated in 2026-09-16 when explicit Markdown fields, component hashes, transcript state, and disposition evidence replaced KEP projection bundles.

## Adapter execution

### ACQUIRE-010 — Verified adapter declarations

`ki acquire` MUST discover adapters from verified machine-readable Harness skill metadata that declares adapter identity, supported actions, repository and invocation properties, capabilities, omissions, read-only boundary, checkpoint contract, and reset scopes; it MUST NOT infer executability from a skill name or parse prose instructions at runtime.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/adapters.test.ts` valid, invalid, repeated-field, duplicate-adapter, and missing-executable cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-011 — Action-first selection

`ki acquire` MUST expose `list`, `import`, `status`, `reconcile`, and `reset` as actions; select exactly one adapter with `--adapter`, all applicable enabled adapters with `--all`, or infer only a sole enabled adapter; and reject the retired provider-first grammar.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/adapters.test.ts` selection, ambiguity, mutual-exclusion, unsupported-action, and retired-grammar cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-012 — Invocation-property isolation

Common invocation options MAY be used with `--all`, but an adapter-specific invocation property MUST require explicit `--adapter <name>` and MUST be rejected with `--all` before provider contact or repository mutation; persistent declared adapter configuration MAY still apply during `--all`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/adapters.test.ts` — `allows common options with --all and rejects adapter invocation properties before execution`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-013 — Separate detail and transcript observations

Granola acquisition MUST hash mutable detail separately from transcript content, exclude transcript content from the detail hash, reuse a verified transcript by default, retry an unavailable transcript under a bounded policy, and support explicit single-adapter transcript refresh.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `separates mutable detail from cached transcripts and supports explicit refresh` and bounded-omission cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-014 — Atomic resumable generations

Granola acquisition MUST atomically replace an in-progress journal and authoritative checkpoint, bind the journal to adapter, repository, account, source schema, interval, and identity selection, resume verified components without treating the journal as completion, and advance the checkpoint only after every selected identity verifies.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` interrupted-resume, missing-staged-component, corrupt-journal, incompatible-journal, and checkpoint-advancement cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-015 — Post-acquisition disposition

A Granola checkpoint MUST represent staged, retained, harvested-local, trade-routed, superseded, and awaiting-review dispositions with applicable destination, document, trade, timestamp, and covered-source evidence; an unchanged disposed source MUST NOT be restaged, while later detail change MUST stage an amendment for renewed review.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `accepts harvested local dispositions and stages changed-source amendments for review`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-016 — Governed local reset

`ki acquire reset` MUST show its local reset plan before mutation, require explicit confirmation, distinguish adapter, source, component, and complete-rebuild scopes, reject incompatible scope combinations, and never authorize provider mutation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` reset planning, confirmation, scope, and no-provider-call cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behavior is in scope for this area.
