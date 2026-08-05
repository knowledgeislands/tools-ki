---
id: KI-TOOL-CLI-016
title: Assess native roadmap lifecycle subcommands
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Decide which read-only or explicitly authorised `ki repo roadmap` subcommands would usefully support the governed work-item lifecycle.

## Context

`ki repo roadmap list` now provides a deterministic, read-only view of selected repositories' work items and trade context.

The current repository workflow assigns creation and shaping to `ki-plan`, implementation transitions to `ki-implement`, and explicit acceptance and pruning to `ki-accept`.

There may be value in narrowly scoped native commands that prepare a placeholder work item, present lifecycle candidates, apply a user-confirmed status transition, or prune an explicitly named retained record.

## Boundary

This discovery item does not add lifecycle-mutating CLI commands, bypass human confirmation, infer roadmap authority from trade records, or replace the `ki-plan`, `ki-implement`, or `ki-accept` process responsibilities.

## Current state

The CLI exposes `ki repo roadmap list` as a read-only inventory.

The process skills already define creation, readiness, implementation, acceptance, completion, and pruning authority, but those actions are not yet represented as native CLI grammar.

## Steps

- [ ] Catalogue the existing roadmap lifecycle operations and their evidence, authority, and confirmation requirements.
- [ ] Assess read-only and user-confirmed command candidates for placeholder creation, lifecycle recommendations, transitions, and explicit pruning.
- [ ] Define the smallest coherent grammar, command ownership, and rejection behaviour for any selected candidate.
- [ ] Specify CLI-contract coverage and public documentation changes before proposing an implementation item.

## Files touched

- `src/commands/repo/`
- `src/tests/cli/repo/`
- `README.md`
- `man/ki.1`
- This roadmap item

## Verify

- `ki repo roadmap list` remains read-only and retains its existing inventory and trade-context behaviour.
- Any proposed mutating command requires an explicit target, evidence, and confirmation boundary.
- `bun run test:coverage`, `bunx tsc --noEmit`, Biome, Markdown lint, man-page lint, and the roadmap audit pass for a selected implementation.

## Dependencies / blocks

This assessment is self-contained.

## Discussion

### Lifecycle operations need explicit authority

Any future `ki repo roadmap` subcommand must make its target, intended transition, required evidence, and confirmation boundary explicit.

The assessment should compare read-only recommendation commands with user-confirmed mutation commands for placeholder creation, readiness preparation, acceptance, completion, and explicit pruning.

### Canonical records remain the source of truth

Future commands must preserve canonical Markdown work-item records, existing audits, and lifecycle ordering.

They must not introduce a parallel lifecycle store, perform autonomous transitions, or use trade direction or record status as evidence to alter roadmap state.

### Promotion condition

Promote this item when a concrete operator workflow can name the required subcommand, its exact authority and confirmation boundary, the evidence it consumes, and its relationship to the existing process skills.
