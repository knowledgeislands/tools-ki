---
id: KI-TOOL-CLI-069
area: CLI
title: Align future item parsing
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-14T19:04:19Z
updated_at: 2026-09-14T19:04:19Z
---

# Align future item parsing

## Goal

Make `ki repo roadmap list` interpret Future work using the same current roadmap contract enforced by compatible harnesses, without requiring the retired `candidate` field.

## Context

The `ki 0.3.6` roadmap reader requires `candidate: true` when `horizon: future`, while the current `ki-work-roadmap` standard requires `candidate` to be absent. A standards-compliant Infoschematics roadmap therefore passes the harness audit but produces six item diagnostics from `ki repo roadmap list`.

The disagreement makes a read-only native command report valid records as malformed and encourages a workaround that makes the canonical audit fail.

## Boundary

This item does not change horizon meanings, reintroduce a compatibility field, alter consumer roadmap records, or weaken the harness audit. It does not address unrelated roadmap-list presentation.

## Discussion

### Contract ownership

Compatible harnesses own work-item semantics; the native CLI should consume that current contract rather than preserve an older interpretation independently.

### Migration behaviour

Implementation should remove the Future-only `candidate` requirement and update CLI-driven fixtures covering both valid Future records and genuinely malformed items. Historical `candidate` fields remain governed by the harness audit rather than accepted as a second schema.
