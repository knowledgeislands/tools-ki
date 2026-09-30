---
id: KI-TOOL-CLI-089
area: CLI
title: Support role-free Agoras
theme: cli
horizon: triage
status: done
intake_disposition: rejected
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-27T19:09:14Z
updated_at: 2026-09-30T11:55:05Z
---

# KI-TOOL-CLI-089: Support role-free Agoras

## Goal

Make `ki` resolve, audit, and project reciprocal Agora membership without role labels if the portable contract drops them.

## Context

This tooling follow-up originated in a 2026-09-27 user discussion in `ki-arcadia-principal` and was selected for Now on 2026-09-30. The published Agora standard requires roles on both sides of reciprocal membership. Kris subsequently chose to keep those roles and withdraw this proposed CLI change before implementation.

## Boundary

No Agora CLI behavior, portable declaration, or repository membership changes are authorised by this rejected proposal.

## Intake disposition

Outcome: Rejected.

Rationale: Kris is keeping Agora roles; role-free CLI support is no longer wanted. No retained implementation target applies.

Approval: Kris Brown requested removal of CLI-089 and confirmed that Agora roles will remain on 2026-09-30.

## Done

Disposed 2026-09-30 by Kris Brown as rejected on the intake evidence above.

## Discussion

### Retained contract

Role-bearing reciprocal membership remains the intended behavior. The separate Harness proposal `KI-HARNESS-GOV-119` is not changed by this tools-ki disposition.
