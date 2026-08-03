---
id: KI-TOOL-CLI-012
title: Add trade route and estate commands
theme: cli
horizon: next
status: acceptance
blocks: []
blocked-by: []
baseline-ref: 6f6e63aa3120b71be1149027d89f0db866043ff7
---

## Goal

Let KI users inspect and maintain the local side of trusted, typed cross-repository trades through a clear, safe `ki trades` command surface.

## Context

The current Harness and CLI direct-super-trust bridge records work directly in each repository's roadmap. It establishes the immediate collaboration but provides no public commands for routes, submissions, estate visibility, or lifecycle observations.

`KI-HARNESS-FND-009` has published the portable contract in [GDR-KI-HARNESS-005](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/decisions/GDR-KI-HARNESS-005-cross-repository-handoff-submissions.md) and the `ki-handoffs` standard. It establishes canonical HTTPS GitHub repository homes, directional `work` and `knowledge` trade routes, independent `HND-` handoff-record identities, immutable sender payloads, receiver-only dispositions, and release-observed pruning. This CLI item owns executable delivery; the published contract is an incoming compatibility and acceptance input, not authority to alter the Harness or any peer repository.

## Boundary

Do not make peer-repository writes, make acceptance decisions, infer acceptance from silence, or implement a remote interchange. Every command that changes state writes the current repository only; receiver judgment remains with `ki-next` and the receiving repository's roadmap process.

## Current state

`ki` now exposes a `trades` command group over the registered repository estate and the typed route and handoff-record contract described below.

The proposed public surface is `ki trades routes add`, `routes remove`, `routes list`, `routes check`, `new`, `receive`, `list`, `show`, `release`, and `prune`. Route commands declare a direction and trade kind; `new` declares `work` or `knowledge`. It implements the agreed local-only authority, directional typed-route, GitHub-home, `HND-...` record, receiver-status, and sender-release model; the Harness contract is a compatibility and acceptance input, not an execution blocker.

## Steps

- [x] Record the published `KI-HARNESS-FND-009` contract as incoming compatibility and acceptance context; preserve its submission authority boundary without extending it through host commands, remote transport, or peer writes.
- [x] Rename the public `ki handoffs` surface to `ki trades` and migrate route configuration from reciprocal peers to typed directional exports and imports.
- [x] Implement local typed trade-route declaration, removal, listing, and registered-estate route checks against canonical GitHub homes.
- [x] Implement local outbound creation, receiver-owned pull/receive, estate listing and display, sender release, and receiver-safe prune operations for work and knowledge records.
- [x] Add CLI contract tests for typed-route success, one-sided or wrong-kind routes, unknown handoff records, denied peer writes, knowledge retention, lifecycle visibility, and pruning boundaries.
- [x] Publish the CLI evidence back to the Harness through the then-governed handoff process or another explicitly agreed direct bridge.

## Files touched

- CLI command registration and trade command modules under `src/`
- CLI integration tests under `src/tests/cli/`
- User-facing command reference and release notes where required
- This work item

## Verify

- Focused in-process CLI tests using the sandbox helper, asserting stdout, exit code, and on-disk effects
- `bun run test`
- `bunx tsc --noEmit`
- A registered multi-repository fixture proves that every mutation is confined to the invoking repository and that peer state is read-only input.

## Dependencies / blocks

This item is in progress and unblocked. `KI-HARNESS-FND-009` published its governance input through GDR-KI-HARNESS-005 and the `ki-handoffs` standard; the implementation preserves that authority model and requires a final evidence trade before acceptance.

## Acceptance

### Delivered

The public host now exposes `ki trades` for typed directional `work` and `knowledge` routes over canonical HTTPS GitHub repository homes. It creates and mutates only local outbound or inbound handoff records, preserves receiver-owned disposition authority, and retains the `HND-` record identity and release-observed pruning model.

The retired `ki handoffs` command and reciprocal `identity` / `peers` configuration have no compatibility path.

### Summary of changes

Commit `228f0e2916c49ab93495289824535cfd24c7f520` replaces the command, core, configuration, documentation, completion, inventory, and CLI contract footprints with the typed-trades implementation.

The outbound work trade `HND-8bd351f1-b405-4882-8054-e6ab1bbcd3ff` carries the immutable implementation reference and authority boundary to `knowledgeislands/ki-agentic-harness` through the governed trade route.

### Verification

- `bun run test:coverage` — 476 tests passed; statements, branches, functions, and lines all reached 100%.
- `bunx tsc --noEmit` — passed.
- `bunx biome check .` — passed with one informational schema-version notice and no fixes.
- `bunx markdownlint-cli2 CHANGELOG.md docs/roadmap/KI-TOOL-CLI-012-add-handoff-route-and-estate-commands.md` — passed.
- `mandoc -T lint man/ki.1` — passed.
- `git diff --check` — passed.
- `ki trades routes check https://github.com/knowledgeislands/ki-agentic-harness --direction export --kind work` — active.

### Outstanding concerns

The Harness still owns receipt and disposition of the evidence trade and any resulting change to `KI-HARNESS-FND-009`. The outbound copy must remain until a terminal receiver disposition is observable; remote interchange remains outside this item.

### Mini recap

The immutable delivery baseline is `6f6e63aa3120b71be1149027d89f0db866043ff7`; the typed migration is committed in `228f0e2916c49ab93495289824535cfd24c7f520`. No peer repository was written, no compatibility shim was retained, and no learning requires a separate durable promotion route.

## Discussion

### Host boundary

The CLI is the public host for the command group and registered-repository resolution. It implements protocol-preserving mechanics, not the peer relationship's governance semantics; the Harness owns the portable submission contract and KI Specifications may later own normative interoperability material.

### Local authority

`routes add` and `routes remove` change only the current repository's declaration. `receive` means a receiver pulls a sender's outbound submission into its own inbound area after verifying the reciprocal route; it is deliberately not a sender-side delivery command. `release` removes only the sender's outbound record after the sender has acted on the observed response, and `prune` removes only an inbound record after that release is observable.

### Future interchange

Repositories without mutual visibility may later use a trusted interchange as a scoped transport. This item neither requires nor pre-commits that module; its local command and data contracts should leave room for it without treating it as a decision-maker.

### Implementation checkpoint

The implementation is available on `ki trades` without retaining the retired `ki handoffs` compatibility command.

It requires each participating repository to declare its canonical HTTPS GitHub home under `ki-repo.repository` and typed `ki-handoffs` exports and imports in `.ki-config.toml`; route commands must not create or replace that repository identity.

Sandbox contracts prove typed active, missing, ambiguous, nonreciprocal, wrong-kind, work, knowledge, malformed-record, lifecycle, and pruning behaviour without writing a peer repository.

The remaining acceptance work is an outbound work trade carrying the immutable implementation and verification evidence back to the Harness.
