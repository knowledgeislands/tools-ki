---
id: KI-TOOL-CLI-089
area: CLI
title: Support role-free Agoras
theme: cli
horizon: now
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-27T19:09:14Z
updated_at: 2026-09-30T07:41:27Z
---

# KI-TOOL-CLI-089: Support role-free Agoras

## Goal

Make `ki` resolve, audit, and project reciprocal Agora membership without role labels if the portable contract drops them.

## Context

This tooling follow-up originated in a 2026-09-27 user discussion in `ki-arcadia-principal`. The user selected it for Now on 2026-09-30. The current Agora resolver validates a role in each home member entry and member declaration, then requires matching values. `KI-HARNESS-GOV-119` in `ki-agentic-harness` still owns the contract decision and remains Triage/draft; the published Agora standard still requires roles.

## Boundary

Preserve owner approval, independent member consent, canonical identity checks, and existing projection behaviour. Do not change the CLI before the harness contract and migration approach are agreed. Repository declaration migration belongs to the affected repositories, not to this tooling item.

## Current state

`src/core/agora/resolution.ts` requires a role in home and member declarations and compares them for reciprocity. `docs/specs/agoras.md` and the README state that contract. The harness item has not yet settled the replacement declaration shape or treatment of existing role-bearing declarations, so this selected item remains Draft while that dependency is resolved.

## Steps

- [ ] Confirm the accepted `KI-HARNESS-GOV-119` contract and migration rule, then reconcile this plan with its exact declaration shape.
- [ ] Update Agora declaration parsing and reciprocal resolution to the approved role-free model while preserving owner, identity, consent, ordering, and reference behavior.
- [ ] Reconcile public diagnostics and projections with the approved contract, including existing role-bearing declarations under the agreed migration rule.
- [ ] Update the Agora specification, user guidance, and CLI contract tests for valid, absent, malformed, and mismatched declarations.
- [ ] Run focused Agora CLI tests, type and formatting checks, full coverage, and relevant repository audits.

## Files touched

Expected scope: `src/core/agora/resolution.ts`, affected `src/commands/agora/` renderers, `src/tests/cli/agora/`, `docs/specs/agoras.md`, and README or manual passages that describe the public contract. Refine the exact list after the harness decision; repository declarations in other checkouts are outside this item.

## Verify

Confirm the accepted harness contract and migration rule first. Then exercise the role-free and legacy-declaration cases through `run(args, context)` and `sandbox()`, run the focused Agora CLI suite, `bunx tsc --noEmit`, Biome, `bun run test:coverage`, and focused `ki repo` audits.

## Dependencies / blocks

The external harness record `KI-HARNESS-GOV-119` must decide the portable shape and migration approach before this item can be Ready for implementation. It is not a local `blocked_by` identifier. No repository declaration migration is authorised by this tools-ki plan.

## Documentation impact

### Decision Records

The portable contract decision belongs to the harness item. Add a tools-ki Decision Record only if implementation exposes a separate durable local choice.

### Specifications

Update `docs/specs/agoras.md` for the approved declaration, reciprocity, diagnostics, and compatibility behavior.

### Guides

Update the README and manual where they describe member roles or the user-facing migration path. Cross-repository declaration migration guidance belongs to the harness contract and affected repositories.

### Roadmap

Keep this item Draft in Now until the external contract and migration rule are settled, then review the plan and readiness before implementation.

## Discussion

### Migration and verification

Once the harness contract is settled, update parsing, resolution, diagnostics, public CLI output, and tests consistently. Check whether a transition period is needed for existing role-bearing declarations; do not silently treat mismatched old declarations as reciprocal.
