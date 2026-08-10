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

Do not add external stores to the estate, trade registry, Agora membership, or tracked repository configuration. Keep `ki agora open` as the canonical-group operation. Do not infer paths from names or compose stores into a multi-repository target unless the caller explicitly requests it.

## Current state

The local registry represents canonical KI repositories only. No machine-local configuration can bind a Knowledge Base's optional `sources` or `legacy` stores, and no repository target currently opens them with the canonical `notes` repository. `ki agora open` already correctly opens canonical group members and remains separate.

## Steps

- [x] Select `ki repo open` as the first target, using the existing repository-selection rules for one repository, groups, and other supported target sets.
- [x] Keep Agora opening separate: one selected Knowledge Base includes its available stores by default; a multi-repository selection does not unless explicitly requested.
- [ ] Define machine-local binding syntax, ownership, regular-directory and symlink validation, and deterministic handling of missing optional stores.
- [ ] Define explicit include and exclude store flags, then implement the target's composition using only local bindings without adding stores to canonical repository discovery.
- [ ] Exercise valid, missing, malformed, unsafe, and deterministic-order cases at the CLI boundary.

## Files touched

To be determined after the binding owner and override flags are confirmed. Expected surfaces are the local user configuration reader, a focused local-store resolver, the repository open command, and its CLI contract tests.

## Verify

- A focused CLI contract suite for the selected target, covering valid bindings, missing optional stores, malformed and unsafe paths, and output order.
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

Machine-local binding authority and explicit override flags remain user-owned decisions. This item remains `draft` until they are recorded; no implementation may infer either choice.

## Discussion

### Local composition boundary

`notes` remains the canonical Knowledge Base repository itself. `ki repo open` will use the standard repository target selection and open a single selected notes project with its available optional stores. A multi-repository target stays canonical-only by default. Optional `sources` and `legacy` stores need a machine-local binding model, validation rules, and explicit include/exclude flags. Those bindings must be replaceable local state rather than portable repository identity, and a missing or unsafe binding must be diagnosed without preventing the canonical repository from remaining usable.

### Promotion condition

It is now positioned for planning. Readiness still requires its local binding authority and explicit override-flag contract; then the item can name exact syntax, validation and diagnostic cases, deterministic opening order, and a contract test matrix.
