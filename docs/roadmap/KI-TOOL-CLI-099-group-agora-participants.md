---
id: KI-TOOL-CLI-099
area: CLI
title: Group Agora participants
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T12:12:04Z
updated_at: 2026-09-30T12:12:04Z
---

# Group Agora participants

## Goal

Human-facing Agora output clearly distinguishes the declaring home, reciprocal member repositories, and owner-selected references.

## Context

`ki agora show` currently reports the home as metadata and repeats it inside `members`, while `ki agora list` includes the home in its member count. References are shown separately only when present. The portable Agora contract gives these participants different relationships: the home owns the group declaration, members independently consent, and references are working-set repositories without membership. The output should make those relationships legible without implying that the home governs member repositories.

## Boundary

Shape the human-facing `ki agora show` and `ki agora list` presentation and their contract tests. Keep the protected derived `estate` intelligible without inventing a home, and preserve machine-readable roots, projection order, reciprocal resolution, and repository authority. Agora declaration parsing and migration are separate contract work.

## Discussion

### Group labels and counts

Show the home once, list only non-owner reciprocal participants under `members`, and list references under their own label. Define counts so list, show, and summaries agree on whether the home is included. Continue to report unresolved references distinctly from resolved participants.

### Presentation boundary

Use the CLI's existing human-report framing. Keep `ki agora roots` and other contract-oriented output stable; grouping is presentation, not a change to participant resolution or permissions.
