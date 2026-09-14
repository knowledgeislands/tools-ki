# Repository registry — REGISTRY

This area specifies explicit repository registration and inventory; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Explicit repository selection

### REGISTRY-001 — Physical KI-root registration

`ki registry init` MUST initialise one explicit physical Git root and register its complete KI identity.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `initializes one explicit physical Git root and registers its complete KI identity`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### REGISTRY-002 — Validated registration boundary

`ki registry init` MUST reject non-Git targets and invalid or incomplete explicit identity metadata before writing registry state.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `refuses non-Git targets and invalid or incomplete explicit identity metadata before writing`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### REGISTRY-003 — Deterministic local inventory

`ki registry list` MUST present registered repositories as a newline-delimited absolute-path stream.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `lists registered repositories as a newline-delimited absolute-path stream`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### REGISTRY-004 — Registered-estate selector

`ki registry --estate <operation>` MUST select the same repositories as `ki registry --agora estate <operation>`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `lists registered repositories as a newline-delimited absolute-path stream`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
