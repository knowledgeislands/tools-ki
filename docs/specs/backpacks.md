# Compatible backpacks — HARN

This area specifies installed compatible backpack lifecycle behaviour; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Verified installation

### HARN-001 — Immutable archive verification

`ki backpack install` MUST verify configured immutable evidence and reject an archive that does not match it before creating an installation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack.test.ts` — `refuses an archive that does not match configured immutable evidence without creating an installation`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-002 — Safe replacement

`ki backpack reinstall` MUST keep the installed backpack intact when a replacement payload is invalid.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/lifecycle.test.ts` — `keeps an installed backpack intact when a replacement payload is invalid`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-003 — Protected canonical and active state

`ki backpack` MUST refuse removal of the canonical backpack and refuse replacement or removal of a backpack while it supplies an active user skill.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/lifecycle.test.ts` — `blocks replacement and removal while a supplied user skill is active`; `src/tests/cli/backpack/backpack.test.ts` — `refuses to uninstall the canonical backpack`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-004 — Explicit capability prefix

Every installed backpack MUST declare a lowercase alphanumeric `prefix` in `[skills.ki-repo-backpack]` in its root `.ki.toml`, and every published skill name MUST begin with `<prefix>-`. For one release, `ki` MUST still read the prefix from the retired `[skills.ki-repo-harness]` table when `[skills.ki-repo-backpack]` is absent.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack.test.ts` — `requires provider-authored backpack prefix metadata`; `requires published skills to use the declared backpack prefix`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-005 — Unique installed prefix ownership

`ki` MUST refuse installation or discovery of two different backpack identities claiming the same prefix, preserving the valid installed backpack when acquisition detects a collision.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack.test.ts` — `refuses a second installed backpack claiming the same prefix`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-006 — Bare repository capability names

A repository MUST declare skills by bare `<prefix>-<name>` keys and MUST include the providing backpack in `[repo].backpacks`; backpack-qualified skill keys are invalid.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/validation.test.ts` — `resolves bare skill names across distinct backpack prefixes`; `rejects a backpack-qualified repository skill declaration`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-007 — One backpack declaration filename

Backpack source checkouts, release archives, installation staging, installed backpack roots, and local-development roots MUST use one regular root `.ki.toml` declaration. `ki` MUST reject an archive without exactly one such declaration and MUST NOT translate or accept a retired declaration filename.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack.test.ts`, `src/tests/cli/dev/dev.test.ts`, and a bounded retired-name search across product and test sources.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
