---
id: KI-TOOL-KI-CLI-143
area: CLI
title: Separate local harness paths
project: tools-burndown
component: dev
kind: deliver
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: df1c24ed60342c2d9d194bebee9970ab3974bede
created_at: 2026-10-16T19:30:03Z
updated_at: 2026-10-18T05:55:00Z
---

# Separate local harness paths

## Goal

Keep remembered local harness checkout locations on the host that owns them instead of in portable user configuration. Preserve each host's current development source selection and the behaviour of bootstrap and local development on/off while making that separation explicit.

## Context

[The user configuration module](../../src/agents/configuration.ts) reads and writes `[locals.<harness-id>].path` inside `config.toml`. `setLocalBootstrapHarness` remembers the selected source there. [Local development operations](../../src/core/harness/development/local.ts) then use that remembered mapping to enable a source checkout or restore the installed harness, and [bootstrap refresh](../../src/agents/bootstrap.ts) carries it through configuration rewrites.

A portable chezmoi-managed configuration therefore contains host-specific checkout addresses even though checkout locations and availability can differ between hosts. Simply deleting those entries today would remove information the current local development commands use. The prospective change needs an explicit host-local ownership and resolution model, plus a safe migration that preserves behaviour rather than a configuration-only deletion.

The state directory already holds host-local state: [the local repository registry](../../src/core/storage/registry.ts) lives at `$XDG_STATE_HOME/ki/registry.toml`, and `ki bootstrap --refresh` already moves the retired `repositories.paths` list there once.

## Boundary

Adopted, planned and delivered on 18 October 2026 by the ways-of-working run `ki-burndown-2` under HARNESS-PATHS a), approved provisionally on Fable's opinion with two refinements: the host-local file is the single authority once migrated, with `[locals]` in `config.toml` read only as one-time migration input and a warning; and a missing remembered checkout is refused, never guessed. Provisional, for Kris to confirm.

Delivery is against isolated HOME and XDG fixtures only. No live rewrite of `config.toml` on any host, no bootstrap run on Terra or Sol, no chezmoi source change and no release are authorised. Do not move any checkout, switch an active harness, change source-store bindings, alter release pinning or publish a release. This item concerns remembered local harness checkout mappings, not general XDG cleanup, repository registration or tool-storage inventory. Preserve configured release URL, digest and authentication settings.

Do not place real host paths, credentials or private machine inventory in this record. Do not equate host-local state with disposable cache, or assume a newly generated repository registry can recreate an explicit local harness choice.

## Plan

### Ownership and resolution

- The host-local file `$XDG_STATE_HOME/ki/locals.toml` owns the harness identity-to-checkout mapping, in the same `[locals."<owner>/<name>"]` and `path` shape `config.toml` used, so the move is a copy and the validation is shared. A dedicated file, not the repository registry: registry entries are keyed by repository identity and regenerated, while a local source is an explicit user choice per harness.
- Once the file exists it is the only authority. Entries still in `config.toml` are ignored and reported as a warning naming the host-local file, including when they disagree with it.
- Before the file exists, the `config.toml` entries are the migration input: read-only commands (`ki diag`, `ki doctor`, `ki dev local on|off` with no identifier) show them with a warning that they await their move, so a host keeps working until its next mutating command.
- An invalid host-local file is reported by `ki diag` and refused by every command that needs a local source; nothing falls back to `config.toml`.
- A remembered checkout that is missing on this host is refused by `ki dev local on` with a message naming the harness and the remembered path and pointing at `ki dev local set`. `ki dev local off` and bootstrap keep their current behaviour: `off` never needs the checkout, and bootstrap already restores the verified archive when an active binding's checkout is gone.

### Migration and behaviour preservation

- `ki bootstrap` (with or without `--refresh`) and `ki dev local set` move valid `config.toml` entries into the host-local file once, when the file does not exist and the configuration is valid. Bootstrap reports the count, as it does for retired repository paths.
- KI never deletes or edits the `config.toml` `[locals]` table: its writer keeps it verbatim as a table it no longer owns. Removing it from the chezmoi source, and so from each live file, is a separate human step with its own approval, after which the warning stops. KI and chezmoi therefore never compete over the same entries, and the transition is recoverable: removing the host-local file re-runs the migration from the untouched configuration.
- `ki dev local set` writes only the host-local file; it no longer rewrites `config.toml`. Remembering versus enabling, the source kept while development is off, `off` restoring the installed harness, bootstrap keeping an active binding and the user skill projections are unchanged.
- The transition support is bounded: the `config.toml` reader exists only as migration input and can be removed in a later release once both hosts have migrated and the chezmoi source no longer carries the table.

## Current state

[local-sources.ts](../../src/agents/local-sources.ts) owns `$XDG_STATE_HOME/ki/locals.toml`: inspection, the one-time move, `ki dev local set`'s upsert and the missing-checkout refusal. The configuration writer no longer owns `locals`, so it keeps the table verbatim and its inspector reports it only as migration input; the shared validator lives in [internal.ts](../../src/agents/internal.ts). Bootstrap moves the entries before it reads them and reports the move; `ki dev local set|on|off`, `ki diag`, `ki doctor` and `ki repair` read the host-local sources.

## Steps

- [x] Add the host-local sources module with its path, inspection, one-time migration and upsert, sharing the `locals` validator with the configuration inspector.
- [x] Stop the configuration writer owning `locals`: keep the table verbatim, expose it as migration input, and drop the locals parameter from the writer and the refresh ports.
- [x] Route `ki dev local set|on|off`, bootstrap, `ki diag` and `ki doctor` through the host-local sources; migrate in bootstrap and `set`; refuse a missing remembered checkout in `on`.
- [x] Cover the model through the public CLI with isolated HOME and XDG roots, update the existing tests that asserted `config.toml` locals, and note the change in the changelog and README if it describes the storage.

## Files touched

- [src/agents/local-sources.ts](../../src/agents/local-sources.ts), new
- [src/agents/configuration.ts](../../src/agents/configuration.ts), [src/agents/internal.ts](../../src/agents/internal.ts), [src/agents/bootstrap.ts](../../src/agents/bootstrap.ts), [src/agents/index.ts](../../src/agents/index.ts)
- [src/core/harness/bootstrap/operation.ts](../../src/core/harness/bootstrap/operation.ts), [src/core/harness/bootstrap/types.ts](../../src/core/harness/bootstrap/types.ts), [src/core/harness/development/local.ts](../../src/core/harness/development/local.ts), [src/core/harness/development/types.ts](../../src/core/harness/development/types.ts)
- [src/commands/bootstrap/index.ts](../../src/commands/bootstrap/index.ts), [src/commands/bootstrap/ports.ts](../../src/commands/bootstrap/ports.ts), [src/commands/dev/ports.ts](../../src/commands/dev/ports.ts), [src/commands/dev/local/index.ts](../../src/commands/dev/local/index.ts)
- [src/commands/manage/manage-configuration.ts](../../src/commands/manage/manage-configuration.ts), new; [src/commands/manage/diag.ts](../../src/commands/manage/diag.ts), [src/commands/manage/doctor.ts](../../src/commands/manage/doctor.ts), [src/commands/manage/repair.ts](../../src/commands/manage/repair.ts)
- [src/tests/cli/dev/dev.test.ts](../../src/tests/cli/dev/dev.test.ts), [src/tests/cli/bootstrap/bootstrap.test.ts](../../src/tests/cli/bootstrap/bootstrap.test.ts), [src/tests/cli/manage/diag.test.ts](../../src/tests/cli/manage/diag.test.ts)
- [man/ki.1](../../man/ki.1), [the local development guide](../../docs/guides/developer/local-development.md), [CHANGELOG.md](../../CHANGELOG.md)

## Verify

- Public-CLI tests through `run(args, context)`, synthetic harness identities, no network:
  - `ki dev local set` writes the host-local file and leaves `config.toml` without a `[locals]` table;
  - two sandboxes sharing one `config.toml` choose different checkouts without either path entering it;
  - an existing `config.toml` `[locals]` table moves on `ki bootstrap`, survives in `config.toml` verbatim, is then ignored with a warning, and an entry that disagrees with the host-local file does not win;
  - before migration `ki dev local on` still enables the remembered source;
  - a remembered but disabled source, an active source kept by bootstrap and refresh, and `off` restoring the installed harness;
  - a missing remembered checkout is refused by `on`; an invalid host-local file is reported and refused.
- The full coverage suite passes at the 100% thresholds; `tsc`, Biome and the repository audit pass.
- Terra and Sol are verified separately only after the migration and the chezmoi source change are approved: record each host's pre-change source selection, active development status and installed harness identity, then prove the behaviour is preserved. Per-host physical paths belong in protected local evidence, not this record.

## Dependencies / blocks

[KI-TOOL-KI-CLI-142](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-142-preserve-harness-release-settings.md), the release-settings round trip, is delivered and awaiting review. The live migration on each host and the chezmoi source change wait on Kris.

## Documentation impact

### Decision Records

None: the ownership choice is recorded here and in the changelog.

### Specifications

None.

### Guides

The README and changelog, where they describe where `ki dev local set` remembers a checkout.

### Roadmap

This record only.

## Review

### Delivered

Remembered harness checkouts now live in the host-local `$XDG_STATE_HOME/ki/locals.toml`; `config.toml` `[locals]` is one-time migration input, kept verbatim and then ignored with a warning, and a missing remembered checkout is refused.

### Change Summary

A new host-local sources module owns the file, its move and its upsert. The configuration writer stops owning `locals`, and the refresh ports lose their locals parameter. Bootstrap migrates before it reads and reports the move; the development, diagnostic, doctor and repair adapters read the host-local sources.

### Verification

Ten new public-CLI tests in the `host-local sources` block of `dev.test.ts` cover two hosts sharing one configuration, the pending read, the bootstrap move and its idempotence, a conflicting `config.toml` entry losing, `set` moving other entries first, no move from an invalid configuration, the missing-checkout refusal, and four invalid host-local file shapes refused by `on`, bootstrap, `ki diag` and `ki doctor`. Existing tests now assert the host-local file. The full coverage suite (1309 tests) passes at the 100% thresholds; `tsc`, Biome and the man-page lint pass.

### Outstanding concerns

- Terra and Sol are not migrated or inspected. Their move needs an installed build carrying this change and Kris's approval of a live `ki bootstrap` on each; removing `[locals]` from the chezmoi source is a separate chezmoi change, on hold.
- Provisional choices, for Kris to confirm: the file name `locals.toml` and its `[locals]` shape; KI keeps `config.toml` `[locals]` verbatim rather than deleting it; read-only commands and `on|off` read the pending entries before the move; plain `ki bootstrap`, not only `--refresh`, performs the move; `ki repair` reads the same composed configuration as `ki doctor`.

### Post-change review

The change keeps release settings, delegated tables and repository migration intact; the only behaviour removed is `ki dev local set` writing `config.toml`.

### Mini recap

Each Mac now keeps its own harness checkout paths, and the shared configuration stops carrying them.

## Discussion

### Host-local ownership and resolution

Choose a single authoritative host-local home for the harness identity-to-checkout mapping and define how command resolution reaches it. Consider whether an existing host registry can represent the required ownership faithfully or a dedicated mapping is necessary; do not assume repository registration alone identifies the intended harness source. Keep portable harness identities and user intent separate from physical addresses.

Define missing, unavailable, invalid and conflicting mappings honestly. Avoid guessing another checkout or silently selecting a different installed or development harness when the remembered source cannot be used. Resolve the authority and recovery of this metadata before choosing its storage path or schema.

### Migration and behaviour preservation

Design an explicit, recoverable transition from existing `locals` entries. Preserve the distinction between remembering a checkout and enabling it, the selected source when development is disabled, restoration of the installed harness on `off`, bootstrap refresh, and user skill projections. Decide how existing active development links and portable configuration managed by another tool participate without competing writers or an unapproved live rewrite. Bound any transition support deliberately rather than introduce indefinite compatibility paths.

### Verification expectations

Future implementation needs public CLI contract tests through `run(args, context)` with isolated HOME/XDG roots, synthetic harness identities and no network access. Demonstrate independent hosts choosing different checkout locations without leaking paths into portable configuration; cover migration, remembered but disabled sources, active sources, unavailable mappings, bootstrap refresh and local on/off restoration.

Verify Terra and Sol separately only after the migration and its runtime actions are approved. Record each host's pre-change source selection, active development status and installed harness identity, then prove the intended behaviour is preserved. Terra inspection does not establish Sol's state; Sol has not been inspected for this concern. Per-host physical paths belong in protected local evidence, not this shared record.
