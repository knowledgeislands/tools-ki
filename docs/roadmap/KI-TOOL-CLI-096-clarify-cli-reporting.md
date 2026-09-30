---
id: KI-TOOL-CLI-096
area: CLI
title: Clarify CLI reporting
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T09:46:47Z
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

- [ ] Make roadmap not-done counts and Agora owner/member counts self-describing in text output.
- [ ] Correct singular/plural wording and the manual's timestamp-free claim.
- [ ] Update public CLI tests and user-facing specification/manual examples.

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

## Discussion

### Contract boundary

Versioned JSON fields remain unchanged; the text presentation may use clearer labels without silently changing counts.
