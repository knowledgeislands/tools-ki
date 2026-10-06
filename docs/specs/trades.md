# Cross-repository trades — TRADE

This area specifies the CLI host's local trade operations; see the [Specifications index](index.md) for corpus conventions and registered prefixes.

## Directional records

### TRADE-001 — Prepared outbound submission

`ki repo trade prepare` MUST create a mutable local preparation only on an export route granted by the territory Capital policy, MUST require an `unattended`, `receipt`, `decision`, or `completion` observation policy, and MAY run before the receiver has activated the reciprocal route. `ki repo trade submit` MUST freeze that preparation as the outbound submission; `ki repo trade abandon` MUST require explicit confirmation before removing an unsubmitted preparation.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `prepares, observes, guards routes and record validity, then abandons mutable work` and `creates granted outbound trades before receiver activation and rejects malformed or retired inputs`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-002 — Committed receipt

`ki repo trade receive <trade-id>` MUST import exactly one committed outbound submission, record its source commit, preserve the sender-owned payload, and validate receiver-only status fields. `ki repo trade receive --all` MUST preview all matching submissions and MUST change nothing without `--yes`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `receives all matching trades` and `validates receiver-only status fields`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-003 — Route diagnostics

`ki repo trade routes` MUST report a route granted by the territory Capital policy as active only when the peer is registered exactly once, declares `[skills.ki-trades]`, and resolves the same territory Capital. It MUST report an unregistered peer as awaiting activation, a peer resolving a different Capital as pending, and a peer registered more than once as ambiguous. When the declared Capital is not registered locally it MUST fail closed with `territory policy lives in <capital>, not available here` rather than report no routes.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `lists and checks the typed directional routes the Capital grants without touching member declarations`, `derives pending, active, and ambiguous registered-estate route states from each peer` and `reports missing, invalid, and unregistered user configuration before trade mutation`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-004 — Estate route inspection

`ki repo --estate trade routes list` MUST inspect every valid registered repository trade declaration as one estate; `--incomplete` MUST retain only routes that are not active.

`ki repo --estate trade routes list --format json` MUST emit the `ki/trade-routes/v1` machine contract. It MUST contain canonical source and peer identities, canonical repository URLs, direction, kind, activation state, peer resolution, and bounded declared map bonuses. It MUST NOT expose registry roots, declaration paths, or renderer-derived layout values. JSON format MUST require an aggregate parent repository selection; text remains the default. Interactive route visualisation is application-owned rather than a `tools-ki` command concern.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `lists incomplete route declarations across the registered estate`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-005 — Preparation observation

`ki repo trade observe` MUST read a sender's committed preparation without receiving it, compare it with the commit last observed by this receiver, and fall back to the complete current contents when no usable earlier Git evidence exists.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `prepares, observes, guards routes and record validity, then abandons mutable work`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-006 — Observation-led cleanup

`ki repo trade release` MUST remove only an outbound submission whose mandatory observation policy has been satisfied. `ki repo trade prune` MUST remove only an eligible inbound copy after sender release is observable. Their `--eligible` forms MUST preview the batch and MUST change nothing without `--yes`.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `applies observation-led completion and eligible cleanup, including premature-release protection`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-007 — Lifecycle inventory

`ki repo trade list` MUST distinguish mutable preparations, submitted exports, and received imports for the selected registered repositories; report observation policy, delivery and decision state; and identify release or prune eligibility from mutually observable repository evidence. Its unfiltered view MUST additionally show each submitted, reciprocally routable inbound trade that has not yet been received as awaiting receipt for each selected receiver; sender-local preparations are not receivable inbound work. `ki repo --estate trade list` MUST aggregate the selected repository views without duplicating an outbound record already represented by its received inbound copy. Mutating trade commands MUST require exactly one selected registered repository.

`--status` MUST accept only the receiver decision statuses defined by the trade record model. An unsupported status MUST fail with a grammar error rather than produce an empty inventory.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `creates, receives, displays, releases, and prunes a work trade while each command writes only its local repository`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-008 — ~~Route dependency protection~~ (deprecated)

Deprecated in 2026-10-06 when the Capital-governed territory model removed repository-local route mutation; a route withdrawn from the Capital policy stops granting new preparations, submissions and standing captures through TRADE-012, and existing local records remain local evidence.

### TRADE-009 — ~~Receiver-owned knowledge subtypes~~ (deprecated)

Deprecated in 2026-10-06 when knowledge subtypes moved into the territory Capital's policy, specified by TRADE-012 and inspected by TRADE-013, and the `ki repo trade subtypes` command group was removed.

### TRADE-010 — Exact standing grants

`ki repo trade standing` MUST read standing knowledge-intake grants only from the territory Capital policy and MUST treat a grant as active exactly when the ordinary knowledge route it rides on is active. A grant naming a subtype the policy does not define, or not covered by a knowledge channel, MUST be rejected when the policy is parsed; a malformed, ambiguous or withdrawn grant MUST NOT confer direct-capture authority. No repository-local command adds or removes a standing grant.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/standing-intake.test.ts` — `keeps a grant pending exactly while its knowledge route is, without touching a peer`, `orders grants from several sources and reports each against its own knowledge route` and `rejects undefined, uncovered, and repeated grants when the Capital policy is parsed`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-011 — Receiver-local standing capture

`ki repo trade standing capture` MUST append a unique marked `STI-*` provenance block only to an existing Markdown file inside the current receiver repository, after validating an active exact-subtype grant from the Capital policy and a full source commit whose referenced path resolves in the registered source repository; it MUST NOT write to the source repository.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/standing-intake.test.ts` — `reads exact grants from the Capital policy and appends one commit-pinned receiver-local capture` and `refuses malformed, unresolved, or non-local capture targets after an exact grant activates`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-012 — Capital-governed route authority

Every trade participant MUST resolve routes, standing grants and knowledge subtypes only from the `[skills.ki-trades.territory]` policy of the territory Capital named by its own `[skills.ki-repo].capital`, located through the local registry. A Capital MUST name itself as `capital` and declare `[skills.ki-repo.territory]`; a member MUST NOT declare either territory table. A member `[skills.ki-trades]` table MAY contain only `map_bonus`; the retired `routes` and `subtypes` keys MUST be rejected with a message naming the Capital policy. Resolution MUST fail closed when the Capital is unregistered, registered more than once, invalid, not a Capital, or does not list the member. A policy MUST validate each channel's identifier, purpose, member-only non-overlapping endpoints, kinds and uniqueness, and each standing grant's subtype definition, knowledge-channel coverage and uniqueness.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/trade.test.ts` — `reports malformed member declarations and refuses retired route keys`; `src/tests/cli/trade/policy.test.ts` — `rejects malformed Capital territory and trade policies before resolving any route`, `fails closed unless the declared Capital resolves uniquely to a Capital listing the member` and `keeps two territories in one registry apart and leaves cross-territory routes pending`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-013 — Territory policy inspection

`ki repo trade policy show` MUST render the resolved Capital's channels, standing grants and subtypes. `ki repo trade policy check` MUST classify every listed member, and every registered repository claiming the Capital without being listed, as conforming, warning, failing or unverifiable through the local registry: a member that is not checked out is unverifiable, a member named by a channel without `[skills.ki-trades]` or declaring a different Capital is failing, and a member declaring `[skills.ki-trades]` without any channel is a warning. The check MUST exit non-zero when any repository is failing.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/policy.test.ts` — `shows the resolved Capital policy with sorted subtypes and empty sections`, `checks every member and claimant against the Capital policy through the local registry`, `passes a territory check whose members only conform or warn` and `retires the repository-local standing and subtype mutators`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

### TRADE-014 — Route migration comparison

`ki repo trade policy compare --baseline <path>` MUST compare the active routes in a saved `ki/trade-routes/v1` report with the routes currently active across the registered estate, report covered, lost and added routes as `exporter -> importer kind`, and exit non-zero when any baseline route is lost. It MUST reject an unreadable, non-JSON, wrong-contract or malformed baseline.

_Conformance:_ conforming

_Verify:_ `src/tests/cli/trade/policy.test.ts` — `compares saved active routes with the routes the current Capital policies make active` and `rejects unreadable, non-JSON, wrong-contract, and malformed comparison baselines`.

_Evidence:_ The named CLI contract test is part of the passing `bun run test:coverage` gate, which enforces 100% coverage across statements, branches, functions, and lines.

## Gaps

No unbuilt candidate behaviour is in scope for this area.
