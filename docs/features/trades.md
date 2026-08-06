# Cross-repository trades — TRADE

This area specifies the CLI host's local trade operations; see the [Feature Definitions index](index.md) for corpus conventions and registered prefixes.

## Directional records

### TRADE-001 — Declared outbound submission

`ki trade create` MUST create an outbound trade only on a declared route and MAY create it before the receiver has activated the reciprocal route.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `creates declared outbound trades before receiver activation and rejects malformed or retired inputs`.

### TRADE-002 — Receiver-owned acceptance

`ki trade receive` MUST receive all matching outbound trades while validating receiver-only status fields.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `receives all matching trades` and `validates receiver-only status fields`.

### TRADE-003 — Route diagnostics

`ki trade routes` MUST report malformed route declarations and pending reciprocal routes without treating unavailable peer state as an active route.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `reports malformed route declarations plus pending` and `ignores missing registered roots and missing trade paths without treating them as peer state`.

### TRADE-004 — Estate route inspection

`ki trade routes list --estate` MUST inspect every valid registered repository trade declaration as one estate; `--incomplete` MUST retain only routes that are not active.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `lists incomplete route declarations across the registered estate`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
