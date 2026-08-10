---
id: KI-TOOL-CLI-036
title: Compose KB store roles
area: CLI
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
transferred_from: KI-TOOL-CLI-018
---

## Goal

Allow a supported local target to compose a Knowledge Base repository with its declared `notes`, `sources`, and `legacy` store roles without treating external stores as canonical KI repositories.

## Context

CLI-018 completed the canonical Agora estate: a local registry binds canonical repository identities to physical checkouts, and `estate` selects only those repositories. The accepted `ki-repo` contract also names the closed Knowledge Base `store_roles` vocabulary, but this CLI does not yet resolve local bindings for optional `sources` or `legacy` stores, nor include them when opening a target workspace.

## Boundary

Do not add external stores to the estate, trade registry, Agora membership, or tracked repository configuration. Do not infer paths from names, choose a global target, or introduce a target other than the separately approved target implementation.

## Current state

The local registry represents canonical KI repositories only. No machine-local configuration can bind a Knowledge Base's optional `sources` or `legacy` stores, and no target currently composes them with the canonical `notes` repository.

## Steps

- [ ] Confirm the first supported target and its precise composition behaviour, including whether it opens paths, passes them to another tool, or only reports them.
- [ ] Define machine-local binding syntax, ownership, regular-directory and symlink validation, and deterministic handling of missing optional stores.
- [ ] Implement the selected target's composition using only those bindings, without adding stores to canonical repository discovery.
- [ ] Exercise valid, missing, malformed, unsafe, and deterministic-order cases at the CLI boundary.

## Files touched

To be determined after the first target and binding owner are confirmed. Expected surfaces are the local user configuration reader, a focused local-store resolver, the selected target command, and its CLI contract tests.

## Verify

- A focused CLI contract suite for the selected target, covering valid bindings, missing optional stores, malformed and unsafe paths, and output order.
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

The first supported target and binding authority are user-owned decisions. This item remains `draft` until they are recorded; no implementation may infer either choice.

## Discussion

### Local composition boundary

`notes` remains the canonical Knowledge Base repository itself. Optional `sources` and `legacy` stores need a machine-local binding model, validation rules, and a target-specific composition policy. Those bindings must be replaceable local state rather than portable repository identity, and a missing or unsafe binding must be diagnosed without preventing the canonical repository from remaining usable.

### Promotion condition

It is now positioned for planning. Readiness still requires the first target and its local binding authority to be explicitly agreed; then the item can name exact syntax, validation and diagnostic cases, deterministic opening order, and a contract test matrix.
