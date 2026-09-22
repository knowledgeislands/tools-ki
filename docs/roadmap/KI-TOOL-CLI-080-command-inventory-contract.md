---
id: KI-TOOL-CLI-080
title: Command inventory contract
area: CLI
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: null
created_at: 2026-09-22T00:00:00Z
updated_at: 2026-09-22T00:00:00Z
---

## Goal

A consumer can obtain this CLI's complete command inventory — every group, every invocation, every description — from something this repository states it publishes and tests, rather than by parsing a manual page that nothing promises to keep in shape.

## Context

KI Website now carries the full `ki` command reference at `/guidance/cli/commands/`, because the site's ownership standard says a reader should not have to open a Git repository to find out what a tool does. Hand-writing eighty-eight commands was rejected for the obvious reason: the last hand-written inventory on that site drifted to 42 entries against an upstream 61 with nothing noticing.

So the site vendors `man/ki.1` at a pinned tag and parses its COMMAND GROUPS section. That works, and it is deliberately fail-closed — any roff construct the parser does not recognise throws rather than publishing a partial inventory. But it is a consumer of something that is published rather than specified, which is the weaker of the two vendoring cases the site distinguishes (its ADR-KI-WEBSITE-003 records the distinction, against `ki-repo-harness`'s marker-delimited catalogue block as the stronger one).

Parsing it surfaced a real defect rather than a hypothetical one. At `v0.4.0` the manual's two inventories disagree.

## Boundary

This item is about publishing the inventory this CLI already knows about itself. It does not change any command's grammar, behaviour, or naming, and it does not ask for the manual page to be replaced — `man ki` stays the reference for someone at a terminal.

Whether the fix is a `--format json` projection, a generated data file in the repository, or a tested structural contract over the manual, is this repository's call.

## Current state

At `v0.4.0`, `man/ki.1` carries two inventories:

- **SYNOPSIS** lists fourteen `.SS` groups, including `Batch records` and its four commands (`ki batch prepare|validate|run|close`), each with a short description.
- **COMMAND GROUPS** lists thirteen groups with a purpose paragraph each and fuller per-command descriptions, and omits `Batch records` entirely.

The two have also drifted at command level: SYNOPSIS gives `ki registry ... add [--dry-run] [--sources <absolute-path>]` where COMMAND GROUPS gives `ki registry ... add [--dry-run]`.

Nothing upstream detects either difference, because nothing asserts that the two sections describe the same command set. The website's sync now reconciles them itself — it parses both, carries a group the reference section omits, and marks it on the published page as an upstream omission — which is a consumer compensating for a producer, and is the reason for this item.

## Steps

- [ ] Decide the shape of the published inventory: a versioned JSON projection (`ki/commands/v1`, following the precedent `ki/trade-routes/v1` set), a generated data file, or a tested contract over `man/ki.1`'s structure.
- [ ] Reconcile the `v0.4.0` divergence: restore `Batch records` to COMMAND GROUPS, and align `ki registry add`'s options between the two sections.
- [ ] Add a check that fails when the manual's two inventories disagree on the command set, so this class of defect cannot ship again.
- [ ] Tell KI Website which surface to consume, so `apps/site/scripts/sync-cli-commands.ts` can target a stated interface and drop its reconciliation.

## Files touched

- `man/ki.1` — the reconciliation.
- The command-registration source and its tests, if a projection is the route chosen.
- `docs/guides/` — whichever guide documents the published surface.

## Verify

`ki repo audit --repo .` passes. A check exists that fails on a command present in one manual section and absent from the other, demonstrated by making it fail. If a projection is published, its payload round-trips against the registered command set in a test.

## Dependencies / blocks

Nothing blocks this. It is adjacent to `KI-TOOL-CLI-079`, which publishes versioned projections of roadmap and registry evidence; this is the same argument applied to the command surface, and the two should share whatever schema-identity convention 079 settles.

Blocked by nothing in KI Website. The site is unblocked and shipping today — it consumes the manual at a pinned ref and states in its own ADR that the dependency is weaker than it would like. Nothing breaks there if this item waits.

## Documentation impact

### Decision Records

A record is owed if a versioned projection is published, since that is a new public contract. None is needed for reconciling the manual with itself.

### Specifications

If a projection is published, its payload is specified alongside the other `ki/*/v1` contracts.

### Guides

The guide covering machine-readable output gains the new surface.

### Roadmap

KI Website's `KI-WEB-SITE-022` delivered the vendored reference and recorded this handoff. That item is not held open waiting for this one.

## Discussion

The originating request came from KI Website, which owns the published guidance and can verify what its readers see; this repository owns the command surface and can verify what the CLI actually registers. Neither can verify the other's half, which is why the work splits here.

The site's position, stated plainly: vendoring an unspecified interface is accepted knowingly, with a fail-closed parser as the compensation. It is not a complaint about the manual — a complete grouped inventory in the shipped manual page is more than most tools publish. It is a request to make the thing a contract, so that the compensation stops being necessary.
