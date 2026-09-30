---
id: KI-TOOL-CLI-099
area: CLI
title: Group Agora participants
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 4445673236a4d69c150afa0e1f11449fa9e0da7d
created_at: 2026-09-30T12:12:04Z
updated_at: 2026-09-30T19:39:18Z
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

- [x] Render the named home once and show only reciprocal non-owner repositories under `members`, preserving their relative projection order and separate reference diagnostics.
- [x] Label estate participants and cross-profile totals as registered repositories, without changing resolver data or `ki agora roots` output.
- [x] Update in-process CLI contract tests for named, owner-only, referenced, and estate profiles, including verbose output and unchanged machine-readable roots.
- [x] Update the Agora specification, user guidance, manual, command inventory, and changelog to match the human-facing output.

## Files touched

`src/commands/agora/list.ts`, `src/commands/agora/show.ts`, focused `src/tests/cli/agora/` tests, `docs/specs/agoras.md`, `docs/guides/user/agora-references.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, and this record. A test-only `src/tests/cli/repo/store-scan.test.ts` regression case closes a pre-existing coverage gap encountered in the full gate. Core Agora resolution and other commands remain untouched.

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

## Review

### Delivered

Implemented the approved human-facing Agora presentation boundary from immutable baseline `4445673236a4d69c150afa0e1f11449fa9e0da7d` in the primary tools-ki checkout. The resulting evidence is the local implementation commit carrying this packet. `ki agora roots`, core resolution, repository authority, and external state were not changed; no acceptance, pruning, release, or push was performed.

### Change Summary

`ki agora list` now counts named homes separately from reciprocal members and labels the estate and cross-profile total as registered repositories. `ki agora show` renders the named home once, shows only reciprocal non-owner members, and keeps resolved and unresolved references distinct. The Agora CLI tests, specification, user guide, manual, generated command inventory, and changelog reflect those labels. A test-only source-store scan regression case exercises an existing disappearing-declaration error path required by the full coverage gate; it does not change source-store behaviour.

### Verification

- Focused Agora, command-inventory, and source-store CLI tests passed after the presentation and test-only edits.
- `bun run test:coverage`: 948 tests in 56 files passed; statements, branches, functions, and lines each reached 100%.
- `bunx tsc --noEmit`, focused `bunx biome check`, command-inventory generator check, `mandoc -T lint man/ki.1`, and Markdown lint passed.
- `ki repo audit --skill` checks for `ki-work-roadmap`, `ki-specs`, `ki-self`, `ki-authoring`, and `ki-repo-tools` passed.
- In-process CLI tests assert named, owner-only, referenced, and estate reports; verbose home paths; member order; and unchanged exact `ki agora roots` bytes.

### Outstanding concerns

Independent review and acceptance of this implementation commit remain pending. No known failed check or unresolved implementation dependency remains.

### Post-change review

The visible participant counts now follow the existing home/member/reference authority model without altering resolution or machine-facing projections. The only adjacent change is a test-only coverage repair in source-store scanning; no production behaviour was expanded beyond the approved presentation boundary.

### Mini recap

The approved presentation, contracts, and documentation are implemented and verified. Review this commit, then accept or request changes; retain the home/member/reference distinction in the Agora specification.

## Discussion

### Group labels and counts

Show the home once, list only non-owner reciprocal participants under `members`, and list references under their own label. Define counts so list, show, and summaries agree on whether the home is included. Continue to report unresolved references distinctly from resolved participants.

### Presentation boundary

Use the CLI's existing human-report framing. Keep `ki agora roots` and other contract-oriented output stable; grouping is presentation, not a change to participant resolution or permissions.
