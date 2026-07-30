---
id: KI-TOOL-CLI-016
title: Restore schema-one workspaces
theme: cli
horizon: blocking
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Restore `.ki-workspace.toml` to its sole current contract: `schema = 1` with named groups of ordered repository paths or patterns. The manual already documents this format, and the existing `/Users/krisbrown/workspaces/kit/knowledgeislands/.ki-workspace.toml` uses it. The implementation was changed to an incompatible schema-2 typed-member format, so ordinary `ki repo` operations in that workspace now fail before selection.

## Boundary

This item supports only schema 1. It does not retain a schema-2 parser, migration path, compatibility fallback, typed members, or workspace-member recursion. It does not change repository selection outside the direct-CWD workspace boundary, mGit selection, or repository registration.

## Current state

`src/core/workspace.ts` currently requires `schema = 2` and `{ type, path }` members. Its recursive registration and resolution model represents nested workspaces directly. Meanwhile the public manual describes schema 1 groups with ordered repository path-or-pattern members. A schema-1 workspace therefore fails with `schema must equal 2` before `ki repo audit` can select its default group.

## Steps

1. Replace the workspace model, parser, renderer, and initializer with schema 1 and `[groups.<name>].repositories = [<relative path-or-pattern>, ...]`; reject every other schema and remove schema-2 types and branches.
2. Preserve the workspace command lifecycle (`init`, `list`, `show`, `add`, `remove`) using flat ordered repository entries and direct-CWD group selection.
3. Retain physical, symlink-safe recursive registration, but flatten discovered repository leaves into every container's default group as relative repository paths; write a schema-1 workspace file at each physical container and do not create workspace references.
4. Update workspace resolution to expand only the selected flat repository paths or patterns. Remove nested-workspace origin reporting, cycle handling, and typed-member diagnostics that no longer apply.
5. Replace schema-2 CLI contracts with schema-1 coverage, including the existing schema-1 Knowledge Islands workspace, flat registration, patterns, malformed groups, symlink refusal, and rejection of schema 2.
6. Align README, developer documentation, manual, command inventory, and changelog with schema 1, then validate the roff manual.

## Files touched

- `src/core/workspace.ts`
- `src/core/repository.ts`
- `src/commands/workspace.ts`
- `src/tests/cli/workspace.test.ts`
- `src/tests/cli/repo-targets.test.ts`
- `src/tests/cli/plan.test.ts`
- `README.md`
- `docs/developer/local-development.md`
- `man/ki.1`
- `CHANGELOG.md`

## Verify

- Targeted workspace, repository-target, and plan CLI contracts.
- `bun run test --coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bun run ki:tools:lint-man`
- `ki repo audit --skill ki-roadmap --repo .`
- `ki repo audit` from `/Users/krisbrown/workspaces/kit/knowledgeislands` after the workspace configuration is again recognised.

## Dependencies / blocks

This is a Blocking workspace-format correction with no work-item dependency. It restores the documented and existing workspace format before workspace-based repository operations can be relied upon.

## Delegation

One fresh serial implementation worker (`gpt-5.6-sol`, high reasoning) owns the schema contraction, repository-target integration, CLI contracts, and documentation. Locked: schema 1 is the only accepted and emitted workspace version; groups contain only ordered repository paths or patterns; registration flattens repository leaves and never follows symbolic links. Escalate any requirement that would preserve typed workspace members, recursion, or schema 2. Done means the existing schema-1 workspace supports `ki repo audit`, targeted contracts pass, then the full suite, typecheck, style check, roff lint, and roadmap audit pass. The worker stops before commit for review.

## Discussion

### One current format

Schema 1 is the latest and only workspace representation. Carrying a reader, migration, or compatibility path for schema 2 would make the format ambiguous and preserve an accidental historical contract.

### Flat registration

Subdirectories may still receive their own workspace files for direct local lookup, but a parent group records repository leaves directly. That preserves deterministic top-level repository selection without encoding a workspace-as-member relationship or recursive resolution semantics.

### Immediate regression evidence

The parent Knowledge Islands workspace has an empty schema-1 default group and should remain valid without modification. Its current failure is the acceptance check for this correction: repository commands must once again read it before falling back to other selection mechanisms.
