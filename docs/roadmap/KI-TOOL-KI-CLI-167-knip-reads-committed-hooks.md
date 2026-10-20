---
id: KI-TOOL-KI-CLI-167
area: CLI
title: Knip reads committed hooks
kind: deliver
purpose: capability
project: tools-burndown
component: repo
priority: high
size: s
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: b7e64c0e850129dee48f1401993b50820c8bfcfa
created_at: 2026-10-19T23:05:00Z
updated_at: 2026-10-20T04:34:54Z
transferred_from: ki-principal ki.tools-burndown KNIP-HUSKY a), Kris, 19 October 2026 23:42 BST
---

# KI-TOOL-KI-CLI-167: Knip Reads Committed Hooks

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
- An `ignoreDependencies` entry is redundant when the hooks call its tool as a command: the package name, or `commitlint` for `@commitlint/cli`. The frame's `for tool in` lines do not count. The plugin is root-only, so entries are dropped at the top level and in `workspaces["."]` of `knip.json`, and in no other workspace. An array left empty loses its key.
- `knip.json` is edited as text: the array keeps its one-line or one-per-line layout, and `husky` is appended as the last key on one line in the file's indentation. The result must parse to exactly the intended object, or the conversion refuses.
- `knip.ts` is edited only in the shape of an object literal opened on its own line by `export default {` or `const <name>[: <type>] = {`, with at most one one-line `ignoreDependencies` array of string literals. `husky` becomes the object's first member, in the file's quote style. Anything else refuses, naming the file.
- The write is one more `hook-write` event, so a dry run reports `would write knip.json` and changes nothing; a second run changes nothing.

## Requirements

1. Adds the `husky` configuration to `knip.json`, keeping every other byte's meaning and layout.
2. Adds it to a `knip.ts` of the recognised shape.
3. Removes only the hook-tool `ignoreDependencies` entries the hooks call, at the top level and in the root workspace, and the key when it empties.
4. Runs on an already-converted repository as well as during conversion.
5. Refuses, writing nothing, on a conflicting `husky` value, an unparseable `knip.json`, an edit that does not round-trip, or an unrecognised `knip.ts`.
6. Is idempotent, and a dry run changes nothing.
7. tools-ki's own `knip.json` converts and `bunx knip` stays clean.

## Steps

- [x] Add the Knip planning to `src/core/repository/hooks.ts`.
- [x] Add fixture tests through `run(args, context)` in `src/tests/cli/repo/hooks.test.ts`.
- [x] Apply the step to tools-ki's own `knip.json` with the source build.
- [x] Update the manual, the regenerated command inventory, the repository-operations guide and the changelog.
- [x] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/repository/hooks.ts`, `src/tests/cli/repo/hooks.test.ts`
- `knip.json`
- `man/ki.1`, `man/ki.commands.json`, `docs/guides/user/repository-operations.md`, `CHANGELOG.md`
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

## Review

### Delivered

The whole record, from baseline `b7e64c0e` on 20 October 2026, by the `knipfix` run in the tools-burndown Project.

### Change Summary

- `src/core/repository/hooks.ts`: after composing the hooks, the plan reads `knip.json`, or else `knip.ts`, and adds one more write: `husky.config` naming the committed hooks, and the hook-tool `ignoreDependencies` entries removed at the top level and, in `knip.json`, the root workspace. Both edits are text edits; `knip.json` must parse back to exactly the intended object, and `knip.ts` must be a plain object literal. `refuse` takes an optional remedy, so Knip refusals point at the Knip file rather than at the hooks.
- `src/tests/cli/repo/hooks.test.ts`: 18 cases through `run(args, context)`: conversion and already-converted repositories, dry run, idempotence, one-line, empty and already-configured `knip.json`, root-workspace ignores in one-line and indented files, ki-principal's `knip.ts` and three other `knip.ts` shapes, and ten refusals.
- `knip.json`: tools-ki's own configuration, converted by `bin/ki repo conform --skill ki-repo` from this source.
- Documentation: the manual, the regenerated command inventory, the changelog and the repository-operations guide.
- Deviations:
  - Root-workspace ignores were added after the plan: ten estate repositories keep the hook tools under `workspaces["."]`.
  - README is unchanged: its conform line names the hook move only in outline.
  - The conform run on tools-ki also rewrote `.rumdl.toml`, the known `ki-authoring` rewrite that the wave runs also met; it was restored and is not part of this change.

### Verification

| Requirement | Evidence |
| --- | --- |
| 1 | `a conversion points knip.json at the committed hooks…` asserts the whole file, every other line byte for byte |
| 2 | `knip.ts gains husky as its first member…` on ki-principal's `knip.ts`, and the three `knip.ts:` cases |
| 3 | The `googleapis` entry kept in `a converted repository gains the Knip configuration…`, `the root workspace loses its redundant ignores too…` and the last-member `knip.ts` cases; empty arrays lose their key |
| 4 | `a converted repository gains the Knip configuration…` runs with no `.husky/` |
| 5 | The ten `refuses …` Knip cases, each asserting the Knip file, `.githooks/` and the binding unchanged |
| 6 | Repeated runs in the `knip.json` and `knip.ts` cases write nothing; the dry run leaves `knip.json` unchanged |
| 7 | tools-ki's `knip.json` converted; `bunx knip` passes and a second dry run proposes no Knip write |

- Gate:
  - `bun run test:coverage` passed: 82 files and 1,424 tests, all at 100%.
  - `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and the command-inventory check all passed.
  - `ki repo audit --repo .` reports no failure; its warnings predate this change.
- ki-principal's `knip.ts`, edited as the step edits it in a temporary copy and run with `knip -c`, reports no unused dependency. In infoschematics, a top-level `husky` entry with the root-workspace ignores removed also leaves Knip clean, so a top-level entry serves a workspaces layout. Neither repository was changed.
- The plan, run on temporary copies of the hooks, manifest and Knip configuration of all 28 converted estate repositories, writes the Knip configuration in 27 with no hook-tool name left; ki-design refuses because its hook still delegates to a missing `.husky/pre-commit`, which is unrelated to Knip. tools-ki needs no write.

### Outstanding concerns

- The step cannot create a Knip configuration. A new repository gets `knip.json` from the harness `ki-engineering` KNIP-1 scaffold, after this step in the same conform run, so its Husky configuration arrives on the next conform. Making the scaffold write it is a harness change. Kris disposed of it on 20 October 2026 under SWEEP-ACCEPT-TOOLS-BURNDOWN a) ("Knip as a message"): it is carried as a `messages.md` line to `ki.tools-burndown` in Knowledge Islands Principal naming the harness `ki-engineering` owner, not as a record.
- A `knip.ts` in any other shape, such as `defineConfig(…)` or a multi-line `ignoreDependencies`, refuses the whole conversion until edited by hand. Only ki-principal has a `knip.ts` in the estate.

### Post-change review

Pointing the plugin at the committed hooks lets Knip treat the hook tools as used rather than ignored, so a tool the hooks stop calling becomes a finding again. Running on every conform, not only during conversion, makes the estate cleanup a plain conform run after release.

### Mini recap

`ki repo conform` with `ki-repo` selected now points Knip at `.githooks/` and drops the hook-tool ignores, in `knip.json` or `knip.ts`; tools-ki's own configuration is converted.

## Discussion

The edits are textual because reserialising `knip.json` changes the layout of unrelated arrays, which Biome then reports; the round-trip check keeps the textual edit honest. `knip.ts` is not executed, since conform should not run repository code, so only a plain object literal is edited.

### Independent acceptance review, 20 October 2026

Acceptance failed on the work-item-format standard's Awaiting review rule: Outstanding concerns leaves Knip scaffolding as a harness change without a work identifier. KNIP-HUSKY a) in the 19 October decision includes scaffolding; this record explicitly excludes creating a Knip configuration, leaving a newly scaffolded configuration dependent on a second conform run. The implemented existing-configuration requirements and full gate pass, but the remaining requested scaffolding must be carried by an identified follow-up before acceptance. The coordinator must authorise and capture that follow-up (or explicitly dispose of the requirement); this pass creates no record or scope decision.

Independent acceptki2 verification on 20 October 2026: the full coverage run passed all 1,454 tests in 84 files with 100% statements, branches, functions and lines; TypeScript, Biome, rumdl, Knip, manual lint and the command-inventory check passed. The complete declared repository audit passed with FAIL=0 and three pre-existing warnings. GitHub checks were unavailable under the brief's prohibition on remote calls; the audit used its normal unavailable-GitHub path. The public CLI tests and the changed implementation were reviewed independently of the delivery reports.

### Follow-up disposed, 20 October 2026

The failed acceptance asked for the Knip scaffolding follow-up to be identified or disposed of. Kris answered SWEEP-ACCEPT-TOOLS-BURNDOWN a) on 20 October 2026, recorded in Knowledge Islands Principal `+/_WORK/ki.ways-of-working/decisions.md`: "Same for the tools burned down", taken as accepting the three Rig records with Knip as a message. Under CAPTURE-GATE the follow-up went as one line to `ki.tools-burndown`'s `messages.md` naming the harness `ki-engineering` owner, and Outstanding concerns says so. The apply-sweep run re-ran the gates in a separate worktree at `ee40f265`: TypeScript, Biome, Knip, rumdl, the manual lint and the command-inventory check passed, and the coverage run passed all 1,365 tests in 84 files at 100% statements, branches, functions and lines; the count is lower than at review because the Granola ledger removal (`26c754f3`) took its tests with it. The record returns to awaiting review.
