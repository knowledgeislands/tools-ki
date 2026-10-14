---
id: KI-TOOL-KI-CLI-126
area: CLI
title: Unavailable store breaks repair
purpose: corrective
kind: deliver
component: repo
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T08:58:13Z
updated_at: 2026-10-14T08:58:13Z
---

# Unavailable Store Breaks Repair

## Goal

A host that does not carry a Knowledge Base's declared external store is a supported, honestly reported state, not a fatal error. `ki repo repair` still projects skills and reports the store as unavailable; `ki repo open` and the VS Code workspace warn and continue without the store; the machine-local registry can record that a store is deliberately absent on this host, and status reports it as such.

## Context

This is a defect, not new capability. On the Linux agent host vega, the `sources` store declared by ki-principal is not bound, so `ki repo repair` fails for ki-principal and its skills are not projected there.

Observed at `134bc32`:

- `registeredKnowledgeBaseStoreRoots` in `src/core/storage/local-stores.ts` throws `declared <role> store is not bound` when the registry entry has no path for a declared role.
- `ki repo repair` (`src/commands/repo/repair.ts`) turns that into `Knowledge Base <root> has an unavailable declared store`, marks the registry step failed, and `continue`s before `inspectRepositoryHealth`, so skill projection never runs, although it does not need the store.
- `ki repo open` (`src/commands/repo/open.ts`) throws the same error and opens nothing.
- The VS Code workspace builder (`src/core/manage/vscode.ts`) validates a bound `sources` path with `repositoryStoreDirectory` and throws when that directory is absent on the host.
- `ki repo store create` resolves its root to `~/Library/CloudStorage/OneDrive-Personal` (`src/core/storage/repository-stores.ts`), a macOS-only location; `ki repo store bind` accepts any existing absolute directory.
- The registry's `stores` table (`src/core/storage/local-registry.ts`) holds only absolute paths per role, so it cannot say that a store is deliberately absent on this host.

Mirror notes, KB search and the KB file-system server do not read the store, so they are unaffected. Filing, acquisition reconciliation and checksum audits do need the originals and stay unavailable on such a host.

As a stopgap, vega binds ki-principal's `sources` store to an empty, read-only local directory. That binding is misleading once the store has content, and it should be removed when this lands.

## Boundary

- In: repair continuing to skill projection and reporting an unavailable store as a warning; `ki repo open` and the VS Code workspace skipping an unavailable store with a warning; a registry representation for a store deliberately absent on a host, with a command to set and clear it; status and `store list` reporting bound, absent-by-choice and missing stores distinctly; `ki repo store create` failing clearly, not wrongly, where the OneDrive root does not exist; contract tests through `run(args, context)`.
- Out: syncing or mounting stores across hosts; any change to the mirror-note contract; commands that need originals, which keep failing clearly when the store is unavailable; changes on vega itself.

## Dependencies / blocks

Not blocked. Blocks nothing; removing vega's stopgap binding waits for it.

## Discussion

Capture only, under Kris Brown's approval of 14 October 2026 to record this defect; adoption, horizon, priority and plan belong to this repository's queue.

Open design points for planning:

- Whether a declared but unbound store with no absence marker should warn or fail. Warning everywhere is simplest; failing until the host says the store is absent keeps an accidental omission visible.
- Whether the absence marker belongs in the existing `stores` table, for example a reserved value per role, or in a separate per-host table.
- Whether `ki repo store create` should learn a non-macOS default or only refuse clearly and point to `store bind`.
