---
id: KI-TOOL-CLI-016
title: Assess native roadmap lifecycle subcommands
theme: cli
horizon: future
status: open
candidate: true
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

## Discussion

### Lifecycle operations need explicit authority

Any future `ki repo roadmap` subcommand must make its target, intended transition, required evidence, and confirmation boundary explicit.

The assessment should compare read-only recommendation commands with user-confirmed mutation commands for placeholder creation, readiness preparation, acceptance, completion, and explicit pruning.

### Canonical records remain the source of truth

Future commands must preserve canonical Markdown work-item records, existing audits, and lifecycle ordering.

They must not introduce a parallel lifecycle store, perform autonomous transitions, or use trade direction or record status as evidence to alter roadmap state.

### Promotion condition

Promote this item when a concrete operator workflow can name the required subcommand, its exact authority and confirmation boundary, the evidence it consumes, and its relationship to the existing process skills.
