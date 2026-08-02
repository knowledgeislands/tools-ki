---
id: KI-TOOL-CLI-013
title: Define guarded conform execution and explicit override
theme: cli
horizon: next
status: in-progress
blocks: []
blocked-by: []
baseline-ref: a0832e6bfcf41bc5ef6752c127a2559e04eb8a7b
---

## Goal

Let `ki repo conform` apply independently safe repairs automatically while giving an operator a narrowly controlled way to request guarded conform actions.

## Context

KI-TOOL-CLI-011 established failure-scoped publication for independently eligible direct writes, but deliberately withholds command-backed and other side-effecting conform groups during partial failures.

The operator-facing model needs explicit classes: safe conformances publish once their own evidence and transaction checks pass; guarded conformances may execute only with additional evidence and explicit authority. The report must make that distinction clear without implying that a command or external side effect is safe merely because an unrelated repair succeeded.

## Boundary

No override may bypass containment, declared filesystem scope, dependency evidence, conflict detection, atomic direct-write publication, command failure handling, or failed re-audit. This item does not introduce a broad force-anything switch or weaken the existing guarded transaction contract.

## Current state

Independent direct-write groups already publish despite unrelated failures. Eligible command-backed groups remain withheld whenever the selected initial audit contains a failure, although a wholly clean conform run executes and re-audits commands.

## Steps

- [ ] Add a `--allow-guarded` conform option and explain, in help and reports, that it authorizes an attempt rather than bypassing safety checks.
- [ ] Preserve default withholding for command-backed groups during partial failures; with the option, execute only groups whose own evidence, scope, dependencies, and write preparation pass.
- [ ] Keep dry-run side-effect-free, report guarded attempts distinctly, and re-audit after a successful guarded publication while retaining non-zero status for unresolved findings.
- [ ] Add CLI contract coverage for default withholding, opted-in dry-run, successful guarded execution and re-audit, and failed guarded commands.

## Files touched

- `src/core/repository-operations.ts` and `src/core/conform-publication.ts`.
- `src/tests/cli/repo-conform-writes.test.ts` and related conform fixtures.

## Verify

- `bunx vitest run src/tests/cli/repo-conform-writes.test.ts src/tests/cli/repo-conform-execution.test.ts`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bun src/main.ts repo audit --repo .`

## Dependencies / blocks

No external prerequisite. The option cannot override containment, declared scope, dependency evidence, conflict detection, guarded publication, command failures, or re-audit failures.

## Discussion

### Publication classes

Define the observable eligibility, withholding, refusal, and completion semantics for safe and guarded conform groups. Safe direct writes remain independently publishable; guarded groups need their own explicit preconditions and outcome evidence.

### Explicit operator authority

Decide the narrowest explicit override surface for guarded actions, including dry-run reporting and the distinction between permission to attempt an action and a claim that it completed cleanly.

### Promotion condition

Promote when the guarded-action contract, including operator authority, post-action verification, failure reporting, and a representative command or external-side-effect fixture, can be stated without an ambiguous force model.
