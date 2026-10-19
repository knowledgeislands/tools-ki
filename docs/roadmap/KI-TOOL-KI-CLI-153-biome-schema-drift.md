---
id: KI-TOOL-KI-CLI-153
area: CLI
title: Biome schema drift
project: tools-burndown
purpose: debt
kind: deliver
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 35ba8ec1944ec7c5167c8d6b050e62c34f2eeb83
created_at: 2026-10-19T07:05:55Z
updated_at: 2026-10-19T07:11:17Z
---

# KI-TOOL-KI-CLI-153: Biome Schema Drift

## Goal

`bunx biome check .` reports nothing across the repository: `biome.json` declares the schema of the installed Biome, and the standing lint findings are cleared without any change in behaviour.

## Context

[KI-TOOL-KI-CLI-150](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) recorded at review that `biome check .` showed drift on files it did not touch, and named a small chore record as the learning route. Kris Brown answered BIOME-DRIFT a) on 19 October 2026 at 08:03 BST in the ways-of-working decisions log: fold the drift into an existing tools-ki chore record if one fits, otherwise capture one; one run moves `biome.json` to the 2.5.15 schema and clears the findings. No open record covers toolchain upkeep, so this record was captured and adopted into Now under that answer.

## Boundary

- In: `biome.json` schema version, through `biome migrate`; the findings `biome check` reports, fixed by `biome check --write` first and by hand where the safe fix is absent or would change behaviour.
- Out: new or changed lint rules, Biome version changes, CI changes, and any behaviour change. No release.

## Current state

Read at `35ba8ec1` on 19 October 2026, with Biome 2.5.15 installed and declared in `package.json`.

- `biome.json` declares the 2.5.12 schema; Biome reports the mismatch and suggests `biome migrate`.
- `biome check .` exits 0 with 26 warnings and 15 infos in ten files under `src/`: 25 `style/noNonNullAssertion`, 14 `style/useTemplate` and one `complexity/useOptionalChain`.
- `noUncheckedIndexedAccess` is on. Every flagged non-null assertion sits on an index or regex capture that a preceding check guarantees. Biome's offered fix replaces `!` with `?.`, which adds a runtime branch and, in places such as `!segments[0]?.endsWith(...)`, changes the result when the value is absent.

## Decision

Hand edits replace each invariant-backed `x!` with a type assertion (`x as string`, or the precise type), the form the codebase already uses for checked index access (for example `src/core/estate/plan.ts` and `src/core/trade/standing-intake.ts`). It adds no runtime branch, so behaviour and branch coverage are unchanged. Biome's fixes for `useTemplate` and `useOptionalChain` are taken as written: Biome marks them unsafe in general, but every operand here is a string or a possibly absent registry entry, so each rewrite is equivalent.

`src/core/kb/source-mirrors.ts` is a byte-vendored canonical copy whose frozen hash `source-mirrors.test.ts` checks, so it stays byte-identical and `biome.json` excludes it; its upstream owns its style.

## Steps

- [x] `bunx biome migrate --write` moves `biome.json` to the 2.5.15 schema.
- [x] `bunx biome check --write .` applies the safe fixes; `--unsafe` limited to `useTemplate` and `useOptionalChain` applies the rest.
- [x] Hand edits clear the remaining `noNonNullAssertion` findings as the Decision sets.
- [x] `biome.json` excludes the byte-vendored `src/core/kb/source-mirrors.ts`.

## Files touched

- `biome.json`
- `src/commands/acquire/index.ts`, `src/commands/registry/add.ts`
- `src/core/kb/authority.ts`, `src/core/kb/contract.ts`, `src/core/kb/contract.test.ts`
- `src/tests/cli/kb/limits.test.ts`, `src/tests/cli/kb/runtime.test.ts`, `src/tests/cli/kb/search.test.ts`, `src/tests/cli/repo/kind-shape.test.ts`

## Verify

1. `bunx biome check .` reports no errors, warnings or infos.
2. `bun run test:coverage` passes at 100%; `bunx tsc --noEmit`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` are clean.
3. The diff outside `biome.json` changes only syntax: template literals, Biome's one optional chain, and type assertions in place of non-null assertions.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

None; no behaviour or toolchain version changes.

### Roadmap

None.

## Review

### Delivered

The whole record, from baseline `35ba8ec1` on 19 October 2026 by the `biome-fix` run, under BIOME-DRIFT a) in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, morning Summary", 19 October, 08:03 BST). Not released.

### Change Summary

- `biome.json`: the 2.5.15 schema, and `src/core/kb/source-mirrors.ts` excluded.
- `src/commands/acquire/index.ts`, `src/core/kb/authority.ts` and five test files: Biome's template-literal and optional-chain rewrites.
- `src/commands/registry/add.ts`, `src/core/kb/authority.ts`, `src/core/kb/contract.ts`: each non-null assertion becomes a type assertion; no runtime change.
- `src/core/kb/contract.test.ts` and three `src/tests/cli/kb/` files: the same, with one loop destructuring its first result and asserting through `?.`.
- Deviation: the byte-vendored mirror helper is excluded from Biome rather than edited, since editing it breaks its frozen-hash receipt test.

### Verification

1. `bunx biome check .`: no errors, warnings or infos.
2. `bun run test:coverage`: 1,350 tests passed at 100%; `bunx tsc --noEmit`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl, `syncpack format --check` and `ki repo audit --repo .` clean.
3. The diff outside `biome.json` changes only syntax: passed by review of the diff.

### Outstanding concerns

- CI does not run `biome check`; adding it is outside this record.

### Post-change review

The type assertions keep the same trust in the preceding checks that the non-null assertions expressed, so no runtime guard was added or removed. Excluding the vendored helper leaves its own findings unlinted here; its upstream copy is where they belong.

### Mini recap

`biome check .` is silent on the 2.5.15 schema, with no behaviour change.

## Discussion

None.
