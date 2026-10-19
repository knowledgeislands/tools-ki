---
id: KI-TOOL-KI-CLI-153
area: CLI
title: Biome schema drift
project: tools-burndown
purpose: debt
kind: deliver
status: done
blocks: []
blocked_by: []
baseline_ref: 35ba8ec1944ec7c5167c8d6b050e62c34f2eeb83
created_at: 2026-10-19T07:05:55Z
updated_at: 2026-10-19T10:02:46Z
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

Independent review, 19 October 2026, by the `review153` run of the tools-burndown Project, which did not write this change. Read at `cc930b04` against Goal, Boundary and Verify; no code changed and nothing accepted. Verdict: ready for acceptance, with two observations that do not block.

- **Assertions:** at baseline `35ba8ec1`, Biome reports 25 `noNonNullAssertion` findings: six in the excluded `source-mirrors.ts` and 19 in the edited files. Eighteen of the 19 became type assertions. Each rests on a check that runs first: a length or `Object.hasOwn` guard, a capture group the regex must match, the non-empty array that `split` returns, `canonical` mapped from `ZONES`, `currentSources` holding every mapping key, `declaredRepositoryKind` requiring a declared `ki-repo-kb` skill for a KB, or a test fixture's injected `INDEX_PATH`. Each type is the one `!` produced, so none of them hides a type error. The 19th, in `contract.test.ts`, destructures the first result and reads it through `?.`. An absent result still fails `toBe('Note')`, so the test is no weaker. The other rewrites are Biome's `useTemplate` and `useOptionalChain` fixes on string or registry-entry operands, and each is equivalent.
- **Exclusion:** `biome.json` excludes exactly one path. `source-mirrors.ts` and its test are byte-unchanged from baseline, and the frozen-hash test still passes, so the vendor drift check still covers the file. Its upstream is the ki-agentic-harness classifier that `d794bc9f` and `2f37fb0e` vendored.
- **Gates:** re-run at `cc930b04`, with the same source as `c2a9a062`. `bunx biome check .` (2.5.15) is silent. `bun run test:coverage` passes 80 files and 1,350 tests at 100% statements, branches, functions and lines. `bunx tsc --noEmit`, `bunx knip`, `mandoc -T lint man/ki.1`, `rumdl check .` and `bunx syncpack format --check` are clean. `ki repo audit --repo .` reports FAIL=0, with this record's only warning being the migration-window `size` field.
- **Observation 1:** the Decision and Verify 3 describe every non-null assertion becoming a type assertion. In fact six stay in the excluded file and one test assertion becomes `?.`. Change Summary already describes the delivered change correctly.
- **Observation 2:** `contract.ts` is the canonical source that mcp-ki-kb-fs vendors under `src/generated/kb-search/receipt.json`, which pins tools-ki `2f37fb0e`. After this change, the canonical file and that pinned copy differ, but only in syntax. The downstream receipt test pins the commit, so nothing breaks. The next re-vendor picks up a new digest.

### Mini recap

`biome check .` is silent on the 2.5.15 schema, with no behaviour change.

## Done

Accepted 2026-10-19 by Kris Brown on the review packet above.

## Discussion

Acceptance authority: Kris Brown's HIGH-CONFIDENCE answer of 19 October 2026, "do all high confidence items", read back as KI-153-VERDICT a), recorded in the [tools-burndown decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md). It accepts the record on the independent `review153` review with both of that review's observations as known limits. No source changed between the reviewed `cc930b04` and acceptance.

Known limits, accepted as they stand rather than carried as follow-up records:

- The Decision and Verify 3 overstate the assertion replacement: 18 of the 19 edited non-null assertions became type assertions, one became an optional chain in `contract.test.ts`, and six remain in the excluded vendored `source-mirrors.ts`. Change Summary describes the delivered change.
- `src/core/kb/contract.ts` now differs in syntax only from the copy mcp-ki-kb-fs pins at tools-ki `2f37fb0e`; its next re-vendor picks up the change.

The Outstanding concern that CI does not run `biome check` is carried by [KI-TOOL-KI-CLI-156](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-156-ci-runs-local-gate.md).
