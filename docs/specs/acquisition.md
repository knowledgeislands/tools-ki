# Knowledge package acquisition — ACQUIRE

This area specifies the as-built `ki acquire` boundary; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Package construction

### ACQUIRE-001 — Deterministic package layout

`ki acquire` MUST create a deterministic Knowledge Exchange Package that conforms to the KIS-0002 payload layout.

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `creates a deterministic KEP that conforms to the KIS-0002 payload layout`.

### ACQUIRE-002 — Safe capture validation

`ki acquire` MUST reject malformed metadata, unsafe capture trees, symbolic captures, and unsafe output locations before publishing a package.

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `rejects malformed metadata and unsafe capture trees` and `rejects missing capture elements and unsafe output locations`.

### ACQUIRE-003 — No-write dry run

`ki acquire --dry-run` MUST report the proposed package without writing it.

_Verify:_ `src/tests/cli/acquire/acquire.test.ts` — `reports a dry run without writing`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
