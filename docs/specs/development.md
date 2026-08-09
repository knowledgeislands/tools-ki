# Local Harness development — DEV

This area specifies the controlled local Harness projection; see the [Specifications index](index.md) for the corpus conventions and registered prefixes.

## Projection lifecycle

### DEV-001 — Separate local source selection

`ki dev local set` MUST validate and remember a local Harness checkout without activating it.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `remembers a local source without activating it`.

### DEV-002 — Reversible local activation

`ki dev local on` MUST switch the canonical Harness to the configured local checkout, and `ki dev local off` MUST restore the verified canonical Harness and re-project managed skills.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `switches the canonical harness to a local development checkout` and `restores the verified canonical harness and re-projects skills`.

### DEV-003 — Recognised projection only

`ki dev` MUST refuse an unfamiliar or unsafe canonical development link rather than adopting it.

_Verify:_ `src/tests/cli/dev/dev.test.ts` — `refuses to replace an unfamiliar canonical development link`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
