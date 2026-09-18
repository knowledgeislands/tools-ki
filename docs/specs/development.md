# Local Harness development — DEV

This area specifies the controlled local Harness projection; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Projection lifecycle

### DEV-001 — Separate local source selection

`ki dev local set <harness-id> <path>` MUST require a Harness already present in the installed estate, validate the checkout as that Harness, and remember its identity and path independently of every other local Harness source without activating it.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `remembers a local source without activating it`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### DEV-002 — Reversible local activation

`ki dev local on [harness-id]` MUST switch each selected Harness's complete active root to its configured local checkout, and `ki dev local off [harness-id]` MUST restore each selected Harness from its configured verified archive and re-project its managed skills. Supplying an ID selects one Harness; omitting it selects every configured local Harness. Metadata and payloads MUST come from the same active root.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `switches every configured harness together and can restore one by identifier` and `switches the canonical harness to a local development checkout`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### DEV-003 — Recognised projection only

`ki dev` MUST refuse an unfamiliar or unsafe development root link for the remembered Harness rather than adopting it. Installed Harness inspection MUST reject payload-root links so a physical installed root cannot combine archive metadata with external payloads.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `refuses to replace an unfamiliar canonical development link`; `src/tests/cli/harness/harness.test.ts` — `rejects an external payload-root link`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### DEV-004 — Canonical bootstrap protection

The canonical Harness local source MUST retain its required bootstrap capabilities; another installed Harness is validated against its own discovered capability surface and MUST NOT be required to provide canonical bootstrap skills.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `requires the local harness to contain the canonical bootstrap skill` and `switches every configured harness together and can restore one by identifier`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
