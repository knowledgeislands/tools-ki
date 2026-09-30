---
id: KI-TOOL-CLI-090
area: CLI
title: Summarize roadmap inventory
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 8422c3862ae20a3713bac0a366eb4cf1cdd8f080
created_at: 2026-09-30T07:30:33Z
updated_at: 2026-09-30T12:02:38Z
---

# KI-TOOL-CLI-090: Summarize roadmap inventory

## Goal

A reader can see whether each selected repository has roadmap work, and how that work is distributed, without scanning item details.

## Context

The user requested a quick `ki repo roadmap summary` view on 2026-09-30. `list` already reports item details and a final total; `stats` reports age and inactivity. Neither provides the requested compact breakdown. The user approved immediate implementation and asked for this tracking record.

## Boundary

Report item totals and nonzero counts by horizon and lifecycle status. Preserve the distinction between an absent roadmap and a present empty roadmap, and keep malformed evidence diagnostic. Do not list valid item identifiers or titles, include trade records, mutate roadmap files, or add a JSON contract.

## Current state

At baseline `8422c3862ae20a3713bac0a366eb4cf1cdd8f080`, the CLI provides `list` and `stats` but no count-only roadmap command. The CLI issuing ledger has reserved this item's identifier in its own earlier commit.

## Steps

- [x] Add a `summary` command that reports per-repository item, horizon, and lifecycle counts without valid item details.
- [x] Preserve absent, empty, malformed, and misconfigured roadmap behavior while keeping trade inventory outside the summary.
- [x] Cover the public CLI behavior, update the specification, README, manual, changelog, and generated command inventory.
- [x] Verify the focused tests, type check, Biome check, and full coverage gate.

## Files touched

`src/commands/repo/roadmap.ts`, `src/core/work/operations.ts`, `src/tests/cli/repo/roadmap.test.ts`, `README.md`, `docs/specs/repository-operations.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, and this record. The identifier reservation is the preceding ledger-only commit.

## Verify

Run `bunx vitest run src/tests/cli/repo/roadmap.test.ts`, `bunx tsc --noEmit`, `bunx biome check` on the changed TypeScript files, and `bun run test:coverage`. Check the generated command inventory and audit the roadmap record.

## Dependencies / blocks

None. This command uses the existing selected-repository work-item reader.

## Documentation impact

### Decision Records

No new decision record: the name and compact output boundary are local CLI choices approved in this discussion.

### Specifications

Add the compact summary behavior as `REPO-OPS-024`.

### Guides

No separate guide is needed; the README and manual describe the command.

### Roadmap

This item retains delivery and review evidence. No follow-on work is currently identified.

## Review

### Delivered

Implemented the approved count-only command from immutable baseline `8422c3862ae20a3713bac0a366eb4cf1cdd8f080`. The resulting feature and review packet are in the delivery commit containing this record. No repository outside tools-ki was changed.

### Change Summary

The command renders one compact result per selected repository, including nonzero horizon and lifecycle counts. It skips trade inventory, distinguishes absent and empty roadmaps, and reports valid-item counts alongside malformed-record diagnostics. The CLI test, specification, README, manual, changelog, and generated inventory document the public surface.

### Verification

The focused roadmap suite passed 32 tests. `bunx tsc --noEmit` and focused `bunx biome check` passed. The full `bun run test:coverage -- --reporter=dot` gate passed 936 tests with 100% statement, branch, function, and line coverage. The command-inventory test and generated-inventory check passed. `ki repo audit --skill ki-work-roadmap` and `ki repo audit --skill ki-authoring` passed with this record present.

### Outstanding concerns

Independent review and acceptance of this delivery remain pending. No known implementation failure remains.

### Post-change review

The result answers whether a repository has roadmap items without exposing their details. Counts remain tied to valid records; malformed evidence is visible and produces a failing exit status. This is ready for review, not yet accepted as Done.

### Mini recap

The summary command, contract, user documentation, manual inventory, and public CLI tests are complete. Review this item against the delivery commit, then decide acceptance through the roadmap workflow.

## Done

Accepted 2026-09-30 by Kris Brown on the review packet above.

## Discussion

### Command name

`summary` describes a count-only view. `status` could suggest a health judgment and already names the item lifecycle filter on `list`.

### Scope of counts

Only nonzero horizon and lifecycle groups appear for a populated roadmap. An empty present roadmap reports zero items; a missing directory reports no roadmap. Trade records do not contribute to the counts or determine the command's exit status.
