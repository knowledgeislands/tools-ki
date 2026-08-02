---
id: KI-TOOL-CLI-013
title: Define guarded conform execution and explicit override
theme: cli
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Let `ki repo conform` apply independently safe repairs automatically while giving an operator a narrowly controlled way to request guarded conform actions.

## Context

KI-TOOL-CLI-011 established failure-scoped publication for independently eligible direct writes, but deliberately withholds command-backed and other side-effecting conform groups during partial failures.

The operator-facing model needs explicit classes: safe conformances publish once their own evidence and transaction checks pass; guarded conformances may execute only with additional evidence and explicit authority. The report must make that distinction clear without implying that a command or external side effect is safe merely because an unrelated repair succeeded.

## Boundary

No override may bypass containment, declared filesystem scope, dependency evidence, conflict detection, atomic direct-write publication, command failure handling, or failed re-audit. This item does not introduce a broad force-anything switch or weaken the existing guarded transaction contract.

## Discussion

### Publication classes

Define the observable eligibility, withholding, refusal, and completion semantics for safe and guarded conform groups. Safe direct writes remain independently publishable; guarded groups need their own explicit preconditions and outcome evidence.

### Explicit operator authority

Decide the narrowest explicit override surface for guarded actions, including dry-run reporting and the distinction between permission to attempt an action and a claim that it completed cleanly.

### Promotion condition

Promote when the guarded-action contract, including operator authority, post-action verification, failure reporting, and a representative command or external-side-effect fixture, can be stated without an ambiguous force model.
