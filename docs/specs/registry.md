# Repository registry — REGISTRY

This area specifies explicit repository registration and inventory; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Explicit repository selection

### REGISTRY-001 — Physical KI-root registration

`ki repo init` MUST initialise one explicit physical Git root and register its complete KI identity.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `initializes one explicit physical Git root and registers its complete KI identity`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REGISTRY-002 — Validated registration boundary

`ki repo init` MUST reject non-Git targets and invalid or incomplete explicit identity metadata before writing registry state.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `refuses non-Git targets and invalid or incomplete explicit identity metadata before writing`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REGISTRY-003 — Deterministic local inventory

`ki registry list` MUST present registered repositories as a newline-delimited absolute-path stream.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `lists registered repositories as a newline-delimited absolute-path stream`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REGISTRY-004 — Registered-estate selector

`ki registry --estate <operation>` MUST select the same repositories as `ki registry --agora estate <operation>`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `lists registered repositories as a newline-delimited absolute-path stream`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### REGISTRY-005 — Path-free machine inventory

`ki registry list --format json` MUST emit schema `ki/registry/v1` with canonical repository identity and declared metadata, MUST NOT expose local paths, and MUST return non-zero when any registered repository is unavailable.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `projects registered declaration metadata without exposing local paths`.

_Evidence:_ The named registry contract test is part of the passing `bun run test:coverage` gate.

### REGISTRY-006 — Exact transactional removal

`ki registry remove` MUST remove exactly one entry selected by registry key or one `--repo` path, MUST reject bulk selectors, and MUST preserve registry state when validation or publication fails.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/registry/registry.test.ts` — `removes one complete stale registry entry by key dry-run transactional publication`, `removes exact live stale registry paths retains empty valid registry`, and `requires exactly one key path rejects bulk or unknown registry removal selectors`.

_Evidence:_ The named registry contract tests are part of the passing `bun run test:coverage` gate.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
