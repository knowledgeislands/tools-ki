# Compatible Harnesses — HARN

This area specifies installed compatible Harness lifecycle behaviour; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Verified installation

### HARN-001 — Immutable archive verification

`ki harness install` MUST verify configured immutable evidence and reject an archive that does not match it before creating an installation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/harness/harness.test.ts` — `refuses an archive that does not match configured immutable evidence without creating an installation`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### HARN-002 — Safe replacement

`ki harness reinstall` MUST keep the installed Harness intact when a replacement payload is invalid.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/lifecycle.test.ts` — `keeps an installed harness intact when a replacement payload is invalid`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### HARN-003 — Protected canonical and active state

`ki harness` MUST refuse removal of the canonical Harness and refuse replacement or removal of a Harness while it supplies an active user skill.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/root/lifecycle.test.ts` — `blocks replacement and removal while a supplied user skill is active`; `src/tests/cli/harness/harness.test.ts` — `refuses to uninstall the canonical harness`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### HARN-004 — Explicit capability prefix

Every installed Harness MUST declare a lowercase alphanumeric `prefix` in `[skills.ki-repo-harness]` in its root `.ki.toml`, and every published skill name MUST begin with `<prefix>-`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/harness/harness.test.ts` — `requires provider-authored Harness prefix metadata`; `requires published skills to use the declared Harness prefix`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### HARN-005 — Unique installed prefix ownership

`ki` MUST refuse installation or discovery of two different Harness identities claiming the same prefix, preserving the valid installed Harness when acquisition detects a collision.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/harness/harness.test.ts` — `refuses a second installed Harness claiming the same prefix`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### HARN-006 — Bare repository capability names

A repository MUST declare skills by bare `<prefix>-<name>` keys and MUST include the providing Harness in `[repo].harnesses`; Harness-qualified skill keys are invalid.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/repo/validation.test.ts` — `resolves bare skill names across distinct Harness prefixes`; `rejects a Harness-qualified repository skill declaration`.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

### HARN-007 — One Harness declaration filename

Harness source checkouts, release archives, installation staging, installed Harness roots, and local-development roots MUST use one regular root `.ki.toml` declaration. `ki` MUST reject an archive without exactly one such declaration and MUST NOT translate or accept a retired declaration filename.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/harness/harness.test.ts`, `src/tests/cli/dev/dev.test.ts`, and a bounded retired-name search across product and test sources.

_Evidence:_ The referenced CLI contract test passes in the 2026-09-14 full suite: 751 tests and 100% V8 coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
