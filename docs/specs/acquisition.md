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

`ki acquire import --adapter granola` MUST use only allowlisted read-only Granola MCP account, folder, meeting-list, meeting-detail, transcript, and screenshot operations without initiating OAuth, mutating Granola, harvesting knowledge, or writing another repository.

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

`ki acquire` MUST discover adapters from verified machine-readable Harness skill metadata that declares adapter identity, supported actions, repository and invocation properties, capabilities, omissions, read-only or explicit-marker boundary, checkpoint contract, and reset scopes; it MUST NOT infer executability from a skill name or parse prose instructions at runtime.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/adapters.test.ts` valid, invalid, repeated-field, duplicate-adapter, and missing-executable cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-011 — Action-first selection

`ki acquire` MUST expose `list`, `import`, `images`, and explicitly selected `mark` as actions; select exactly one adapter with `--adapter`, all applicable enabled adapters with `--all`, or infer only a sole enabled adapter; and reject the retired provider-first grammar.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/adapters.test.ts` selection, ambiguity, mutual-exclusion, unsupported-action, and retired-grammar cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-012 — Invocation-property isolation

Common invocation options MAY be used with `--all`, but an adapter-specific invocation property MUST require explicit `--adapter <name>` and MUST be rejected with `--all` before provider contact or repository mutation; persistent declared adapter configuration MAY still apply during `--all`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/adapters.test.ts` — `allows common options with --all and rejects adapter invocation properties before execution`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-013 — Separate detail and transcript observations

Granola acquisition MUST hash mutable detail separately from transcript content, exclude transcript content from the detail hash, and record both hashes and the transcript state in the capture's front matter. An explicit single-adapter `--refresh` MUST rewrite an existing capture in place at its filed path and MUST retain a transcript the provider no longer returns, with its recorded hash.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `keeps captures unless refreshed and retains a transcript the provider withdraws` and minimal-capture refresh cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### ACQUIRE-014 — ~~Atomic resumable generations~~ (deprecated)

Deprecated on 2026-10-20 when Granola acquisition stopped keeping a ledger, checkpoint or journal; ACQUIRE-019 governs the capture as the only record, and an interrupted run is simply repeated.

### ACQUIRE-015 — ~~Post-acquisition disposition~~ (deprecated)

Deprecated on 2026-10-20 with the checkpoint that carried dispositions; Acquired-folder membership now marks a meeting as dealt with.

### ACQUIRE-016 — ~~Governed local reset~~ (deprecated)

Deprecated on 2026-10-20 when `ki acquire reset`, `status` and `reconcile` were removed with the local acquisition state they governed.

### ACQUIRE-017 — MCP screenshot preservation

Granola import MUST restrict every listing to principal-owned notes, complete folder and transcript pagination, reconcile screenshot counts and distinct attachment UUIDs, fetch at most five images per request, bind image metadata to requested identities, and validate canonical base64, true format and MIME. Exact returned bytes, metadata, counts and checksums MUST be stored beside the meeting before its document is written; prior evidence and immutable attachment bytes remain preserved. Unsupported attachment access MUST remain an explicit omission. A known daemon frame-limit failure MUST reduce the batch, down to singletons, without modifying returned bytes; a singleton failure MUST remain visible.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola-marker.test.ts` owned-note, paging, screenshot identity, batching, format, dry-run and variant cases.

_Evidence:_ Public in-process CLI fixtures establish the returned-byte boundary; equality with separately exported desktop originals remains outside it.

### ACQUIRE-018 — Explicit progress markers

Routine Granola import MUST skip Acquired members on that membership alone, without content reads or a preservation check, and MUST NOT flag them or change their captures. Explicit `--refresh-acquired` MUST bypass that skip and implies `--refresh`. Marking MUST remain a separate preview/`--confirm` action, require an owner-controlled private selector distinct from routing, and verify exactly one committed capture, fresh source hashes against its front matter and screenshot bytes before invoking only `add_note_to_folder`. Readback MUST preserve all original memberships. No marker confers reconciliation or retirement authority.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola-marker.test.ts` preview, committed evidence, private folder, mutation allowlist, idempotence, membership-only skip, unchanged uncommitted capture, refresh, amendment, duplicated-capture and failed-marker cases.

_Evidence:_ Synthetic public CLI tests exercise both read and explicitly confirmed write paths without live network access.

### ACQUIRE-019 — Capture as the only record

Granola acquisition MUST read and write no repository acquisition state: no ledger, checkpoint, journal or flagged-identity file. It MUST find an existing capture by its meeting UUID wherever it is filed beneath the capture directory, MUST keep it rather than overwrite it unless `--refresh` is explicit, and MUST always keep, and report, several captures of one meeting or a capture bound to another Granola account. Each new meeting MUST be written to its folder-mapped capture path. Granola remains read-only during import.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `stages one readable Markdown file per meeting and keeps existing captures unless refreshed`, `ignores retired ledgers and refuses a capture with $name`, moved-capture, several-capture and account-binding cases.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behavior is in scope for this area.
