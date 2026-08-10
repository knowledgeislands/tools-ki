---
id: KI-TOOL-CLI-036
title: Compose KB store roles
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: 76fc8a7c7e1154b1bc69397702adb3f181df7d32
transferred_from: KI-TOOL-CLI-018
---

## Goal

Allow a supported local target to compose a Knowledge Base repository with its declared `notes` and optional `sources` store roles without treating an external store as a canonical KI repository.

## Context

CLI-018 completed the canonical Agora estate: a local registry binds canonical repository identities to physical checkouts, and `estate` selects only those repositories. The accepted `ki-repo` contract declares a Knowledge Base's `store_roles`: `notes` is required and `sources` is optional. Roles are portable declarations, not machine paths. This CLI does not yet resolve a local source binding or include it when opening a target workspace.

## Boundary

Do not add an external store to the estate, trade registry, Agora membership, or tracked repository configuration. Keep `ki agora open` as the canonical-group operation. Do not infer paths from names; `ki repo open` may include only a declared and registered `sources` store for each selected Knowledge Base.

## Current state

The local registry represents canonical KI repositories only. It has no per-KB `sources` binding, and no repository target currently opens a source store with the canonical `notes` repository. `ki agora open` already correctly opens canonical group members and remains separate. There is no current `legacy` store to support.

## Steps

- [x] Select `ki repo open` as the first target, using the existing repository-selection rules for one repository, groups, and other supported target sets.
- [x] Keep Agora opening separate and include available stores for every selected Knowledge Base by default, including multi-repository selections.
- [x] Extend the local registry's canonical KB entry with an optional `stores.sources` absolute path. The KB's `.ki-config.toml` remains the authority for whether `sources` exists.
- [x] Extend the existing `ki registry add` transaction with `--sources <absolute-path>`. A selected KB that declares `sources` requires exactly one selected target and this option; an add of the same canonical KB replaces its repository path and source binding together. Do not add or rename a command.
- [x] Reject registration when a declared source is missing, non-absolute, not a direct directory, or a symlink. Preserve the existing registry entry on failure.
- [x] Make automatic registration by `ki repo conform` and `ki repo repair` subject to the same complete-composition invariant. A KB with declared sources must already have a valid matching source binding; otherwise the operation fails and directs the user to `ki registry add`.
- [x] Open each selected repository's `notes` root followed by its registered `sources` root; a complete registry entry makes missing-source fallback unnecessary.
- [x] Define mutually exclusive `--stores` and `--no-stores` switches: inclusion is the default, and individual roles are not independently selectable.
- [x] Implement the target's composition using only local bindings without adding stores to canonical repository discovery.
- [x] Exercise valid, missing, malformed, unsafe, and deterministic-order cases at the CLI boundary.

## Files touched

Expected surfaces are `src/core/configuration.ts`, `src/core/local-registry.ts`, the `ki registry` command family, automatic-registration callers, a focused local-store resolver, the repository open command, and their CLI contract tests.

## Verify

- Focused CLI contract suites for registry add/replacement, automatic registration, and repository open: valid bindings, missing declared stores, malformed and unsafe paths, atomic preservation, and deterministic output order.
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

None. The user approved the complete-composition registration invariant on 10 August 2026.

## Delegation

- One worker may implement the declaration and local-registry schema, rendering, and CLI contract coverage for registration.
- A second worker may inspect and prepare the repository-open command and its CLI coverage after the registry schema is settled; it must not edit the registry module concurrently.
- The orchestrator integrates the automatic-registration callers, runs the complete verification gate, and reviews every CLI contract.

## Review

### Delivered

`ki registry add --sources` now records a complete local KB composition, and `ki repo open` opens notes followed by sources by default.

### Summary of changes

Added KB-role parsing, source-store validation, atomic source-bound registry replacement, complete-binding guards, editor opening, completion/man/changelog coverage, and CLI contracts.

### Verification

Focused registry, repair, open, completion, and inventory contracts passed; `bunx tsc --noEmit`, `bun run test:coverage`, and Biome passed.

### Outstanding concerns

None. `legacy` remains intentionally unsupported by this delivery.

### Post-change review

Sol found that a source-bound KB could be silently downgraded by ordinary registration. Replacement now requires both entries to carry complete source bindings, with a regression contract.

### Mini recap

The local registry can own machine-specific source paths without treating sources as repositories or Agora members.

## Done

Approved by Kris Brown in this conversation on 10 August 2026. The review packet is accepted and this record is done.

## Discussion

### Local composition boundary

`notes` remains the canonical Knowledge Base repository itself. `ki repo open` uses the standard repository target selection and includes each selected notes project's source store, whether the selection has one or many repositories. The binding is replaceable local state rather than portable repository identity: it lives beneath the existing canonical KB entry in `$XDG_STATE_HOME/ki/registry.toml`, never makes the source directory a repository or Agora member, and is not a second registry lifecycle.

```toml
[repositories."example-kb".stores]
sources = "/absolute/path/to/example-sources"
```

`notes` is the registered repository `path`; `sources` is an absolute direct directory, not a symlink. `legacy` is outside this delivery.

### Complete registration

The registry is a complete local composition for a Knowledge Base. When its declaration includes `sources`, `ki registry add --sources <absolute-path>` must receive and validate the local source path in the same transaction as the canonical repository root; omission or an unsafe path fails without changing the current registry entry. Adding an already registered KB replaces its notes and sources paths together. Automatic registration by conforming or repair accepts an existing complete binding only; it fails with the explicit registration command when one is absent.

### Store selection

Stores are included by default. `--stores` makes that choice explicit for scripts and `--no-stores` opens canonical repositories only; the switches are mutually exclusive. There is no per-role flag: a caller either receives every available bound store or none.

### Promotion condition

The user approved the complete-registration model: a declared `sources` role must be registered with its KB, so this item is ready for implementation.
