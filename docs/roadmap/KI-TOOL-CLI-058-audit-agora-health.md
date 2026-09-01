---
id: KI-TOOL-CLI-058
area: CLI
title: Audit Agora health
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: cac651ed3fb5e01c1261090735d70347da6e51af
---

# Audit Agora health

## Goal

Provide an explicit read-only Agora health command with reliable exit status and actionable diagnostics across the locally registered Agora estate.

## Context

`ki agora list` presents healthy profiles alongside declaration failures but is an inventory view rather than a verification gate. The canonical resolver already detects unavailable registrations, malformed declarations, duplicate owners, missing members, and non-reciprocal consent.

## Boundary

The command must not register repositories, repair declarations, infer membership, edit peer repositories, inspect editor state, or add a second interpretation of Agora membership. The first delivery does not add JSON: stable exit status and deterministic diagnostics satisfy automation, while `ki agora roots` remains the pathname-safe machine interface.

## Current state

The command layer lacks a focused audit contract over the resolver's existing health findings. `ki agora audit [agora]` will audit every declared profile when no name is supplied and one named profile when selected. Exit status will be `0` when every selection is healthy, `1` when health findings exist, and `2` for invalid grammar or an unknown explicit selector.

## Steps

- [x] Add an Agora health model that preserves canonical resolver diagnostics without duplicating declaration interpretation.
- [x] Add `ki agora audit [agora]` and register it in command help and completion grammar.
- [x] Render deterministic profile and diagnostic totals with established Agora presentation and exit semantics.
- [x] Specify the command contract and document concise human and automation examples.
- [x] Add CLI contract tests for healthy, mixed, unavailable, duplicate, non-reciprocal, unknown, and explicitly selected profiles.

## Files touched

- `src/core/agora/`
- `src/commands/agora/`
- `src/tests/cli/agora/`
- `docs/specs/agoras.md`
- `README.md`

## Verify

- Focused Agora CLI tests cover report ordering, diagnostics, selection, and exit status.
- Completion and root help tests expose the new command without changing existing surfaces.
- `bun run test:coverage`, `bun run build`, and the complete repository audit pass.

## Dependencies / blocks

No local work-item dependency. This item is independent of `KI-TOOL-CLI-059`: it verifies declared Agora state, while that item compares a verified declaration with an editor projection.

## Documentation impact

### Decision Records

No Decision Record is expected. The work extends the accepted Agora resolver and command architecture without introducing a new architectural choice.

### Specifications

Add the normative behavior and exit semantics to `docs/specs/agoras.md`.

### Guides

Add concise human and automation examples to the README. Update the developer guide only if implementation changes the existing Agora resolver boundary.

### Roadmap

Check each delivery step and attach the final verification evidence before moving the record to awaiting review.

## Review

### Delivered

Delivered the approved read-only Agora health contract without repository or registry mutation. Baseline `cac651ed3fb5e01c1261090735d70347da6e51af` became implementation commit `1d7591afe367796b669b6f426dcf83486749f7e5`; editor projection inspection and JSON output remained outside this item.

### Summary of changes

Added the canonical resolver-backed health model, `ki agora audit [agora]`, deterministic human diagnostics and totals, exit semantics, help and completion discovery, specification and README/manual documentation, and CLI-driven health fixtures.

### Verification

The focused Agora, help, and completion suites passed 25 tests. The integrated `bun run test:coverage` gate passed all 702 tests at 100% statements, branches, functions, and lines; build, TypeScript, Biome, Knip, man-page lint, and the complete 18-skill repository audit also passed.

### Outstanding concerns

None. The command reuses canonical Agora resolution and introduces no second membership interpretation.

### Post-change review

The implementation matches the planned grammar, deterministic reporting, and exit-status boundary. Healthy and broken selections remain read-only, profile selection isolates unrelated estate failures where possible, and the result is ready for acceptance.

### Mini recap

Agora declarations now have a focused local verification command suitable for people and exit-status automation. No learning requires promotion beyond the specification and user documentation delivered with the command.

## Done

Accepted on 2026-09-01 under the exact closure authority in `KI-TOOL-BATCH-003` after rechecking the canonical review packet and current repository evidence. The record is retained; no pruning is authorized.

## Discussion

The command emits one terminal format. It reports every selected profile and diagnostic through the human-facing presentation layer while using exit status as its stable automation contract. No durable delegation packet is needed because the core model, command adapter, specification, and contract tests form one bounded implementation lane.
