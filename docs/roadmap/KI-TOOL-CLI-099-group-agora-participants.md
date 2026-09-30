---
id: KI-TOOL-CLI-099
area: CLI
title: Group Agora participants
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T12:12:04Z
updated_at: 2026-09-30T15:18:21Z
---

# Group Agora participants

## Goal

Human-facing Agora output clearly distinguishes the declaring home, reciprocal member repositories, and owner-selected references.

## Context

`ki agora show` currently reports the home as metadata and repeats it inside `members`, while `ki agora list` includes the home in its member count. References are shown separately only when present. The portable Agora contract gives these participants different relationships: the home owns the group declaration, members independently consent, and references are working-set repositories without membership. The output should make those relationships legible without implying that the home governs member repositories.

## Boundary

Shape the human-facing `ki agora show` and `ki agora list` presentation and their contract tests. Keep the protected derived `estate` intelligible without inventing a home, and preserve machine-readable roots, projection order, reciprocal resolution, and repository authority. Agora declaration parsing and migration are separate contract work.

## Current state

The resolver already classifies owner, member, and reference roots. `list` and `show` render its owner-inclusive `members` array directly, so the named home appears twice and member counts include it. The estate has no home and represents all registered repositories.

## Steps

- [ ] Render the named home once and show only reciprocal non-owner repositories under `members`, preserving their relative projection order and separate reference diagnostics.
- [ ] Label estate participants and cross-profile totals as registered repositories, without changing resolver data or `ki agora roots` output.
- [ ] Update in-process CLI contract tests for named, owner-only, referenced, and estate profiles, including verbose output and unchanged machine-readable roots.
- [ ] Update the Agora specification, user guidance, manual, command inventory, and changelog to match the human-facing output.

## Files touched

`src/commands/agora/list.ts`, `src/commands/agora/show.ts`, focused `src/tests/cli/agora/` tests, `docs/specs/agoras.md`, `docs/guides/user/agora-references.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, and this record. Core Agora resolution and other commands remain untouched.

## Verify

Run focused Agora CLI tests; `bunx tsc --noEmit`; `bunx biome check`; `bun run test:coverage`; the command-inventory generator check; `mandoc -T lint man/ki.1`; and focused `ki-work-roadmap`, `ki-specs`, and `ki-self` audits. Assert exact human reports and byte-stable `ki agora roots` output through `run(args, context)`.

## Dependencies / blocks

None. The reciprocal role-label removal is already committed, and current Agora tests and type-checking pass. This is a presentation-only change; no migration, registry write, or cross-repository edit is required.

## Documentation impact

### Decision Records

No new decision record: the existing owner/member/reference authority model is unchanged.

### Specifications

Clarify the accepted Agora report contract and its participant counts in `docs/specs/agoras.md`.

### Guides

Update the Agora reference guide to explain the separate home, member, reference, and estate labels.

### Roadmap

Record implementation and review evidence here; no follow-on item is expected from this bounded presentation change.

## Discussion

### Group labels and counts

Show the home once, list only non-owner reciprocal participants under `members`, and list references under their own label. Define counts so list, show, and summaries agree on whether the home is included. Continue to report unresolved references distinctly from resolved participants.

### Presentation boundary

Use the CLI's existing human-report framing. Keep `ki agora roots` and other contract-oriented output stable; grouping is presentation, not a change to participant resolution or permissions.
