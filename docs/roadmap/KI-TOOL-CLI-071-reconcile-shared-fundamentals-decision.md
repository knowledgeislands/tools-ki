---
id: KI-TOOL-CLI-071
area: CLI
title: Reconcile Shared Fundamentals Decision
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: ac9c59b0877accb9b527fdb534f27ba7a8560967
created_at: 2026-09-16T09:08:39Z
updated_at: 2026-09-16T13:13:01Z
---

# Reconcile Shared Fundamentals Decision

## Goal

Reconcile tools-ki's copy of `GDR-KI-FUNDAMENTALS-001` with the approved canonical shared-decision projection.

## Context

`KI-HARNESS-GOV-063` defines shared identity as a deterministic projection of Decision Record-owned fields and body, excludes only Knowledge Base `note_type`, and fails closed on unknown frontmatter. The common decision body now uses the current `ki-specifications` and `ki-website` repository names and states the projection contract.

## Boundary

Update only the tools-ki copy after independent review. Do not add repository-local metadata, change the portable projection contract from this repository, or claim estate-wide reconciliation. Verification must compare the approved canonical projection and preserve receiver acceptance authority.

## Current state

The tools-ki copy already names the current six repositories, but it predates the approved shared-projection wording and decision date in Harness commit `6f1f95b9788c8ba6af85471650273c6135c8bc4d`.

## Steps

- [x] Update the tools-ki Decision Record-owned projection from the approved Harness source without adding repository-local metadata.
- [x] Prove byte equality with the approved code-repository projection.
- [x] Run Decision Record, roadmap, and authoring audits plus Markdown and diff checks.

## Files touched

- `docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md`
- `docs/roadmap/KI-TOOL-CLI-071-reconcile-shared-fundamentals-decision.md`

## Verify

- `cmp -s ../ki-agentic-harness/docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md`
- `ki repo audit --skill ki-decision-records --repo .`
- `ki repo audit --skill ki-work-roadmap --repo .`
- `ki repo audit --skill ki-authoring --repo .`
- `git diff --check`

## Dependencies / blocks

No delivery block. The approved source is the committed Harness projection at `6f1f95b9788c8ba6af85471650273c6135c8bc4d`; other repositories retain independent acceptance authority.

## Documentation impact

### Decision Records

Reconcile this repository's shared `GDR-KI-FUNDAMENTALS-001` projection with the approved source.

### Specifications

No portable behaviour contract changes in tools-ki; the shared projection contract is already approved upstream.

### Guides

No guide changes are needed for a Decision Record projection reconciliation.

### Roadmap

This item records only the tools-ki receiver delivery and review evidence.

## Review

### Delivered

Reconciled tools-ki's shared `GDR-KI-FUNDAMENTALS-001` projection from immutable baseline `ac9c59b0877accb9b527fdb534f27ba7a8560967` to the approved Harness source at `6f1f95b9788c8ba6af85471650273c6135c8bc4d`. No other repository was changed.

### Summary of changes

Updated the decision date and shared-projection paragraph in `docs/decisions/GDR-KI-FUNDAMENTALS-001-knowledge-islands-ecosystem-fundamentals.md`. Added the executable plan and review evidence to this roadmap record.

### Verification

The tools-ki Decision Record is byte-identical to the approved Harness code-repository projection. Decision Record, roadmap, and authoring audits pass; Markdown formatting and `git diff --check` are clean.

### Outstanding concerns

None for the tools-ki receiver. The remaining repository copies retain their own acceptance and reconciliation authority.

### Post-change review

The change is confined to the approved projection and its local lifecycle evidence. It adds no local-only field, changes no portable contract, and makes no estate-wide completion claim.

### Mini recap

CLI-071 is delivered and verified at `awaiting-review`; tools-ki now matches the approved shared Decision Record projection.

## Discussion

Origin: `KI-HARNESS-GOV-063`. This receiver work neither blocks nor is blocked by the Harness implementation. Completion should record the accepted tools-ki revision for the later six-repository observation in `KI-HARNESS-GOV-069`.
