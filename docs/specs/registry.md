# Repository registry — REGISTRY

This area specifies explicit repository registration and inventory; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Explicit repository selection

### REGISTRY-001 — Physical KI-root registration

`ki registry init` MUST initialise one explicit physical Git root and register its complete KI identity.

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `initializes one explicit physical Git root and registers its complete KI identity`.

### REGISTRY-002 — Validated registration boundary

`ki registry init` MUST reject non-Git targets and invalid or incomplete explicit identity metadata before writing registry state.

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `refuses non-Git targets and invalid or incomplete explicit identity metadata before writing`.

### REGISTRY-003 — Deterministic local inventory

`ki registry list` MUST present registered repositories as a newline-delimited absolute-path stream.

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `lists registered repositories as a newline-delimited absolute-path stream`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
