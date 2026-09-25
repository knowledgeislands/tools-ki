---
id: KI-TOOL-CLI-086
area: CLI
title: Manage typed repository stores
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-25T11:29:53Z
updated_at: 2026-09-25T11:29:53Z
---

# KI-TOOL-CLI-086: Manage typed repository stores

## Goal

Let user-local tooling manage the physical stores declared by a selected KI repository, then let VS Code and other projections consume those typed store bindings without owning or inferring them.

## Context

The current `ki manage vscode source create` command creates a OneDrive `sources-*` directory, associates it by repository-name heuristics, and immediately rewrites VS Code source state. The local registry models only a `sources` path, while the portable repository contract defines `notes`, `sources`, and `legacy` as stable Knowledge Base store roles whose physical bindings remain user-local.

This places repository-store lifecycle under an editor-specific command and forces VS Code reconciliation to scan filesystem names rather than consume explicit typed bindings.

## Boundary

Do not add portable store roles, make an external store a KI repository, mutate store contents, establish cloud-provider credentials, run `chezmoi apply`, or make VS Code authoritative for repository storage.

## Discussion

### Ownership

Repository-scoped commands should own listing, creating, associating, and removing local bindings for roles declared by the selected repository. Editor projections should remain consumers: they may include, label, trust, or omit roots according to store role, but must not create or infer the underlying association.

### Typed local model

The selected repository itself satisfies the declared `notes` role. External `sources` and `legacy` roles need explicit role-to-path bindings in machine-local state, validated against the repository declaration. Directory naming may support a creation policy, but it must not substitute for the stored typed association.

### Open decisions

Shape the repository command grammar and preview/write boundary; decide which declared roles support automatic directory creation versus association with an existing path; define how each role affects VS Code workspace membership and trusted-folder projection; remove the editor-owned source command without a compatibility alias once the replacement is complete.
