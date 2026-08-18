# Local Harness development — DEV

This area specifies the controlled local Harness projection; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Projection lifecycle

### DEV-001 — Separate local source selection

`ki dev local set <harness-id> <path>` MUST require a Harness already present in the installed estate, validate the checkout as that Harness, and remember both identity and path without activating it.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `remembers a local source without activating it`.

### DEV-002 — Reversible local activation

`ki dev local on` MUST switch the complete active root of only the remembered installed Harness to its configured local checkout, and `ki dev local off` MUST restore that Harness from its configured verified archive and re-project its managed skills without changing neighbouring Harnesses. Metadata and payloads MUST come from the same active root.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `switches one non-canonical installed harness without changing its neighbours` and `switches the canonical harness to a local development checkout`.

### DEV-003 — Recognised projection only

`ki dev` MUST refuse an unfamiliar or unsafe development root link for the remembered Harness rather than adopting it. Installed Harness inspection MUST reject payload-root links so a physical installed root cannot combine archive metadata with external payloads.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `refuses to replace an unfamiliar canonical development link`; `src/tests/cli/harness/harness.test.ts` — `rejects an external payload-root link`.

### DEV-004 — Canonical bootstrap protection

The canonical Harness local source MUST retain its required bootstrap capabilities; another installed Harness is validated against its own discovered capability surface and MUST NOT be required to provide canonical bootstrap skills.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `requires the local harness to contain the canonical bootstrap skill` and `switches one non-canonical installed harness without changing its neighbours`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
