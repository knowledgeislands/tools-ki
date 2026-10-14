---
id: KI-TOOL-KI-CLI-131
area: CLI
title: Host-absent store state
purpose: corrective
kind: deliver
component: repo
status: triage
blocks: []
blocked_by: [KI-TOOL-KI-CLI-126]
baseline_ref: null
created_at: 2026-10-14T20:57:30Z
updated_at: 2026-10-14T20:57:30Z
---

# Host-Absent Store State

## Goal

Every command that touches a Knowledge Base's declared external store treats a host without that store as a supported, honestly reported state. `ki repo open` and the VS Code workspace warn and continue without the store; the machine-local registry can record that a store is deliberately absent on this host, and status and `store list` report bound, absent-by-choice and missing stores distinctly; `ki repo store create` fails clearly where its OneDrive root does not exist.

## Context

[KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md) was captured with this whole boundary. On adoption on 14 October 2026 it was narrowed to the repair defect that keeps ki-principal's CI from reaching its audit, under Kris Brown's decision "adopt KI-TOOL-KI-CLI-126 into Now and plan it, so that ki repo repair reports an unbound store without failing, the audit step runs again, and CI goes red only on real findings". This record keeps the remainder, as observed at `134bc32`:

- `ki repo open` (`src/commands/repo/open.ts`) throws on an unbound or missing store through `registeredKnowledgeBaseStoreRoots` and opens nothing.
- The VS Code workspace builder (`src/core/manage/vscode.ts`) validates a bound `sources` path with `repositoryStoreDirectory` and throws when that directory is absent on the host.
- `ki repo store create` resolves its root to `~/Library/CloudStorage/OneDrive-Personal` (`src/core/storage/repository-stores.ts`), a macOS-only location; `ki repo store bind` accepts any existing absolute directory.
- The registry's `stores` table (`src/core/storage/local-registry.ts`) holds only absolute paths per role, so it cannot say that a store is deliberately absent on this host.

On the Linux agent host vega, ki-principal's `sources` store is bound to an empty, read-only local directory as a stopgap. That binding is misleading once the store has content and should be removed when this lands.

## Boundary

- In: `ki repo open` and the VS Code workspace skipping an unavailable store with a warning; a registry representation for a store deliberately absent on a host, with a command to set and clear it; status and `store list` reporting bound, absent-by-choice and missing stores distinctly; `ki repo store create` failing clearly, not wrongly, where the OneDrive root does not exist; contract tests through `run(args, context)`.
- Out: `ki repo repair`, which [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md) owns; syncing or mounting stores across hosts; any change to the mirror-note contract; commands that need originals, which keep failing clearly when the store is unavailable; changes on vega itself.

## Dependencies / blocks

Blocked by [KI-TOOL-KI-CLI-126](KI-TOOL-KI-CLI-126-unavailable-store-breaks-repair.md), whose warning wording and shared store-availability helper this reuses. Removing vega's stopgap binding waits for this record.

## Discussion

Captured as triage when KI-TOOL-KI-CLI-126 was narrowed; adoption, horizon and plan belong to this repository's queue.

Open design points for planning:

- Whether the absence marker belongs in the existing `stores` table, for example a reserved value per role, or in a separate per-host table.
- Whether, once a marker exists, an unbound store with no marker should go on warning as KI-TOOL-KI-CLI-126 makes repair do, or fail until the host says the store is absent, so that an accidental omission stays visible.
- Whether `ki repo store create` should learn a non-macOS default or only refuse clearly and point to `store bind`.
