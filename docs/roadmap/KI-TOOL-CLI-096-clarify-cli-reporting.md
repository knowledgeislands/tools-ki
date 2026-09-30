---
id: KI-TOOL-CLI-096
area: CLI
title: Clarify CLI reporting
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: f8bc2e4c3f02b53b98a78546dcfe7329989a338d
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T10:23:44Z
---

# KI-TOOL-CLI-096: Clarify CLI reporting

## Goal

Roadmap and Agora reports use labels that accurately explain their counts, and the manual describes the actual work-item timestamp requirement.

## Context

Roadmap `ACTIVE` counts every not-done item, including Triage drafts. Agora `list` labels an owner `leader`, renders `1 members`, and calls a count of distinct repositories across profiles `MEMBERS`. The manual says timestamp-free work records are readable, contrary to the parser and specification.

## Boundary

Do not change roadmap item lifecycle, Agora membership resolution, or versioned JSON shapes. Keep count semantics stable while making human-facing labels and explanatory text precise.

## Current state

Text labels and manual prose disagree with domain meanings; tests assert current labels.

## Steps

- [x] Make roadmap not-done counts and Agora owner/member counts self-describing in text output.
- [x] Correct singular/plural wording and the manual's timestamp-free claim.
- [x] Update public CLI tests and user-facing specification/manual examples.

## Files touched

Roadmap and Agora renderers, their CLI tests, README/manual, and relevant specifications.

## Verify

Focused CLI suites, manual lint, command-inventory check, type check, Biome, and full coverage gate pass.

## Dependencies / blocks

None; role-free Agora contract changes remain in CLI-089.

## Documentation impact

### Decision Records

No new decision; labels reveal existing semantics.

### Specifications

Clarify report count definitions and timestamp validity.

### Guides

Correct manual and user-facing examples.

### Roadmap

Record delivery here; CLI-089 remains separate.

## Review

### Delivered

The approved reporting clarification is implemented from baseline `f8bc2e4c3f02b53b98a78546dcfe7329989a338d`. Count semantics and versioned JSON shapes remain unchanged.

### Change Summary

Roadmap text uses `NOT_DONE` for the count previously labelled `ACTIVE`; Agora list uses `home`, correct singulars, and `MEMBER_REPOSITORIES` for distinct repositories across profiles. CLI tests, specifications, manual, and generated inventory reflect the output. The manual now states that local work items require paired canonical timestamps.

### Verification

Focused roadmap, Agora, and inventory suites, TypeScript, manual lint, and generated inventory check passed. `bun run test:coverage -- --reporter=dot` passed 939 tests with 100% statements, branches, functions, and lines.

### Outstanding concerns

Independent review and acceptance remain. The version 2 JSON statistics field retains the name `active` with its documented not-done meaning; a JSON rename would require a separate public contract decision.

### Post-change review

The human-readable output now identifies what the counts mean without changing their values. Existing JSON consumers remain compatible; the item is ready for review.

### Mini recap

Text reports and documentation are aligned with current domain semantics. No automatic follow-on is created for the possible future JSON rename.

## Discussion

### Contract boundary

Versioned JSON fields remain unchanged; the text presentation may use clearer labels without silently changing counts.
