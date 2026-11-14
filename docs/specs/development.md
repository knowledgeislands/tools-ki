# Local backpack development — DEV

This area specifies the controlled local backpack projection; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Projection lifecycle

### DEV-001 — Separate local source selection

`ki dev local set <backpack-id> <path>` MUST require a backpack already present in the installed estate, validate the checkout as that backpack, and remember its identity and path independently of every other local backpack source without activating it.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `remembers a local source without activating it`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### DEV-002 — Reversible local activation

`ki dev local on [backpack-id]` MUST switch each selected backpack's complete active root to its configured local checkout, and `ki dev local off [backpack-id]` MUST restore each selected backpack from its configured verified archive and re-project its managed skills. Supplying an ID selects one backpack; omitting it selects every configured local backpack. Metadata and payloads MUST come from the same active root.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `switches every configured backpack together and can restore one by identifier` and `switches the canonical backpack to a local development checkout`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### DEV-003 — Recognised projection only

`ki dev` MUST refuse an unfamiliar or unsafe development root link for the remembered backpack rather than adopting it. Installed backpack inspection MUST reject payload-root links so a physical installed root cannot combine archive metadata with external payloads.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `refuses to replace an unfamiliar canonical development link`; `src/tests/cli/backpack/backpack.test.ts` — `rejects an external payload-root link`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### DEV-004 — Canonical bootstrap protection

The canonical backpack local source MUST retain its required bootstrap capabilities; another installed backpack is validated against its own discovered capability surface and MUST NOT be required to provide canonical bootstrap skills.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `requires the local backpack to contain the canonical bootstrap skill` and `switches every configured backpack together and can restore one by identifier`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
