# Knowledge package acquisition — ACQUIRE

This area specifies the as-built `ki acquire` boundary; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Package construction

### ACQUIRE-001 — Deterministic package layout

`ki acquire` MUST create a deterministic Knowledge Exchange Package that conforms to the KIS-0002 payload layout.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `creates a deterministic KEP that conforms to the KIS-0002 payload layout`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-002 — Safe capture validation

`ki acquire` MUST reject malformed metadata, unsafe capture trees, symbolic captures, and unsafe output locations before publishing a package.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `rejects malformed metadata and unsafe capture trees` and `rejects missing capture elements and unsafe output locations`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-003 — No-write dry run

`ki acquire --dry-run` MUST report the proposed package without writing it.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `reports a dry run without writing`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Granola meetings

### ACQUIRE-004 — Read-only provider boundary

`ki acquire granola import` MUST use only the allowlisted read-only Granola MCP discovery, listing, detail, and transcript operations without initiating OAuth, mutating Granola, harvesting knowledge, or writing another repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `stages verified immutable meeting KEPs and leaves unchanged repeats untouched` and `fails helpfully when the read-only MCP contract or source projections are malformed`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-005 — Complete identity enumeration

Granola acquisition MUST enumerate the global population and every live folder across inclusive ISO-date windows, recursively split a 100-result window, deduplicate stable meeting identities, and fail when a saturated one-day window or conflicting projection prevents proof of completeness.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `splits saturated date windows and fails closed on a saturated single day`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-006 — Explicit receiver reconciliation

Granola acquisition MUST route meetings through registered repositories' stable folder, unfoldered, and residual selectors; report exclusions and inferred-unfoldered identities; and fail closed on uncovered or conflicting receivers unless every duplicate folder mapping is explicitly intentional.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `fails closed on receiver conflicts and permits explicit intentional duplication`, `reports uncovered routing, invalid intervals, missing tools, and transcript omissions without invention`, and `requires an available registered eligible target and validates selected folder identities`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-007 — Verified immutable staging

Granola acquisition MUST stage one content-addressed KEP for each selected meeting version beneath `+/_ACQUIRE/granola/<payload-sha256>/` and advance the receiver-local ledger only after every referenced package passes its checksum manifest.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `stages verified immutable meeting KEPs and leaves unchanged repeats untouched` and `resumes verified packages after interruption and refuses corrupted staged evidence`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-008 — Resumable amendment reconciliation

Granola acquisition MUST leave a byte-identical ledger on an unchanged exhaustive repeat, append a new immutable package when a meeting projection changes, and recover verified packages left by an interrupted pre-ledger run without rewriting earlier versions.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `stages verified immutable meeting KEPs and leaves unchanged repeats untouched` and `resumes verified packages after interruption and refuses corrupted staged evidence`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### ACQUIRE-009 — Faithful projections and omissions

Each Granola KEP MUST retain canonical source listing, detail, folder-evidence, and available transcript projections while recording unavailable provider fields and transcripts as explicit omissions rather than invented content.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/acquire/granola.test.ts` — `reports uncovered routing, invalid intervals, missing tools, and transcript omissions without invention`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
