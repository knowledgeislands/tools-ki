# Compatible Harnesses — HARN

This area specifies installed compatible Harness lifecycle behaviour; see the [Feature Definitions index](index.md) for the corpus conventions and registered prefixes.

## Verified installation

### HARN-001 — Immutable archive verification

`ki harness install` MUST verify configured immutable evidence and reject an archive that does not match it before creating an installation.

_Verify:_ `src/tests/cli/harness/harness.test.ts` — `refuses an archive that does not match configured immutable evidence without creating an installation`.

### HARN-002 — Safe replacement

`ki harness reinstall` MUST keep the installed Harness intact when a replacement payload is invalid.

_Verify:_ `src/tests/cli/harness/harness.test.ts` — `keeps an installed harness intact when a replacement payload is invalid`.

### HARN-003 — Protected canonical and active state

`ki harness` MUST refuse removal of the canonical Harness and refuse replacement or removal of a Harness while it supplies an active user skill.

_Verify:_ `src/tests/cli/harness/harness.test.ts` — `blocks replacement and removal while a supplied user skill is active` and `refuses to uninstall the canonical harness`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
