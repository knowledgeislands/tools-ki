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

## Leaving the harness name

ki called backpacks "harnesses" until ki 0.17. For one release each retired name is still read, with a warning on standard error, and the next release removes it.

### HARN-008 — Data folder move

Before any command that may read installed backpacks, `ki` MUST move a `harnesses/` data folder to `backpacks/` with one rename, never a copy, and MUST leave `harnesses` as a relative link to `backpacks`, so that every absolute link through the old folder keeps resolving. A development slot MUST move unchanged. `ki` MUST NOT move the folder for help, version or the commit-msg check. When both folders hold backpacks, `ki` MUST read `backpacks/` only and warn; a `harnesses` entry that is neither a folder nor that link MUST be warned about and left alone.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack-rename.test.ts` — `moves harnesses to backpacks once, leaving a relative link so existing links keep resolving`; `moves a development slot linked to its checkout unchanged`; `moves into an empty backpacks folder`; `reads backpacks only, with a warning, while both folders hold backpacks`; `warns about a harnesses entry that is neither a folder nor the migration link`; `leaves the data folder alone for help, version and the commit-msg check`; `fails a command whose data folder cannot be moved`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-009 — Backpack slot names

An installed backpack MUST occupy the slot named by its backpack spelling. `ki` MUST move a slot still under its retired `*-agentic-harness` name to its backpack name, leaving the old name as a relative link that discovery skips and uninstall removes; install and reinstall MUST write the backpack slot. A slot under both names MUST still be refused.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack-rename.test.ts` — `moves a retired slot to its backpack name, leaving an alias that uninstall removes`; `keeps a slot alias when uninstall removes another backpack`; `reinstalls a backpack found under its retired slot into its backpack slot`; `src/tests/cli/backpack/backpack-names.test.ts` — `refuses a backpack installed under both spellings`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-010 — Retired names in configuration

A repository declaration MUST name its backpacks in `[repo] backpacks`, and the user configuration in `[backpacks]`. For one release `ki` MUST read `[repo] harnesses` and `[harnesses]` when the current name is absent, warning once per command, and MUST refuse a file that has both. `ki repo repair` MUST rename the retired repository key in place, previewing it under `--dry-run`, and ask for a hand edit when the key is not spelt in a `[repo]` table. Whenever `ki` writes the user configuration for another reason it MUST write `[backpacks]`, renaming every retired header and keeping its releases.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack-rename.test.ts` — `reads the retired [repo] harnesses key once per command, with a warning`; `refuses a declaration that has both the backpacks key and the retired harnesses key`; `repair previews and then renames the retired key, keeping the rest of the line`; `asks for a hand edit when the retired key is not spelt in a [repo] table`; `reads the retired [harnesses] table with a warning and refuses a file that has both`; `leaves a retired [harnesses] table that already holds every value, and renames it on a write`; `records an install in [backpacks], renaming every retired [harnesses] header and keeping releases`; `lays out afresh a retired harnesses table spelt as an inline root key, keeping its releases`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-011 — Links through retired paths

A managed skill link that resolves to its expected source but whose text passes through the retired `harnesses` folder or a `*-agentic-harness` slot MUST be reported as needing a link: `ki repair --apply` MUST re-point user skill links and `ki repo repair` repository skill links. A link spelt exactly as its expected source, such as one into a checkout that still carries a retired name, MUST be left alone. An interrupted install that ki 0.16 recorded under the retired folder or operation name MUST still be read.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack-rename.test.ts` — `ki repair re-points user skill links still spelt through the retired folder`; `ki repo repair re-points repository skill links still spelt through a retired path`; `keeps a development link whose checkout still carries a retired name`; `reads an interrupted install recorded by ki 0.16 under the retired folder`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### HARN-012 — Retired command name

`ki harness` MUST run as `ki backpack` for one release, writing one deprecation line to standard error, and MUST NOT appear in help.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/backpack/backpack-rename.test.ts` — `answers ki harness as ki backpack with a one-line deprecation warning`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
