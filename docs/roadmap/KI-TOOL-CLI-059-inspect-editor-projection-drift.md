---
id: KI-TOOL-CLI-059
area: CLI
title: Inspect editor projection drift
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

# Inspect editor projection drift

## Goal

Let a user compare current or retained editor project groupings with resolved Agoras and the registered estate, then safely recreate an intended Agora projection when appropriate.

## Context

Zed preserves per-project layout and recent-project state even after a containing window closes, while its current CLI can create a window and add each resolved Agora member. Its local SQLite workspace database also exposes retained project, session, and window associations, but that database is application-owned and not a portable API. VS Code provides durable `.code-workspace` files whose folder paths can be compared directly. Today `ki agora open` projects declarations into either editor but cannot inspect the target in reverse or explain missing, extra, external, or unregistered roots.

## Boundary

Do not write an editor database, promise byte-for-byte restoration of a closed operating-system window, store local paths in portable Agora declarations, or treat an editor grouping as repository consent. Unknown and external folders must remain visible without being misclassified as Agora members.

## Shaping

Define one target-observation interface with target-specific adapters. The report should identify exact matches, missing declared members, extra registered repositories, external paths, and unregistered KI repositories. Prefer documented editor interfaces; any Zed database reader must be read-only, schema-version-aware, and fail safely when unsupported. Decide how a user selects the active or retained Zed grouping and the configured VS Code workspace directory. Reuse `ki agora open` for reconstruction after the user chooses a resolved profile. Promote after the observation contract, privacy boundary, and unsupported-version behaviour are specified.

## Discussion

### Zed reconstruction

Zed has no portable workspace file equivalent to VS Code, but reopening the same project restores that project's saved layout. Recreating a window from an Agora can therefore recover the useful project collection and per-project context without editing Zed state directly.

### Observation is not consent

Reverse inspection can produce a candidate membership proposal, but only explicit home and member declarations establish the Agora. This keeps accidental editor additions from changing repository governance.

### Related health gate

`KI-TOOL-CLI-058` verifies the declared and registered model. This item compares that verified model with application-owned projections; neither item depends on the other's implementation.
