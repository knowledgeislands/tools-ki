---
id: KI-TOOL-CLI-070
area: CLI
title: Automate Canonical Batch Records
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-14T22:08:09Z
updated_at: 2026-09-15T05:30:00Z
---

# Automate Canonical Batch Records

## Goal

Provide deterministic native `ki batch prepare`, `validate`, `run`, and `close` mechanics for the lean exact-set batch contract so agents do not reproduce storage, hashing, and transition mechanics by hand.

## Context

The September 2026 estate audit found 42 commits touching batch storage within one month. Repeated work includes scaffolding the same authority record, calculating its approved-payload digest, inserting the derived run marker, resolving it before execution, and updating its concise ledger. The compatible Harness now defines one pre-publication contract in place: exact Ready item IDs, explicit authority, expiry, `policy: safe-local-v1`, a derived run ID, and closure of all named items when `completion_target: done`.

Native support should remove mechanical ceremony without creating a second schema or shifting process decisions into this CLI.

## Boundary

The command must not infer approval or conversational authority, select or ready roadmap work, change the exact item set, decide whether work is contentious, replace canonical item plans or review evidence, accept work on the human's behalf, prune, push, or release. Structural and digest validity do not prove that the recorded authority is legitimate.

Already-completed records in the earlier shape may remain readable only for retention and integrity checks. New authoring must emit the current contract and must reject retired fields. There is no public v2 or parallel schema.

## Current state

Ready through the user's explicit approval of the lean batch workflow. The Harness contract and `GDR-KI-HARNESS-009` are the semantic source; this item owns only native command behaviour and CLI-driven acceptance coverage.

## Steps

- [ ] Add a focused `batch` command module behind the existing `run(args, context)` boundary.
- [ ] Implement `prepare` with explicit repository identity, authority mode and evidence, expiry, ordered item IDs, and completion target; derive identity allocation, `policy: safe-local-v1`, run ID, and payload hash.
- [ ] Implement read-only `validate` for canonical location, regular-file containment, exact supported fields, timestamps, identities, duplicate-free IDs, approval evidence, payload integrity, expiry, and run-marker binding.
- [ ] Implement `run` as a deterministic lifecycle operation that validates the envelope and appends the derived run marker or a concise caller-supplied ledger result; it must not execute agent work or infer outcomes.
- [ ] Implement `close` as a deterministic record operation requiring explicit caller-supplied completion evidence and a matching all-item target; keep `ki-accept` and the compatible Harness responsible for acceptance semantics.
- [ ] Share one internal parser and canonical payload projection across all four operations without exporting an unstable library API.
- [ ] Add CLI-driven sandbox tests for successful flows, stable hashes, altered payloads, retired and unsupported fields, missing outcome evidence, duplicate IDs, expiry, marker mismatch, non-canonical paths, and attempts to infer or upgrade authority.
- [ ] Document the native mechanics and their Harness ownership boundary in CLI help and the relevant guide.
- [ ] Run focused batch-command tests, the full suite, TypeScript, Biome, and repository audits.

## Files touched

- `src/commands/batch.ts`
- `src/core/batch-core.ts`
- `src/cli.ts`
- `src/tests/cli/batch.test.ts`
- CLI help and relevant guide or README surface

## Verify

- `bun test src/tests/cli/batch.test.ts`
- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check .`
- `ki repo audit --skill ki-engineering --repo .`
- `ki repo audit --skill ki-work-roadmap --repo .`
- `ki repo audit --skill ki-authoring --repo .`
- `git diff --check`

## Dependencies / blocks

No delivery block. Implement against the accepted in-place Harness contract; if it changes before implementation begins, stop and re-plan the exact affected parser and fixtures rather than adding version negotiation speculatively.

## Documentation impact

### Decision Records

No tools-ki Decision Record is expected unless implementation discovers a native CLI architecture decision not already covered by the Harness governance decision.

### Specifications

No portable Specification change. The compatible Harness owns batch semantics.

### Guides

Document command inputs, effects, and non-authority boundary where native CLI operations are introduced.

### Roadmap

This record owns the independently reviewable tools-ki implementation. Any broader orchestration or remote-agent execution remains separate work.

## Discussion

The four verbs deliberately separate proposal creation, read-only proof, run-account mutation, and close-account mutation. They make the common path scriptable while leaving selection, delivery, and acceptance with the process skills that have the necessary human context.
