---
id: KI-TOOL-CLI-016
title: Add native roadmap lifecycle subcommands
theme: cli
horizon: next
status: in-progress
blocks: [KI-TOOL-CLI-014]
blocked-by: []
baseline-ref: b7f8539566c83efbfe4ad89d0b805fb0a16d6121
---

## Goal

Add the small, deterministic subset of `ki repo roadmap` lifecycle operations that operates only on canonical work-item files: listing, pruning completed records, and moving an item between horizons.

## Context

`ki repo roadmap list` already provides the read-only inventory for selected repositories. Its framed output groups canonical work items in the same immediate-to-distant horizon order used by the roadmap standard.

The remaining mechanical record operations are equally local and deterministic. `prune` can remove only terminal `done` files, while `promote` and `demote` can change only an explicitly named item's `horizon` field. They do not decide scope, readiness, implementation, acceptance, or completion; those remain process-skill and human-authority operations.

## Boundary

Implement exactly these public commands:

- `ki repo roadmap list [--horizon <horizon>] [--status <status>]`
- `ki repo roadmap prune`
- `ki repo roadmap promote <id> [horizon]`
- `ki repo roadmap demote <id> [horizon]`

`prune` removes every selected repository's canonical item whose status is exactly `done`; it leaves every other status and every non-canonical file untouched. Without `[horizon]`, `promote` moves one step toward `blocking` and `demote` moves one step toward `future`. With `[horizon]`, each command moves directly to the named horizon only in its respective direction. An item already at that directional endpoint is an error, as is a target that reverses or makes no movement.

Do not add commands for creating, shaping, marking ready, starting implementation, accepting work, or marking work done. Do not infer a status from a trade, alter anything outside `docs/roadmap/`, retain legacy command grammar, or implement shell-completion work from CLI-014.

## Current state

`src/commands/repo/roadmap.ts` exposes only the `list` subcommand. `src/core/work-items.ts` validates and reads canonical work-item frontmatter, including the six ordered horizons and lifecycle status. Contract coverage is in `src/tests/cli/repo/roadmap.test.ts`, with repository-target behavior in `src/tests/cli/repo/targets.test.ts`.

The process skills retain authority for lifecycle judgment: `ki-plan` creates, shapes, and readies items; `ki-implement` controls active delivery; and `ki-accept` requires evidence and human approval for completion. This command surface handles only deterministic file mechanics after those judgments have already occurred.

## Steps

- [x] Define one typed horizon-order helper shared by listing, `promote`, and `demote`, with explicit predecessor/successor behavior and direct-target direction validation.
- [x] Extend the `ki repo roadmap` grammar with `prune`, `promote <id> [horizon]`, and `demote <id> [horizon]`, retaining `list` and the repository target-selection contract.
- [x] Resolve each mutation target to exactly one canonical regular file inside the selected repository's physical `docs/roadmap/` directory; reject a missing, ambiguous, malformed, or out-of-scope identifier before any write.
- [x] Implement `prune` as a deterministic selected-repository sweep that deletes only validated records with `status: done`, reports each deletion and a summary, and succeeds with an explicit empty result when there is nothing to prune.
- [x] Implement `promote` and `demote` as frontmatter-only horizon updates. Without a target horizon they move exactly one canonical level; with a target they move directly only in the requested direction. Preserve all other frontmatter and Markdown body bytes.
- [x] Establish the native-operation authority boundary in the CLI documentation: these commands perform only record mechanics and do not replace `ki-plan`, `ki-implement`, or `ki-accept` judgment and evidence gates.
- [x] Cover the public contract through `run(args, context)`: every horizon transition, directional endpoint, invalid direct target, missing identifier, selected repository behavior, prune eligibility, no-op prune, failure atomicity, and unchanged non-roadmap content.
- [x] Update README, the man page, and compatible Harness process documentation to describe the new narrow host authority without retaining a conflicting process-only prune rule. CLI-014 owns completion generation from the final grammar.

## Files touched

- `src/commands/repo/roadmap.ts`
- `src/core/work-items.ts`
- `src/tests/cli/repo/roadmap.test.ts`
- `src/tests/cli/repo/targets.test.ts`
- `src/core/configuration.ts`
- `src/core/agora.ts`
- `src/tests/cli/agora/agora.test.ts`
- `src/tests/cli/trade/trade.test.ts`
- `README.md`
- `man/ki.1`
- `docs/roadmap/KI-TOOL-CLI-016-assess-native-roadmap-lifecycle-subcommands.md`
- Compatible Harness lifecycle-process documentation, limited to reconciling this delegated deterministic host authority

## Verify

- `bunx vitest run src/tests/cli/repo/roadmap.test.ts src/tests/cli/repo/targets.test.ts`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check src README.md`
- Documentation and man-page checks
- `ki repo audit --skill ki-roadmap --repo .`
- `ki repo roadmap list` stays read-only and retains its current framed inventory and trade context.
- `ki repo roadmap prune` removes only `done` records and reports an empty prune without mutation when none exist.
- `promote` and `demote` move exactly one horizon when omitted, accept only a directionally valid direct horizon, and leave all non-horizon content unchanged.
- Invalid input and a failure while resolving any selected target leave every candidate file unchanged.

## Dependencies / blocks

CLI-015 is complete and established the command/test module boundaries used here. This item must complete before CLI-014 so completion generation can target the final roadmap grammar.

The lifecycle-process documentation must explicitly delegate these three deterministic host operations before release; it remains authoritative for every judgmental lifecycle operation.

## Discussion

### Mechanical movement is not lifecycle judgment

`promote` and `demote` change priority placement, not lifecycle status. They cannot move an item to ready, in progress, acceptance, or done, and they cannot choose an item's content or dependency model. Direct horizon moves are useful because reprioritisation often crosses more than one planning interval, but they must remain directionally constrained so the verb states what happened truthfully.

### Pruning is limited to terminal records

The command is intentionally broad within its selected repository: it removes every canonical `done` item because there is no subjective selection left once the terminal state has already been authorised. It must not delete acceptance, in-progress, ready, or open records; loose Markdown files, nested paths, and malformed records are outside its write set.

### Lifecycle authority remains legible

The CLI owns deterministic local file mechanics. The process skills own the evidence, confirmation, and judgment that establish the lifecycle states on which those mechanics operate. Documentation must make that division clear and remove any contradictory statement that prune is exclusively process-skill owned.

### Candidate evaluation

`roadmap list` remains the only read-only status view: its horizon and lifecycle filters already answer the candidate/status use case. A separate status or check command would duplicate that inventory and the existing roadmap audit.

Creation, shaping, readiness, implementation, acceptance, and completion were rejected as native commands because each requires scope, evidence, or human judgment. `prune`, `promote`, and `demote` are the complete mechanical subset because their targets and permitted writes are deterministic from canonical records.

Moving to or from `future` necessarily adds or removes the canonical `candidate: true` marker; all other frontmatter and the Markdown body remain byte-preserved.

### Readiness decision

This item is ready to enter `ready` when the exact four-command grammar and the process-boundary reconciliation above are approved. CLI-014 remains blocked until this grammar is delivered.
