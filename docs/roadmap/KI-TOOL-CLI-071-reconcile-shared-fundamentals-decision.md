---
id: KI-TOOL-CLI-071
area: CLI
title: Reconcile Shared Fundamentals Decision
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-16T09:08:39Z
updated_at: 2026-09-16T09:08:39Z
---

# Reconcile Shared Fundamentals Decision

## Goal

Reconcile tools-ki's copy of `GDR-KI-FUNDAMENTALS-001` with the approved canonical shared-decision projection.

## Context

`KI-HARNESS-GOV-063` defines shared identity as a deterministic projection of Decision Record-owned fields and body, excludes only Knowledge Base `note_type`, and fails closed on unknown frontmatter. The common decision body now uses the current `ki-specifications` and `ki-website` repository names and states the projection contract.

## Boundary

Update only the tools-ki copy after independent review. Do not add repository-local metadata, change the portable projection contract from this repository, or claim estate-wide reconciliation. Verification must compare the approved canonical projection and preserve receiver acceptance authority.

## Discussion

Origin: `KI-HARNESS-GOV-063`. This receiver work neither blocks nor is blocked by the Harness implementation. Completion should record the accepted tools-ki revision for the later six-repository observation in `KI-HARNESS-GOV-069`.
