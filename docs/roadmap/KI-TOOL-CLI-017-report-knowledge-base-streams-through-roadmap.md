---
id: KI-TOOL-CLI-017
title: Report Knowledge Base streams
theme: cli
horizon: next
status: done
blocks: []
blocked-by: []
baseline-ref: 3c5b1e930cc7126c3130a1b8ff555d2c1970401d
---

## Goal

Make `ki repo roadmap` report the native Streams and Focus structure of a KI Knowledge Base instead of diagnosing its intentional lack of `docs/roadmap/`.

## Context

`ki repo roadmap list` currently reads non-KB repository work-item files exclusively from `docs/roadmap/`.

A Knowledge Base such as `ki-techne-principal` keeps governed work in native Streams and proposal Checklists, so the current output incorrectly reports that its roadmap directory is missing.

The command should identify a declared KI Knowledge Base and render its native planning structure under the same read-only roadmap command surface.

## Boundary

This item does not replace the Knowledge Base Streams lifecycle, invent flat Markdown work items for a Knowledge Base, mutate Focus or proposal Checklists, or alter the non-KB `docs/roadmap/` contract.

## Current state

`src/commands/repo/roadmap.ts` routes every selected repository through the flat work-item reader, while repository resolution establishes only a physical root and configuration path. Consequently a declared Knowledge Base without `docs/roadmap/` produces a missing-directory diagnostic. Existing roadmap contract tests cover only the flat work-item adapter.

## Steps

- [x] Parse the selected repository's declared type at the repository boundary, preserving the current physical-root and configuration safety checks.
- [x] Add a read-only Knowledge Base planning-source adapter that reads its Focus and Streams material without requiring, creating, or changing `docs/roadmap/`.
- [x] Render the adapter's source, Focus horizons, and proposal identities through the existing `ki repo roadmap list` framing while retaining its trade context and existing flat-repository ordering.
- [x] Cover a declared Knowledge Base fixture, the existing flat adapter, malformed or unavailable planning sources, and the command's no-write behaviour through `run(args, context)`.

## Files touched

- `src/core/planning.ts`.
- `src/commands/repo/roadmap.ts`.
- `src/tests/cli/repo/roadmap.test.ts`.

## Verify

- `bunx vitest run src/tests/cli/repo/roadmap.test.ts`.
- `bun run test:coverage` and `bunx tsc --noEmit`.
- `ki repo roadmap list` renders a declared Knowledge Base's Streams without requiring `docs/roadmap/`, while an equivalent non-KB fixture retains the current output and read-only behaviour.

## Dependencies / blocks

This work depends only on the declared `repo_type = "kb"` discriminator already used by the portable roadmap standard. It does not consume the separate Agora store-role contract and has no active local roadmap dependency.

## Review

The implementation selects the planning adapter from the declared `ki-decision-records` `repo_type`: non-KB repositories retain the existing `docs/roadmap/` reader, while `repo_type = "kb"` reads physical Streams, Focus, and proposal material through `src/core/planning.ts`.

The command remains read-only. CLI-contract fixtures prove populated and empty Knowledge Base Streams, malformed or missing native planning material, no creation of `docs/roadmap/`, and the unchanged flat-roadmap behaviour and trade framing.

Verification passed: `bunx vitest run src/tests/cli/repo/roadmap.test.ts`, `bunx tsc --noEmit`, and `bun run test:coverage` (491 tests; 100% statements, branches, functions, and lines).

Proposed harness learning: express architecturally significant boundaries as observable CLI contracts. Treat a coverage miss as either a valid end-to-end input to add or dead code to remove; do not retain untestable internal paths merely to preserve an implementation shape.

## Done

Accepted by the user on 2026-08-06. The focused roadmap contract suite and TypeScript gate were rechecked at closure; no unresolved concern remains.

## Discussion

### Repository type determines the planning source

`ki repo roadmap` should select its planning source from the repository's declared type: canonical work items for a non-KB repository, and Streams/Focus material for a Knowledge Base.

The rendered result should make that source explicit, preserve the selected-repository framing and diagnostics, and remain read-only.

### Native lifecycle authority remains intact

Knowledge Base streams, proposals, and Checklists remain authoritative for their own state and transitions.

This work is an inventory and rendering integration only; any lifecycle operation belongs to the appropriate Knowledge Base skill and requires separately defined authority.

### Adapter boundary

The Knowledge Base adapter must expose the native planning source explicitly rather than flattening Streams into fabricated work items. Its output is an inspection view: it may diagnose missing or malformed native material, but it must not infer lifecycle state, rewrite a Focus, or introduce a parallel repository roadmap.
