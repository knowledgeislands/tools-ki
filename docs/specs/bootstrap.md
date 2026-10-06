# Bootstrap lifecycle — BOOT

This area specifies first-time user activation and refresh; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Configuration and core inventory

### BOOT-001 — Conservative bootstrap

`ki bootstrap` MUST create unversioned user configuration and detected runtime inventory without replacing an existing configuration unless refresh is explicitly requested. It MUST read a structurally valid legacy `schema = 1` configuration without silently rewriting it, and reject unknown schema values.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `bootstraps without replacement and refreshes the detected installed inventory on request`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### BOOT-002 — Preserved user state on refresh

`ki bootstrap --refresh` MUST preserve registered local and repository settings while refreshing the current unversioned configuration shape.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `preserves registered local and repository settings while refreshing configuration`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### BOOT-003 — Complete core capability inventory

`ki bootstrap` MUST refuse an installed canonical Harness that lacks a required bootstrap skill.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `refuses an installed canonical harness missing a required bootstrap skill`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Local development

### BOOT-004 — Kept local development binding

When the canonical Harness root is linked to its configured local checkout, `ki bootstrap` and `ki bootstrap --refresh` MUST keep that binding and project the core user skills from the checkout, and MUST NOT restore the verified archive. When a canonical root link cannot be kept, because its checkout is missing, it targets another checkout than the configured one, or no local checkout is configured, bootstrap MUST warn on standard error, naming the reason and the recovery, before restoring the verified archive, and MUST then re-point every configured canonical skill the archive provides. An active checkout that fails inspection MUST fail bootstrap without changing the binding.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `keeps an active local development binding without contacting the archive`, `rolls back local skill projections when refresh fails after linking them`, `warns loudly before restoring the archive when a local development binding cannot be kept` and `fails closed without leaving local development when the active checkout is incomplete`; `src/tests/cli/dev/dev.test.ts` — `restores the verified archive over a development link whose checkout is missing`.

_Evidence:_ The named CLI contract tests are part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
