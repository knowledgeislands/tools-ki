---
id: KI-TOOL-KI-CLI-167
area: CLI
title: Knip reads the committed hooks
kind: deliver
purpose: capability
project: tools-burndown
component: repo
priority: high
size: s
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: b7e64c0e
created_at: 2026-10-20T00:05:00Z
updated_at: 2026-10-20T00:05:00Z
transferred_from: ki-principal ki.tools-burndown KNIP-HUSKY a), Kris, 19 October 2026 23:42 BST
---

# KI-TOOL-KI-CLI-167: Knip Reads the Committed Hooks

## Goal

`ki repo conform` points Knip's Husky plugin at the committed `.githooks/pre-commit` and `.githooks/commit-msg`, in `knip.json` or `knip.ts`, and drops the hook-tool `ignoreDependencies` entries that this makes redundant, so that Knip sees `@commitlint/cli`, `lint-staged` and `syncpack` as used once Husky has gone.

## Context

Kris took KNIP-HUSKY a) on 19 October at 23:42 BST, quoted in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md). Knip's Husky plugin is enabled by the `husky` dependency and reads `.husky/`, so once [KI-TOOL-KI-CLI-163](KI-TOOL-KI-CLI-163-githooks-conversion.md) removes Husky, Knip reports the hook tools as unused. The wave runs worked around this by adding them to `ignoreDependencies` by hand. A blind review showed in tools-ki, with Knip 6.42.0, that an explicit `"husky": { "config": [".githooks/pre-commit", ".githooks/commit-msg"] }` finds all three tools with no ignore entry; this run repeated that check.

## Boundary

- In: a Knip step in the hook conversion of `ki repo conform`, for every repository with committed hooks and a `knip.json` or `knip.ts`, already-converted repositories included, so that the estate cleanup is a conform run; text edits that keep unrelated settings and formatting; refusal of what it cannot edit safely; dry-run reporting; tests; manual, guide and changelog lines.
- Out: creating a Knip configuration, which `ki-engineering` KNIP-1 scaffolds in the harness; the harness Knip guidance, a separate ki-agentic-harness commit; running the cleanup against any other repository; a release.

## Current state

`planHookConversion` in `src/core/repository/hooks.ts` composes hooks, edits `package.json` and `bun.lock`, and plans the binding. It never reads a Knip configuration. tools-ki's own `knip.json` and ki-principal's `knip.ts` both ignore `@commitlint/cli`, `lint-staged` and `syncpack`.

## Design

- The hooks are those of `.githooks/pre-commit` and `.githooks/commit-msg` that exist or are being written, in that order. With none, or with neither `knip.json` nor `knip.ts`, there is no Knip step; `knip.json` wins when both exist, as in Knip's own lookup.
- The wanted `husky` value is `{ "config": [<hooks>] }`. An existing equal value is kept; any other `husky` value refuses the conversion, naming the file.
- An `ignoreDependencies` entry is redundant when the hooks call its tool as a command: the package name, or `commitlint` for `@commitlint/cli`. The frame's `for tool in` lines do not count. An array left empty loses its key.
- `knip.json` is edited as text: the array keeps its one-line or one-per-line layout, and `husky` is appended as the last key on one line in the file's indentation. The result must parse to exactly the intended object, or the conversion refuses.
- `knip.ts` is edited only in the shape of an object literal opened on its own line by `export default {` or `const <name>[: <type>] = {`, with at most one one-line `ignoreDependencies` array of string literals. `husky` becomes the object's first member, in the file's quote style. Anything else refuses, naming the file.
- The write is one more `hook-write` event, so a dry run reports `would write knip.json` and changes nothing; a second run changes nothing.

## Requirements

1. Adds the `husky` configuration to `knip.json`, keeping every other byte's meaning and layout.
2. Adds it to a `knip.ts` of the recognised shape.
3. Removes only the hook-tool `ignoreDependencies` entries the hooks call, and the key when it empties.
4. Runs on an already-converted repository as well as during conversion.
5. Refuses, writing nothing, on a conflicting `husky` value, an unparseable `knip.json`, an edit that does not round-trip, or an unrecognised `knip.ts`.
6. Is idempotent, and a dry run changes nothing.
7. tools-ki's own `knip.json` converts and `bunx knip` stays clean.

## Steps

- [ ] Add the Knip planning to `src/core/repository/hooks.ts`.
- [ ] Add fixture tests through `run(args, context)` in `src/tests/cli/repo/hooks.test.ts`.
- [ ] Apply the step to tools-ki's own `knip.json` with the source build.
- [ ] Update the manual, the repository-operations guide, README if it names the step, and the changelog.
- [ ] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/repository/hooks.ts`, `src/tests/cli/repo/hooks.test.ts`
- `knip.json`
- `man/ki.1`, `docs/guides/user/repository-operations.md`, `CHANGELOG.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip` and `ki repo audit` pass.

## Dependencies / blocks

Builds on KI-TOOL-KI-CLI-163, done. The estate cleanup runs after the next release.

## Documentation impact

### Decision Records

None: KNIP-HUSKY a) is the decision.

### Specifications

None.

### Guides

The repository-operations guide and the manual's `repo conform` entry name the Knip step.

### Roadmap

None.
