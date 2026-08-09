# Bootstrap lifecycle — BOOT

This area specifies first-time user activation and refresh; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Configuration and core inventory

### BOOT-001 — Conservative bootstrap

`ki bootstrap` MUST create the user configuration and detected runtime inventory without replacing an existing configuration unless refresh is explicitly requested.

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `bootstraps without replacement and refreshes the detected installed inventory on request`.

### BOOT-002 — Preserved user state on refresh

`ki bootstrap --refresh` MUST preserve registered local and repository settings while refreshing the current configuration schema.

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `preserves registered local and repository settings while refreshing configuration`.

### BOOT-003 — Complete core capability inventory

`ki bootstrap` MUST refuse an installed canonical Harness that lacks a required bootstrap skill.

_Verify:_ `src/tests/cli/bootstrap/bootstrap.test.ts` — `refuses an installed canonical harness missing a required bootstrap skill`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
