---
id: KI-TOOL-KI-CLI-143
area: CLI
title: Separate local harness paths
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T19:30:03Z
updated_at: 2026-10-16T19:30:03Z
---

# Separate local harness paths

## Goal

Keep remembered local harness checkout locations on the host that owns them instead of in portable user configuration. Preserve each host's current development source selection and the behaviour of bootstrap and local development on/off while making that separation explicit.

## Context

[The user configuration module](../../src/agents/configuration.ts) reads and writes `[locals.<harness-id>].path` inside `config.toml`. `setLocalBootstrapHarness` remembers the selected source there. [Local development operations](../../src/core/harness/development/local.ts) then use that remembered mapping to enable a source checkout or restore the installed harness, and [bootstrap refresh](../../src/agents/bootstrap.ts) carries it through configuration rewrites.

A portable chezmoi-managed configuration therefore contains host-specific checkout addresses even though checkout locations and availability can differ between hosts. Simply deleting those entries today would remove information the current local development commands use. The prospective change needs an explicit host-local ownership and resolution model, plus a safe migration that preserves behaviour rather than a configuration-only deletion.

## Boundary

Capture only; no adoption, priority, implementation, migration or live changes are authorised. Do not move any checkout, switch an active harness, change source-store bindings, alter release pinning or publish a release. This item concerns remembered local harness checkout mappings, not general XDG cleanup, repository registration or tool-storage inventory. Preserve configured release URL, digest and authentication settings; their current rewrite defect has a separate owner.

Do not place real host paths, credentials or private machine inventory in this record. Do not equate host-local state with disposable cache, or assume a newly generated repository registry can recreate an explicit local harness choice.

## Discussion

### Host-local ownership and resolution

Choose a single authoritative host-local home for the harness identity-to-checkout mapping and define how command resolution reaches it. Consider whether an existing host registry can represent the required ownership faithfully or a dedicated mapping is necessary; do not assume repository registration alone identifies the intended harness source. Keep portable harness identities and user intent separate from physical addresses.

Define missing, unavailable, invalid and conflicting mappings honestly. Avoid guessing another checkout or silently selecting a different installed or development harness when the remembered source cannot be used. Resolve the authority and recovery of this metadata before choosing its storage path or schema.

### Migration and behaviour preservation

Design an explicit, recoverable transition from existing `locals` entries. Preserve the distinction between remembering a checkout and enabling it, the selected source when development is disabled, restoration of the installed harness on `off`, bootstrap refresh, and user skill projections. Decide how existing active development links and portable configuration managed by another tool participate without competing writers or an unapproved live rewrite. Bound any transition support deliberately rather than introduce indefinite compatibility paths.

### Verification expectations

Future implementation needs public CLI contract tests through `run(args, context)` with isolated HOME/XDG roots, synthetic harness identities and no network access. Demonstrate independent hosts choosing different checkout locations without leaking paths into portable configuration; cover migration, remembered but disabled sources, active sources, unavailable mappings, bootstrap refresh and local on/off restoration.

Verify Terra and Sol separately only after the migration and its runtime actions are approved. Record each host's pre-change source selection, active development status and installed harness identity, then prove the intended behaviour is preserved. Terra inspection does not establish Sol's state; Sol has not been inspected for this concern. Per-host physical paths belong in protected local evidence, not this shared record.
