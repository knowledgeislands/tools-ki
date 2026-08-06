---
id: TRD-9ab83d52
title: 'Activate delegation standard'
created_at: 2026-08-05T18:44:07Z
sender: knowledgeislands/ki-agentic-harness
receiver: knowledgeislands/tools-ki
kind: work
source_ref: KI-HARNESS-GOV-013
observation: decision
decision_status: declined
received_from_ref: 323ed367ad526d1583802bd59eeb1466adea34c0
rationale: 'The current Harness bootstrap standard deliberately retains ki-delegation as opt-in and defines a seven-skill core inventory.'
---

# TRD-9ab83d52: Activate delegation standard

## Context

The harness now separates the `ki-delegation` governance standard from the `ki-delegate` operational process.

`ki-delegate` declares the standard as its prerequisite, so a default user installation must activate both skills.

## Submission

Update `ki bootstrap`'s canonical core-user skill inventory to include `ki-delegation` before `ki-delegate`.

Update the affected CLI tests, help or reference output, and any managed-runtime projection expectations so the documented nine-skill core inventory is executable rather than prose only.

## Constraints

Keep this a local user-skill activation change; do not add a repository declaration, remote transport, or cross-repository write.

Preserve the existing user activation authority and verify both new and refreshed bootstrap paths.
