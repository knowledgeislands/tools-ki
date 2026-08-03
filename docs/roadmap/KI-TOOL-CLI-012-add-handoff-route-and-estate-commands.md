---
id: KI-TOOL-CLI-012
title: Add handoff route and estate commands
theme: cli
horizon: next
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 6f6e63aa3120b71be1149027d89f0db866043ff7
---

## Goal

Let KI users inspect and maintain the local side of trusted cross-repository work submissions through a clear, safe `ki handoffs` command surface.

## Context

The current Harness and CLI direct-super-trust bridge records work directly in each repository's roadmap. It establishes the immediate collaboration but provides no public commands for routes, submissions, estate visibility, or lifecycle observations.

`KI-HARNESS-FND-009` has published the portable contract in [GDR-KI-HARNESS-005](https://github.com/knowledgeislands/ki-agentic-harness/blob/34dbf448/docs/decisions/GDR-KI-HARNESS-005-cross-repository-handoff-submissions.md) and the `ki-handoffs` standard (Harness commit `34dbf448`). It establishes canonical `owner/repo` identities, reciprocal routes, independent `HND-` identities, immutable sender payloads, receiver-only dispositions, and release-observed pruning. This CLI item owns executable delivery; the published contract is an incoming compatibility and acceptance input, not authority to alter the Harness or any peer repository.

## Boundary

Do not make peer-repository writes, make acceptance decisions, infer acceptance from silence, or implement a remote interchange. Every command that changes state writes the current repository only; receiver judgment remains with `ki-next` and the receiving repository's roadmap process.

## Current state

`ki` knows the registered repository estate, but it has no handoff command group and no stable protocol for discovering a peer's declared route or submission state.

The proposed public surface is `ki handoffs routes add`, `routes remove`, `routes list`, `routes check`, `new`, `receive`, `list`, `show`, `release`, and `prune`. It implements the agreed local-only authority, reciprocal-route, owner/repo layout, `HND-...` identity, receiver-status, and sender-release model; the Harness contract is a compatibility and acceptance input, not an execution blocker.

## Steps

- [x] Record the published `KI-HARNESS-FND-009` contract as incoming compatibility and acceptance context; preserve its submission authority boundary without extending it through host commands, remote transport, or peer writes.
- [x] Implement local route declaration, removal, listing, and registered-estate route checks.
- [x] Implement local outbound creation, receiver-owned pull/receive, estate listing and display, sender release, and receiver-safe prune operations.
- [x] Add CLI contract tests for success, unreciprocated or broken routes, unknown handoffs, denied peer writes, lifecycle visibility, and pruning boundaries.
- [ ] Publish the CLI evidence back to the Harness through the then-governed handoff process or another explicitly agreed direct bridge.

## Files touched

- CLI command registration and handoff command modules under `src/`
- CLI integration tests under `src/tests/cli/`
- User-facing command reference and release notes where required
- This work item

## Verify

- Focused in-process CLI tests using the sandbox helper, asserting stdout, exit code, and on-disk effects
- `bun run test`
- `bunx tsc --noEmit`
- A registered multi-repository fixture proves that every mutation is confined to the invoking repository and that peer state is read-only input.

## Dependencies / blocks

This item is Next and ready for implementation. `KI-HARNESS-FND-009` published its governance input at Harness commit `34dbf448`; the CLI must preserve that authority model and reconcile its public contract before acceptance, but it is not blocked from beginning the local implementation.

## Discussion

### Host boundary

The CLI is the public host for the command group and registered-repository resolution. It implements protocol-preserving mechanics, not the peer relationship's governance semantics; the Harness owns the portable submission contract and KI Specifications may later own normative interoperability material.

### Local authority

`routes add` and `routes remove` change only the current repository's declaration. `receive` means a receiver pulls a sender's outbound submission into its own inbound area after verifying the reciprocal route; it is deliberately not a sender-side delivery command. `release` removes only the sender's outbound record after the sender has acted on the observed response, and `prune` removes only an inbound record after that release is observable.

### Future interchange

Repositories without mutual visibility may later use a trusted interchange as a scoped transport. This item neither requires nor pre-commits that module; its local command and data contracts should leave room for it without treating it as a decision-maker.

### Implementation checkpoint

The CLI implementation is available locally with `routes add|remove|list|check`, `new`, `receive`, `list`, `show`, `release`, and `prune`.

It requires each participating repository to declare `ki-handoffs`, its canonical identity, and lexical peer list in `.ki-config.toml`; `routes add --identity` supplies that local configuration on first use.

Sandbox contracts prove no command writes a peer repository, including the receiver-owned disposition between `receive` and `release`.

The remaining acceptance work is reconciliation against the committed Harness `GDR-KI-HARNESS-005` and `ki-handoffs` release, then an explicitly agreed direct evidence handoff.
