---
id: KI-TOOL-CLI-066
area: CLI
title: Report roadmap statistics
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

# Report Roadmap Statistics

## Goal

Expose useful age and staleness statistics for selected local and remote change-management records through the KI CLI.

## Context

The Harness timestamp contract proposed by `KI-HARNESS-GOV-056` introduces portable creation and update metadata. The CLI already parses and aggregates roadmap records, making it the natural place to validate timestamps, update them during deterministic mutations, and report portfolio statistics.

## Boundary

Do not infer cycle time or throughput from `updated_at`, silently rewrite manually edited records, or implement remote mutations before the remote-adapter execution boundary is delivered.

## Shaping

Extend the work-item codec with monotonic timestamp validation, preserve native GitHub and Linear timestamps at their adapters, update `updated_at` during CLI-owned local mutations, and add a statistics view covering timestamp coverage, age, inactivity, and configurable stale-active counts. Define machine-readable output only through an explicit CLI output contract rather than parsing decorative text.

## Discussion

### Harness dependency

Implementation waits for the field names, precision, compatibility period, and mutation semantics to be accepted in `KI-HARNESS-GOV-056`. This cross-repository dependency remains narrative because roadmap dependency arrays are repository-local.

### Historical records

Provide a bounded backfill or audit-assisted migration using Git history, with explicit handling for renamed, untracked, and shallow-clone records. Report incomplete history rather than inventing timestamps.
