---
id: KI-TOOL-CLI-016
title: Make the current workspace model schema one
theme: cli
horizon: blocking
status: ready
blocks: []
blocked-by: []
baseline-ref: 54715061a1e54e36828fec1537047677b3f28e0e
---

## Context

Keep the current, full workspace model—typed repository and nested-workspace members, recursive group resolution, and physical post-order registration—but make it the sole `.ki-workspace.toml` contract at `schema = 1`. The current implementation labels that model schema 2 while the manual and `/Users/krisbrown/workspaces/kit/knowledgeislands/.ki-workspace.toml` say schema 1, making ordinary `ki repo` operations fail before selection. Schema 1 must mean the latest and only model, not an older reduced format.

## Boundary

This item supports only the latest schema 1. It does not retain a schema-2 parser, compatibility fallback, or the historical flat `repositories` group format. It includes a controlled one-time rewrite of every currently discovered workspace configuration, not a persistent runtime migration path. It retains typed members, nested-workspace recursion, and registration. It does not change repository selection outside the direct-CWD workspace boundary or mGit selection.

## Current state

`src/core/workspace.ts` currently requires `schema = 2` and `{ type, path }` members. Its recursive registration and resolution model represents nested workspaces directly. The public manual instead calls the format schema 1 and describes an obsolete flat group shape. The existing parent workspace is also an obsolete flat schema-one document, so it fails with `schema must equal 2` before `ki repo audit` can select its default group.

## Steps

1. Rebase the existing workspace model, parser, renderer, and initializer from `schema = 2` to `schema = 1`; retain `{ type, path }` members and reject every other schema and all historical flat `repositories` groups.
2. Preserve the current workspace command lifecycle (`init`, `register`, `list`, `show`, `add`, `remove`), direct-CWD selection, named groups, typed members, and deterministic insertion ordering.
3. Preserve physical, symlink-safe recursive registration: each physical container receives a schema-one workspace file and its default group contains direct repository and nested-workspace members; non-default groups remain intact.
4. Preserve recursive nested-workspace resolution, repository origin reporting, cycle detection, containment, patterns for repository members, and duplicate-leaf refusal.
5. Inventory every regular `.ki-workspace.toml` currently under `/Users/krisbrown/workspaces/kit/knowledgeislands` and rewrite each historical flat document to the canonical schema-one typed-member form, preserving its named groups and ordered repository entries. Do this as a controlled data migration without adding a reader or runtime fallback for the old shape.
6. Replace schema-two CLI contracts with the latest schema-one coverage, including nested registration and resolution, patterns, malformed groups, symlink refusal, rejection of schema 2, and rejection of flat historical groups.
7. Align README, developer documentation, manual, command inventory, and changelog with the sole latest schema 1, then validate the roff manual.

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
- `/Users/krisbrown/workspaces/kit/knowledgeislands/.ki-workspace.toml`

## Verify

- Targeted workspace, repository-target, and plan CLI contracts.
- `bun run test --coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bun run ki:tools:lint-man`
- `ki repo audit --skill ki-roadmap --repo .`
- `ki repo audit` from `/Users/krisbrown/workspaces/kit/knowledgeislands` after its workspace configuration is deliberately replaced with the sole canonical schema-one form.

## Dependencies / blocks

This is a Blocking workspace-format correction with no work-item dependency. It restores a truthful single schema before workspace-based repository operations can be relied upon.

## Delegation

One fresh serial implementation worker (`gpt-5.6-sol`, high reasoning) owns the schema relabel, one-time configuration migration, repository-target integration, CLI contracts, and documentation. Locked: the existing full typed-member model is schema 1 and the only accepted and emitted version; registration and recursive workspace resolution remain; symlinks remain excluded. Escalate any requirement that adds a schema-2 reader, a flat `repositories` reader, or a persistent migration fallback. Done means every discovered workspace configuration is canonical, the corrected parent schema-one workspace supports `ki repo audit`, targeted contracts pass, then the full suite, typecheck, style check, roff lint, and roadmap audit pass. The worker stops before commit for review.

## Discussion

### One current format

Schema 1 is the latest and only workspace representation. Its shape is the current typed-member, recursive workspace model, not the historical flat model. Carrying a reader, migration, or compatibility path for schema 2 or flat `repositories` groups would make the format ambiguous and preserve an accidental historical contract.

### No feature regression

Nested workspace members, recursive resolution, cycle detection, and physical post-order registration are retained. Only the version label and misleading documentation change; the historical alternative formats are deliberately unsupported.

### Immediate regression evidence

The parent Knowledge Islands workspace is currently the only discovered historical flat document. It will be deliberately rewritten to the canonical empty typed-member schema-one document, and the inventory will confirm whether any further workspace files need the same treatment. Its successful direct-CWD audit is the acceptance check for this correction.
