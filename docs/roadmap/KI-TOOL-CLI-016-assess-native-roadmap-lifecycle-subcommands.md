---
id: KI-TOOL-CLI-016
title: Assess native roadmap lifecycle subcommands
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Decide which read-only or explicitly authorised `ki repo roadmap` subcommands would usefully support the governed work-item lifecycle.

## Context

`ki repo roadmap list` now provides a deterministic, read-only view of selected repositories' work items and trade context.

The current repository workflow assigns creation and shaping to `ki-plan`, implementation transitions to `ki-implement`, and explicit acceptance and pruning to `ki-accept`.

There may be value in narrowly scoped native commands that prepare a placeholder work item, present lifecycle candidates, apply a user-confirmed status transition, or prune an explicitly named retained record. The assessment must first establish whether any native command adds durable operator value beyond the process skills, rather than duplicating their lifecycle authority.

## Boundary

This discovery item does not add lifecycle-mutating CLI commands, bypass human confirmation, infer roadmap authority from trade records, or replace the `ki-plan`, `ki-implement`, or `ki-accept` process responsibilities. It delivers a decision and, only if justified, a separately scoped implementation item; it does not quietly turn its own assessment into product work.

## Current state

The CLI exposes `ki repo roadmap list` as a read-only inventory in `src/commands/repo/roadmap.ts`, with black-box coverage in `src/tests/cli/repo/roadmap.test.ts` and target-selection coverage in `src/tests/cli/repo/targets.test.ts`.

The process skills already define creation and readiness (`ki-plan`), implementation (`ki-implement`), acceptance and pruning (`ki-accept`), and selection (`ki-next`). They retain confirmation and evidence authority. Native `ki` currently has no lifecycle-mutation grammar.

## Steps

- [ ] Build an authority matrix for every existing lifecycle operation: canonical record affected, required evidence, required human confirmation, process-skill owner, and whether any bounded native host capability already exists.
- [ ] Assess only four candidate classes: read-only candidate/status reporting; placeholder preparation; explicit lifecycle transition; and explicit retained-record prune. For each, state the operator problem, exact input, local write set, confirmation mechanism, re-audit requirement, and why a process skill is insufficient.
- [ ] Reject duplication explicitly. A candidate does not proceed merely because it is mechanically possible; it must preserve the process skill's authority boundary and reduce a concrete operator failure mode.
- [ ] Select one of three outcomes for each candidate: retain process-skill-only ownership, add read-only CLI guidance, or create a separately numbered implementation item with exact grammar and contract tests.
- [ ] Record the decision and any follow-on link in this item's Discussion. Do not add source, tests, README, or manual changes unless a new implementation item is explicitly selected.

## Files touched

- This roadmap item

Any selected implementation receives its own roadmap item and enumerates its product, test, README, and manual files there.

## Verify

- The completed authority matrix covers creation, shaping, readiness, implementation, acceptance, completion, and prune.
- Every candidate has an explicit decision, inputs, write set, evidence, confirmation, post-mutation audit, and process-skill relationship.
- `ki repo roadmap list` remains read-only and retains its inventory and trade-context behaviour.
- Any follow-on implementation item has a checkable command grammar, black-box CLI contract coverage, full verification gates, and an explicit human-acceptance boundary.
- The roadmap audit passes.

## Dependencies / blocks

This assessment is self-contained and depends on the existing process skills remaining lifecycle authority. It must not block CLI-014 completion work.

## Discussion

### Lifecycle operations need explicit authority

Any future `ki repo roadmap` subcommand must make its target, intended transition, required evidence, and confirmation boundary explicit.

The assessment should compare read-only recommendation commands with user-confirmed mutation commands for placeholder creation, readiness preparation, acceptance, completion, and explicit pruning.

### Candidate decision table

The assessment must make the following forks explicit rather than assuming every lifecycle verb belongs in `ki`.

| Candidate | Minimum proof to proceed | Likely default |
| --- | --- | --- |
| Candidate/status report | Adds information unavailable from `roadmap list` without inferring a decision | Read-only only |
| Placeholder preparation | Produces a canonical record without choosing its scope, horizon, or lifecycle | Process skill only unless a deterministic skeleton is demonstrated |
| Lifecycle transition | Exact item, expected current state, required evidence, and a separate confirmation input | Process skill only unless the host can preserve all gates |
| Retained-record prune | Exact file selection, explicit human approval, and evidence of terminal completion | Process skill only; no bulk deletion |

### Canonical records remain the source of truth

Future commands must preserve canonical Markdown work-item records, existing audits, and lifecycle ordering.

They must not introduce a parallel lifecycle store, perform autonomous transitions, or use trade direction or record status as evidence to alter roadmap state.

### Delivery and readiness decision

This is ready to enter `ready` as a bounded discovery task once the candidate table above is accepted. Its only implementation output is a documented decision and zero or more new, separately approved roadmap items.

### Promotion condition

Promote this item when a concrete operator workflow can name the required subcommand, its exact authority and confirmation boundary, the evidence it consumes, and its relationship to the existing process skills.
