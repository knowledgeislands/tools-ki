# Cross-repository trades — TRADE

This area specifies the CLI host's local trade operations; see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Directional records

### TRADE-001 — Prepared outbound submission

`ki trade prepare` MUST create a mutable local preparation only on a declared export route, MUST require an `unattended`, `receipt`, `decision`, or `completion` observation policy, and MAY run before the receiver has activated the reciprocal route. `ki trade submit` MUST freeze that preparation as the outbound submission; `ki trade abandon` MUST require explicit confirmation before removing an unsubmitted preparation.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `prepares, observes, guards routes and record validity, then abandons mutable work` and `creates declared outbound trades before receiver activation and rejects malformed or retired inputs`.

### TRADE-002 — Committed receipt

`ki trade receive <trade-id>` MUST import exactly one committed outbound submission, record its source commit, preserve the sender-owned payload, and validate receiver-only status fields. `ki trade receive --all` MUST preview all matching submissions and MUST change nothing without `--yes`.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `receives all matching trades` and `validates receiver-only status fields`.

### TRADE-003 — Route diagnostics

`ki trade routes` MUST report malformed route declarations and pending reciprocal routes without treating unavailable peer state as an active route.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `reports malformed route declarations plus pending` and `ignores missing registered roots and missing trade paths without treating them as peer state`.

### TRADE-004 — Estate route inspection

`ki trade routes list --estate` MUST inspect every valid registered repository trade declaration as one estate; `--incomplete` MUST retain only routes that are not active.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `lists incomplete route declarations across the registered estate`.

### TRADE-005 — Preparation observation

`ki trade observe` MUST read a sender's committed preparation without receiving it, compare it with the commit last observed by this receiver, and fall back to the complete current contents when no usable earlier Git evidence exists.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `prepares, observes, guards routes and record validity, then abandons mutable work`.

### TRADE-006 — Observation-led cleanup

`ki trade release` MUST remove only an outbound submission whose mandatory observation policy has been satisfied. `ki trade prune` MUST remove only an eligible inbound copy after sender release is observable. Their `--eligible` forms MUST preview the batch and MUST change nothing without `--yes`.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `applies observation-led completion and eligible cleanup, including premature-release protection`.

### TRADE-007 — Lifecycle inventory

`ki trade list` MUST distinguish mutable preparations, submitted exports, and received imports; report observation policy, delivery and decision state; and identify release or prune eligibility from mutually observable repository evidence. Its unfiltered local view MUST additionally show each submitted, reciprocally routable inbound trade that has not yet been received as awaiting receipt; sender-local preparations are not receivable inbound work.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `creates, receives, displays, releases, and prunes a work trade while each command writes only its local repository`.

### TRADE-008 — Route dependency protection

`ki trade routes remove` MUST refuse to remove a route while a local preparation, submission, received copy, or standing subtype declaration depends on it.

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `prepares, observes, guards routes and record validity, then abandons mutable work`; and `src/tests/cli/trade/standing-intake.test.ts` — `keeps one-sided and invalid grants closed without touching a peer`.

### TRADE-009 — Receiver-owned knowledge subtypes

`ki trade subtypes` MUST maintain lower-case, receiver-owned knowledge subtype definitions locally and MUST refuse removal while a local standing import depends on the subtype.

_Verify:_ `src/tests/cli/trade/standing-intake.test.ts` — `defines reciprocal grants and appends one commit-pinned receiver-local capture` and `guards duplicate, self, absent, and export-side mutations`.

### TRADE-010 — Exact standing grants

`ki trade standing` MUST treat a standing knowledge grant as active only when the ordinary knowledge route is active, both repositories declare the exact reciprocal subtype direction, and the receiver owns that subtype definition; malformed, unknown, one-sided, cross-kind, ambiguous, or revoked declarations MUST NOT grant direct-capture authority.

_Verify:_ `src/tests/cli/trade/standing-intake.test.ts` — `keeps one-sided and invalid grants closed without touching a peer` and `validates subtype and standing declarations before they become executable authority`.

### TRADE-011 — Receiver-local standing capture

`ki trade standing capture` MUST append a unique marked `STI-*` provenance block only to an existing Markdown file inside the current receiver repository, after validating an active exact-subtype import and a full source commit whose referenced path resolves in the registered source repository; it MUST NOT write to the source repository.

_Verify:_ `src/tests/cli/trade/standing-intake.test.ts` — `defines reciprocal grants and appends one commit-pinned receiver-local capture` and `refuses malformed, unresolved, or non-local capture targets after an exact grant activates`.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
