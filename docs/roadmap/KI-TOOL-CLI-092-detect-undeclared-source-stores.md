---
id: KI-TOOL-CLI-092
area: CLI
title: Detect undeclared source stores
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: ec506413aecf594b0f622f7f6a459f8912e88a52
created_at: 2026-09-30T07:36:00Z
updated_at: 2026-09-30T11:23:13Z
---

# KI-TOOL-CLI-092: Detect undeclared source stores

## Goal

`ki` reports a conventional `sources-<repo>` OneDrive directory that exists on disk but is not declared by its repository, so each such directory receives an explicit decision instead of sitting outside the store and mirror contracts.

## Context

The 2026-09-30 survey behind `KI-HARNESS-GOV-121` found three repositories with a `~/Library/CloudStorage/OneDrive-Personal/sources-<repo>` directory and no `sources` role in `[skills.ki-repo].store_roles`: `hnr-principal`, `vallearmonia-website` and `kit-midnight.ninja`. Two of them are Projects, which `tools-ki` does not allow to declare stores at all (`src/core/configuration/declaration.ts`), so the directories are invisible to every audit. `conventionalSourcesStore` in `src/core/storage/repository-stores.ts` already computes the conventional path; nothing checks the inverse case.

## Boundary

In scope: a registry or repository audit signal that lists conventional store directories with no matching declaration, states whether the repository kind may declare one, and suggests the decision (declare, migrate to a Knowledge Base, or retire). Excludes: moving or deleting any directory, changing which repository kinds may hold stores, and the mirror content standard itself.

## Current state

`conventionalSourcesStore` derives a local OneDrive path, but `ki repo store list` only accepts Knowledge Bases with declared roles. Registered Projects with an existing conventional directory are not surfaced by that command.

## Steps

- [x] Add a read-only core inspection of registered conventional source directories, comparing each direct directory with its repository declaration and reporting unavailable evidence separately.
- [x] Expose the inspection as `ki registry source-stores`, with actionable warnings that do not fail the command and diagnostics that do.
- [x] Cover Project, Knowledge Base, declared, absent, unsafe, and unavailable cases through `run(args, context)` and `sandbox()`.
- [x] Update the repository-store specification, README/manual, and generated command inventory, then run the full verification gate.

## Files touched

`src/core/storage/repository-stores.ts`, registry command registration and renderer, registry and command-inventory CLI tests, `docs/specs/repository-operations.md`, README, `man/ki.1`, generated inventory, and CHANGELOG.

## Verify

Focused registry CLI tests, `bunx tsc --noEmit`, Biome, manual lint, generated inventory check, `ki repo` audits, and `bun run test:coverage` pass. Reported undeclared directories produce warning output and exit zero; malformed evidence remains nonzero.

## Dependencies / blocks

None for read-only detection. The Harness store-mirror content decision and each receiving repository own any later declaration, migration, or retirement.

## Documentation impact

### Decision Records

No new decision; this makes existing declared-store governance observable without choosing a migration.

### Specifications

Add the read-only registry detection and warning/failure semantics.

### Guides

Explain the command and its per-repository decision prompt in README and manual.

### Roadmap

Keep any actual source-store disposition in the affected repository's own work or decision record; this item only reports candidates.

## Review

### Delivered

The read-only `ki registry source-stores` report is implemented from baseline `ec506413aecf594b0f622f7f6a459f8912e88a52`. It leaves declarations, bindings, and source directories unchanged.

### Change Summary

The registry command inspects conventional direct OneDrive source directories for registered Projects and Knowledge Bases, warns when no `sources` role is declared, and separates unsafe or unavailable evidence as nonzero diagnostics. README, manual, command inventory, specification, and changelog describe the new operation.

### Verification

Focused CLI, help, and completion tests pass. The full coverage gate passes with 100% statements, branches, functions, and lines. TypeScript, Biome, manual lint, generated inventory, and repository audits pass. The Knip gate also required removing an unused internal Agora re-export left by the preceding batch.

### Outstanding concerns

Independent review and acceptance remain. The affected repositories and Harness mirror contract own any later declaration, migration, or retirement decisions; this command deliberately makes none.

### Post-change review

The command makes otherwise invisible conventional stores visible without changing the existing store-list contract or treating a detection warning as a repository failure.

### Mini recap

Registered conventional source stores now receive an actionable read-only warning or a distinct diagnostic. No source-store state is mutated.

## Discussion

### Where the signal belongs

The registry knows every checkout and its kind. A dedicated `ki registry source-stores` report keeps `ki registry list` and its machine-readable shape unchanged. Emit undeclared direct directories as warnings, not failures; unreadable declarations or unsafe conventional paths remain diagnostics. No source directory or binding is changed.
