---
id: KI-TOOL-CLI-080
title: Command inventory contract
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
transferred_from: ki-website
baseline_ref: null
created_at: 2026-09-22T00:00:00Z
updated_at: 2026-09-24T22:48:00Z
---

## Goal

A consumer can obtain this CLI's complete command inventory — every group, every invocation, every description — from something this repository states it publishes and tests, rather than by parsing a manual page that nothing promises to keep in shape.

## Context

KI Website now carries the full `ki` command reference at `/guidance/cli/commands/`, because the site's ownership standard says a reader should not have to open a Git repository to find out what a tool does. Hand-writing eighty-eight commands was rejected for the obvious reason: the last hand-written inventory on that site drifted to 42 entries against an upstream 61 with nothing noticing.

So the site vendors `man/ki.1` at a pinned tag and parses its COMMAND GROUPS section. That works, and it is deliberately fail-closed — any roff construct the parser does not recognise throws rather than publishing a partial inventory. But it is a consumer of something that is published rather than specified, which is the weaker of the two vendoring cases the site distinguishes (its ADR-KI-WEBSITE-001 records the distinction, against `ki-repo-harness`'s marker-delimited catalogue block as the stronger one).

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

- [ ] Record the generated-file decision in a Product Decision Record: publish `man/ki.commands.json` as `ki/commands/v1`, generated fail-closed from the reconciled manual inventories rather than from shortened Commander descriptions.
- [ ] Reconcile the `v0.4.0` divergence: restore `Batch records` to COMMAND GROUPS, and align `ki registry add`'s options between the two sections.
- [ ] Add a typed inventory parser and generator that publishes groups, purposes, invocations, and full descriptions with the schema identity in every payload.
- [ ] Add checks that fail when the manual's two inventories disagree, when the generated payload drifts, or when its command paths do not round-trip against the registered Commander tree.
- [ ] Specify and document the pinned-ref JSON surface so KI Website can consume it and drop its roff reconciliation in its own independently authorised change.

## Files touched

- `man/ki.1` — the reconciliation.
- The inventory parser, generator, generated `man/ki.commands.json`, and command-inventory tests.
- A Product Decision Record, the CLI specification, and the guide covering machine-readable output.

## Verify

`ki repo audit --repo .` passes. A check exists that fails on a command present in one manual section and absent from the other, demonstrated by a fixture. The generated payload matches its source, validates as `ki/commands/v1`, and its command paths round-trip against the registered command set.

## Dependencies / blocks

Implementation follows `KI-TOOL-CLI-079`, which settles the shared schema-identity convention for versioned projections.

Blocked by nothing in KI Website. The site is unblocked and shipping today — it consumes the manual at a pinned ref and states in its own ADR that the dependency is weaker than it would like. Nothing breaks there if this item waits.

## Documentation impact

### Decision Records

Record why the command inventory is a generated, pinned-ref JSON file sourced from the full manual descriptions rather than a runtime projection of shortened Commander descriptions.

### Specifications

If a projection is published, its payload is specified alongside the other `ki/*/v1` contracts.

### Guides

The guide covering machine-readable output gains the new surface.

### Roadmap

KI Website's `KI-WEB-SITE-022` delivered the vendored reference and recorded this handoff. That item is not held open waiting for this one.

## Discussion

The originating request came from KI Website, which owns the published guidance and can verify what its readers see; this repository owns the command surface and can verify what the CLI actually registers. Neither can verify the other's half, which is why the work splits here.

The site's position, stated plainly: vendoring an unspecified interface is accepted knowingly, with a fail-closed parser as the compensation. It is not a complaint about the manual — a complete grouped inventory in the shipped manual page is more than most tools publish. It is a request to make the thing a contract, so that the compensation stops being necessary.

### Selected contract

The published surface is `man/ki.commands.json` with schema identity `ki/commands/v1`. A repository file is the right boundary for the pinned-ref website consumer, while generation from the reconciled manual preserves the group purposes and full command descriptions the site already publishes. The registered Commander tree remains an independent completeness check rather than the prose source.
