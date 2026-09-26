---
id: KI-TOOL-CLI-086
area: CLI
title: Manage typed repository stores
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 3b1b43d6016d3092c69aa537c6bbd49fd57ce81c
created_at: 2026-09-25T11:29:53Z
updated_at: 2026-09-26T12:43:20Z
---

# KI-TOOL-CLI-086: Manage typed repository stores

## Goal

Let user-local tooling manage the physical stores declared by a selected KI repository, then let VS Code and other projections consume those typed store bindings without owning or inferring them.

## Context

The current `ki manage vscode source create` command creates a OneDrive `sources-*` directory, associates it by repository-name heuristics, and immediately rewrites VS Code source state. The local registry models only a `sources` path, while the portable repository contract defines `notes`, `sources`, and `legacy` as stable Knowledge Base store roles whose physical bindings remain user-local.

This places repository-store lifecycle under an editor-specific command and forces VS Code reconciliation to scan filesystem names rather than consume explicit typed bindings.

## Boundary

Do not add portable store roles, make an external store a KI repository, mutate store contents, establish cloud-provider credentials, run `chezmoi apply`, or make VS Code authoritative for repository storage.

## Current state

The local registry can bind only `sources`, `ki manage vscode source create` owns that binding as an editor side effect, and VS Code scans `sources-*` names to recover repository associations. The approved replacement is repository-scoped: `notes` is the selected repository root, while declared `sources` and `legacy` roles may have explicit user-local bindings.

## Steps

- [x] Add `ki repo store list`, `create <role> [--write]`, `bind <role> <absolute-path> [--write]`, and `unbind <role> [--write]` with repository selection, declaration validation, typed text and JSON output, and preview-by-default mutation.
- [x] Treat `notes` as the immutable repository-root binding; allow automatic creation only for declared `sources` at the established OneDrive `sources-<repository-basename>` location; manage `legacy` and non-conventional `sources` paths through `bind`; never delete physical content during `unbind`.
- [x] Generalise the local registry and store helpers to retain declared `sources` and `legacy` bindings without name inference, while preserving atomic writes and unrelated registry data.
- [x] Make VS Code consume explicit `sources` bindings alongside repository roots and ignore `legacy` by default; remove `ki manage vscode source create` without a compatibility alias.
- [x] Align repository open and registration behaviour, CLI inventory, completion, specifications, guides, README, manual, and changelog with repository-owned typed stores.
- [x] Cover lifecycle, declaration and path failures, dry-run/write behaviour, registry preservation, VS Code projection, opening, help, completion, and inventory through the public CLI seam.

## Files touched

- `src/commands/repo/`, `src/core/storage/`, `src/core/manage/vscode.ts`, and public command indexes
- `src/tests/cli/repo/`, `src/tests/cli/manage/`, registry tests, completion, help, and inventory contracts
- `docs/specs/`, `docs/guides/user/`, `README.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`

## Verify

- Focused repository-store, VS Code, registry, open, completion, help, and inventory tests pass.
- `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run test:coverage`, manual lint, generated command inventory check, and applicable repository audits pass.

## Dependencies / blocks

No local work-item dependency blocks delivery. Portable store-role authority remains in the declared Knowledge Base contract; this item changes only user-local bindings and consumers.

## Delegation

No delegation: command, registry, VS Code projection, and contract-test changes share one tightly coupled schema cutover and are safer to integrate serially in the shared checkout.

## Documentation impact

### Decision Records

No new decision record. This applies the existing portable store-role boundary by moving machine-local binding ownership into repository tooling.

### Specifications

Define repository-store listing, creation, binding, unbinding, declaration validation, preview/write semantics, and consumer projection requirements in the repository and management contracts.

### Guides

Move source-store setup out of the VS Code guide and document typed store lifecycle under repository operations, including the non-destructive unbind boundary, VS Code's role policy, README, manual, completion, and command-inventory changes.

### Roadmap

Record the delivered command contract, cutover, verification evidence, and post-change review in this item.

## Review

### Delivered

Delivered the approved repository-owned typed-store lifecycle from immutable baseline `3b1b43d6016d3092c69aa537c6bbd49fd57ce81c`. `notes` remains the repository root; `sources` and `legacy` use explicit machine-local bindings; automatic creation remains sources-only; unbinding never deletes content; VS Code remains a binding consumer rather than an owner.

### Change Summary

Added the `ki repo store` command group and typed storage core, expanded registry records to optional `sources` and `legacy` bindings, made repository opening consume every declared external role, and made VS Code consume only explicit `sources` bindings. Removed the editor-owned source command and registry-owned `--sources` option without aliases. Updated contract tests, specifications, guides, README, manual, generated inventory, completion, and changelog.

### Verification

Focused repository-store, VS Code, registry, open, repair, completion, help, and inventory tests pass. TypeScript, Biome, Knip, manual lint, generated command inventory, `ki-self`, `ki-engineering`, `ki-authoring`, `ki-repo-tools`, and `ki-work-roadmap` audits pass. The full elevated suite passes 888 tests with 100% statements, branches, functions, and lines; elevation supplies only the installer fixture's required local-loopback listener.

### Outstanding concerns

The user-wide chezmoi-managed Codex instruction still names the retired `ki manage vscode source create` command. It is outside this repository delivery and should be updated separately before the next source-store setup.

### Post-change review

The delivered surface meets the approved ownership model and holds the stated boundary. Regression risk concentrates in the local registry schema expansion and command cutover; exact parser, preservation, lifecycle, projection, opening, completion, and inventory tests cover those paths. The change is ready for human acceptance.

### Mini recap

Repository tooling now owns declared store lifecycle, consumers receive typed bindings, and no filesystem-name association remains. Durable behaviour is recorded in repository-operations and management specifications and the paired user guides; no new decision record is required.

## Done

Accepted on 2026-09-26 after human approval of the delivery review packet and successful re-verification against `e45633e60d69cd0623f5ac5e5a532d254c624346`.

## Discussion

### Ownership

Repository-scoped commands should own listing, creating, associating, and removing local bindings for roles declared by the selected repository. Editor projections should remain consumers: they may include, label, trust, or omit roots according to store role, but must not create or infer the underlying association.

### Typed local model

The selected repository itself satisfies the declared `notes` role. External `sources` and `legacy` roles need explicit role-to-path bindings in machine-local state, validated against the repository declaration. Directory naming may support a creation policy, but it must not substitute for the stored typed association.

### Open decisions

Shape the repository command grammar and preview/write boundary; decide which declared roles support automatic directory creation versus association with an existing path; define how each role affects VS Code workspace membership and trusted-folder projection; remove the editor-owned source command without a compatibility alias once the replacement is complete.
