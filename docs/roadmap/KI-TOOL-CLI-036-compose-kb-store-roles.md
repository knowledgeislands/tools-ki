---
id: KI-TOOL-CLI-036
title: Compose KB store roles
area: CLI
theme: cli
horizon: future
status: draft
candidate: true
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

## Discussion

### Local composition boundary

`notes` remains the canonical Knowledge Base repository itself. Optional `sources` and `legacy` stores need a machine-local binding model, validation rules, and a target-specific composition policy. Those bindings must be replaceable local state rather than portable repository identity, and a missing or unsafe binding must be diagnosed without preventing the canonical repository from remaining usable.

### Promotion condition

Promote when the first target and its local binding authority are explicitly agreed. Shape the item around one target, exact binding syntax and ownership, validation and diagnostic cases, deterministic opening order, and a contract test matrix before implementation.
