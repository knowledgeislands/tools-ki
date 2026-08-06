---
id: TRD-4a0f42a2
title: "Implement trade lifecycle"
created_at: 2026-08-06T10:32:52Z
sender: knowledgeislands/ki-agentic-harness
receiver: knowledgeislands/tools-ki
kind: work
source_ref: "KI-HARNESS-GOV-014"
observation: decision
decision_status: applied
received_from_ref: 323ed367ad526d1583802bd59eeb1466adea34c0
rationale: 'Implemented and verified through the observable trade lifecycle delivery.'
applied_commit: 13058a0c210aa9e44606ce8c4d6fa901e459f4e9
---
# TRD-4a0f42a2: Implement trade lifecycle

## Context

The Harness has adopted an observable trade lifecycle with committed preparations, receiver-local Git observation cursors, observation policies, raw sender-byte preservation, and exact receipt semantics.

## Submission

Implement the bounded ki trade host surface: prepare, observe, submit, abandon, exact-ID receive with explicit bulk preview, policy-aware release and prune eligibility, route deletion guards, committed-ref-only peer reads, and fixtures. Preserve local-only writes and expose the revised lifecycle in help and feature documentation.

## Constraints

Do not alter the Harness checkout or trade policy. Keep preparation observation silent and host-local, never write a peer checkout, never fetch or switch a checkout, preserve submitted bytes, and retain receiver disposition in ki-next. Treat missing observation on legacy records as decision-equivalent during migration.
