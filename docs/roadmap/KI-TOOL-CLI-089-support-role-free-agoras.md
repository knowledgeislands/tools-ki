---
id: KI-TOOL-CLI-089
area: CLI
title: Support role-free Agoras
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-27T19:09:14Z
updated_at: 2026-09-27T19:09:14Z
---

# KI-TOOL-CLI-089: Support role-free Agoras

## Goal

Make `ki` resolve, audit, and project reciprocal Agora membership without role labels if the portable contract drops them.

## Context

This low-priority tooling follow-up originated in a 2026-09-27 user discussion in `ki-arcadia-principal`. The current Agora resolver validates a role in each home member entry and member declaration, then requires matching values. `KI-HARNESS-GOV-119` in `ki-agentic-harness` owns the contract decision and blocks this implementation item.

## Boundary

Preserve owner approval, independent member consent, canonical identity checks, and existing projection behaviour. Do not change the CLI before the harness contract and migration approach are agreed. Repository declaration migration belongs to the affected repositories, not to this tooling item.

## Discussion

### Migration and verification

Once the harness contract is settled, update parsing, resolution, diagnostics, public CLI output, and tests consistently. Check whether a transition period is needed for existing role-bearing declarations; do not silently treat mismatched old declarations as reciprocal.
