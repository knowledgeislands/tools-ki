---
id: KI-TOOL-CLI-092
area: CLI
title: Detect undeclared source stores
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T07:36:00Z
updated_at: 2026-09-30T07:36:00Z
---

# Detect undeclared source stores

## Goal

`ki` reports a conventional `sources-<repo>` OneDrive directory that exists on disk but is not declared by its repository, so each such directory receives an explicit decision instead of sitting outside the store and mirror contracts.

## Context

The 2026-09-30 survey behind `KI-HARNESS-GOV-121` found three repositories with a `~/Library/CloudStorage/OneDrive-Personal/sources-<repo>` directory and no `sources` role in `[skills.ki-repo].store_roles`: `hnr-principal`, `vallearmonia-website` and `kit-midnight.ninja`. Two of them are Projects, which `tools-ki` does not allow to declare stores at all (`src/core/configuration/declaration.ts`), so the directories are invisible to every audit. `conventionalSourcesStore` in `src/core/storage/repository-stores.ts` already computes the conventional path; nothing checks the inverse case.

## Boundary

In scope: a registry or repository audit signal that lists conventional store directories with no matching declaration, states whether the repository kind may declare one, and suggests the decision (declare, migrate to a Knowledge Base, or retire). Excludes: moving or deleting any directory, changing which repository kinds may hold stores, and the mirror content standard itself.

## Discussion

### Where the signal belongs

The registry knows every checkout and its kind, so `ki repo` or the registry status command is the natural home. Emit it as a warning, not a failure, until each existing case has been decided.
