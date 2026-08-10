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

Do not add external stores to the estate, trade registry, Agora membership, or tracked repository configuration. Keep `ki agora open` as the canonical-group operation. Do not infer paths from names; `ki repo open` may include only explicitly bound stores for each selected Knowledge Base.

## Current state

The local registry represents canonical KI repositories only. No machine-local configuration can bind a Knowledge Base's optional `sources` or `legacy` stores, and no repository target currently opens them with the canonical `notes` repository. `ki agora open` already correctly opens canonical group members and remains separate.

## Steps

- [x] Select `ki repo open` as the first target, using the existing repository-selection rules for one repository, groups, and other supported target sets.
- [x] Keep Agora opening separate and include available stores for every selected Knowledge Base by default, including multi-repository selections.
- [ ] Define machine-local binding syntax, ownership, regular-directory and symlink validation, and deterministic handling of missing optional stores.
- [x] Define mutually exclusive `--stores` and `--no-stores` switches: inclusion is the default, and individual roles are not independently selectable.
- [ ] Implement the target's composition using only local bindings without adding stores to canonical repository discovery.
- [ ] Exercise valid, missing, malformed, unsafe, and deterministic-order cases at the CLI boundary.

## Files touched

To be determined after the binding owner is confirmed. Expected surfaces are the local user configuration reader, a focused local-store resolver, the repository open command, and its CLI contract tests.

## Verify

- A focused CLI contract suite for the selected target, covering valid bindings, missing optional stores, malformed and unsafe paths, and output order.
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

Machine-local binding authority remains a user-owned decision. This item remains `draft` until it is recorded; no implementation may infer it.

## Discussion

### Local composition boundary

`notes` remains the canonical Knowledge Base repository itself. `ki repo open` will use the standard repository target selection and include each selected notes project's available optional stores, whether the selection has one or many repositories. Optional `sources` and `legacy` stores need a machine-local binding model, validation rules, and all-or-nothing selection flags. Those bindings must be replaceable local state rather than portable repository identity, and a missing or unsafe binding must be diagnosed without preventing the canonical repository from remaining usable.

### Store selection

Stores are included by default. `--stores` makes that choice explicit for scripts and `--no-stores` opens canonical repositories only; the switches are mutually exclusive. There is no per-role flag: a caller either receives every available bound store or none.

### Promotion condition

It is now positioned for planning. Readiness still requires its local binding authority; then the item can name exact syntax, validation and diagnostic cases, deterministic opening order, and a contract test matrix.
