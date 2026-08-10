---
id: KI-TOOL-BATCH-001
repository: https://github.com/knowledgeislands/tools-ki
approved: true
approved_at: 2026-08-10T08:22:50Z
timebox_ends_at: 2026-08-10T12:22:50Z
item_ids: [KI-TOOL-CLI-040, KI-TOOL-CLI-037, KI-TOOL-CLI-041, KI-TOOL-CLI-042, KI-TOOL-CLI-036]
completion_target: awaiting-review
mandatory_stops: [public-contract-change, material-scope-expansion, destructive-or-irreversible-work, external-dependency-or-coordination, verification-failure, push-or-release, unapproved-decision]
---

# KI-TOOL-BATCH-001 — Deliver CLI review follow-ups

## Purpose

Deliver the five named ready CLI review and resilience items in one bounded batch, stopping each record at awaiting review with its own evidence packet.

## Named plans and order

1. `KI-TOOL-CLI-040` — isolate trade configuration; independent of the remaining plans.
2. `KI-TOOL-CLI-037` — track install staging artifacts; independent of the remaining plans.
3. `KI-TOOL-CLI-041` — separate repository progress; integrates before the other `src/commands/repo/index.ts` extraction.
4. `KI-TOOL-CLI-042` — extract repository initialization; follows CLI-041 to avoid concurrent edits to its shared command index.
5. `KI-TOOL-CLI-036` — compose KB store roles; follows the repository command extractions to avoid concurrent edits to its shared command index.

## Scope

- Repository: `knowledgeislands/tools-ki` only.
- Files: each named plan, its stated implementation files, focused CLI contract tests, this authorisation, and its run ledger.
- Excluded: pushes, releases, closure, pruning, cross-repository writes, new dependencies, and unrelated refactors.

## Timebox and completion target

- Timebox: 10 August 2026, 08:22–12:22 UTC.
- Completion target: each named record reaches `awaiting-review` with its own review packet, or is parked with evidence and the exact decision required.

## Required verification

- Each plan's stated CLI contract coverage and checks.
- `bunx tsc --noEmit`, `bun run test:coverage`, and Biome checks over changed files.
- Per-item review of public CLI output and error contracts before its awaiting-review transition.

## Allowed decisions and delegation

- Delegation: permitted only for the bounded mechanical units named in each plan; the orchestrator owns integration and final verification.
- Decisions: apply the locked plan decisions only. Escalate new public-interface, safety, dependency, or scope decisions.
- Learning: retain a concise batch recap and propose reusable learning to the relevant skills after delivery; do not write another repository without separately scoped approval.
- Closure: not authorised. Every delivered item stops at `awaiting-review`.

## Mandatory stops

- Any public-contract change outside a named plan.
- Material scope expansion, destructive or irreversible work, or new external dependency or coordination need.
- Required-verification failure, push, release, or unapproved decision.

## Approval

Approved by: Kris Brown, 10 August 2026, in this conversation.
