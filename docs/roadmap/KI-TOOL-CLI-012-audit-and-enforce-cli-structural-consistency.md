---
id: KI-TOOL-CLI-012
title: Audit and enforce CLI structural consistency
theme: cli
horizon: next
status: acceptance
blocks: []
blocked-by: []
baseline-ref: b6f26242010d1e605279e7aaf339ae1746c9732c
---

## Context

Perform one behaviour-preserving consistency pass over the `ki` command tree, module boundaries, documentation inventories, and CLI-contract test architecture. Establish durable checks so public commands, help, completions, manual and changelog inventories, and coverage evidence cannot drift independently. The result should keep the CLI's public `run(args, context)` seam as the only product-code test entry point and preserve 100% four-metric coverage as a dead-code detector.

## Boundary

Do not add product commands, cleanup deletion, or vendoring behaviour; redesign Commander or `KiContext`; replace CLI-contract tests with internal unit tests; or treat installer tests as CLI unit tests. Preserve public output and exit semantics except for explicitly approved corrections to stale inventory or order. Refactor by concern rather than an arbitrary line-count target.

## Current state

The public CLI is complete enough to verify but has no single enforced command-tree contract. Runtime registration, root completion catalogues, help, the manual, and the changelog can change independently. The manual and changelog provide the deliberately purpose-oriented public presentation; root and repository shell completions are alphabetically ordered for lookup. `repo.ts` and `acquire.ts` combine Commander bindings with domain orchestration, while `repo.test.ts` combines unrelated CLI contracts. Tests conventionally use the sandbox and `run(args, context)` seam, but only an import discipline prevents future internal product-unit tests.

## Steps

1. [x] Make runtime registration consume a typed root-command inventory and retain purposeful public command order, while keeping completion candidates alphabetical.
2. [x] Add CLI-driven inventory contracts for root and repository commands, root and repository completions, and the corresponding man-page and changelog command surfaces.
3. [x] Extract repository-operation and local ChatGPT capture domain orchestration from Commander bindings; split the repository CLI contract suite by public command area without changing outputs or on-disk effects.
4. [x] Add a test-source guard which permits only the shared CLI harness to import product code, reconcile filesystem fault injection with the documented sanctioned cases, and correct the developer-documentation path drift.
5. [x] Audit coverage suppressions and exports, remove only unreachable dead code or unjustified suppressions, and retain narrowly justified future-proofing guards.
6. [x] Run the full CLI, coverage, type, formatting, Markdown, man-page, dead-export, and repository-governance gates; prepare an acceptance packet.

## Files touched

- `src/cli.ts` and `src/commands/catalogue.ts`, with a focused root-command registration module as needed.
- `src/commands/repo.ts`, `src/commands/acquire.ts`, and focused domain modules beneath `src/core/`.
- `src/tests/cli/`, including the shared harness and split public command-contract suites.
- `docs/developer/local-development.md`, `man/ki.1`, `CHANGELOG.md`, and this work item.
- `vitest.config.ts` or a focused test-policy configuration only if required by the guard.

## Verify

- `bun run test` passes with 100% statements, branches, functions, and lines over product TypeScript.
- `bunx tsc --noEmit`, `bunx biome check .`, and `bunx knip --include exports --reporter compact` pass.
- `ki repo audit --skill ki-engineering --repo .`, `ki repo audit --skill ki-authoring --repo .`, and `ki repo audit --skill ki-roadmap --repo .` report no FAIL or WARN findings.
- `prettier --check` and `markdownlint-cli2` pass for changed Markdown, and `mandoc -T lint man/ki.1` passes.

## Dependencies / blocks

No roadmap dependency blocks this item. Its tests must preserve the existing public contract: all command behaviour continues to run through the sandbox and `run(args, context)`, and the existing transaction fault-injection exceptions remain the only direct filesystem mock cases unless an injected capability replaces them.

## Acceptance

### Delivered

The root CLI now registers from a typed inventory. Root help follows the purpose-oriented manual and changelog sequence, while root and first-level repository shell completions use an alphabetic lookup sequence. CLI-driven contracts compare the full runtime tree, both completion scripts, and the tracked public inventories.

### Summary of changes

Commander bindings for acquisition and repository operations are thin. KEP acquisition, repository operation orchestration, reporting/progress, and subprocess execution now have focused core modules. The oversized repository contract suite is split by public command area, and a mechanical import guard keeps test entry through the shared CLI sandbox. The publication metadata-read fault is injected at the context boundary, removing its filesystem module mock; only the two documented transaction mock cases remain. The developer document path and man-page lint structure are corrected.

### Verification

- `bun run test` passed: 411 tests.
- `bunx vitest run --coverage` passed: 411 tests and 100% statements, branches, functions, and lines.
- `bunx tsc --noEmit`, `bunx biome check .`, and `bunx knip --include exports --reporter compact` passed.
- Focused `ki-engineering`, `ki-authoring`, and `ki-roadmap` audits reported no FAIL or WARN findings.
- Prettier, markdownlint, `mandoc -T lint man/ki.1`, and `git diff --check` passed.

### Outstanding concerns

None. Deeper completion candidates remain deliberately out of scope until they are a stable public catalogue.

### Mini recap

The CLI remains behaviour-compatible while its public command inventory, test boundary, and domain boundaries are mechanically guarded. This item is ready for explicit acceptance review.

## Discussion

### Current evidence

The command inventory already has several independent authorities: runtime registration, completion catalogues, help, manual, and changelog presentation. Their order has drifted, and the current tests do not compare the complete runtime command tree against the other inventories.

The shared CLI sandbox drives the real `run(args, context)` seam with isolated HOME, XDG, project, network, and subprocess capabilities. Product coverage includes every non-test TypeScript file and enforces 100% statements, branches, functions, and lines. That is a strong foundation, but the policy is convention-only: a future internal unit test could reach product code without proving it is publicly reachable.

Two command modules currently carry substantial domain orchestration behind their Commander bindings, and the largest CLI contract suite is difficult to navigate as one file. Coverage suppressions and the sanctioned filesystem-mocking policy also need one explicit reconciliation rather than incremental exceptions.

### Candidate deliverables

- Establish one canonical command-tree and inventory authority, or a deterministic contract check comparing runtime registration with completions and tracked command inventories.
- Decide and enforce command ordering and completion depth.
- Move repository progress, reporting, and subprocess orchestration and acquisition domain logic behind focused modules, leaving command modules as bindings.
- Split oversized CLI test files by public contract area while retaining the `run(args, context)` entry seam.
- Add a mechanical import or location guard that prevents product-internal unit tests from bypassing the CLI contract.
- Audit every coverage suppression: remove dead production code, cover reachable paths through CLI inputs, and retain only narrowly justified guards.
- Run the dead-export check and include its clean result in acceptance evidence.
- Correct architecture-documentation drift discovered during the audit.

### Ordering and contract decisions

The man page and changelog are the canonical purpose-oriented presentation, and runtime root help follows that order. Root and first-level `ki repo` shell completions remain alphabetical for lookup. The consistency test compares their full command memberships rather than requiring those two user interfaces to share one order. Completion coverage stops at those existing public depths: deeper dynamic operands are not a stable completion catalogue yet.

The test-boundary guard is local to `tools-ki`, because it protects this executable's in-process seam rather than a general toolchain rule. The publication `lstat` mock is removed in favour of an injected filesystem capability, leaving the two AGENTS.md-sanctioned acquisition-transaction and conform-transaction failure tests as the only filesystem module mocks.

### Relationship to other future work

This item has no dependency on `KI-TOOL-CLI-010` or `KI-TOOL-VENDOR-001`; all three are independently schedulable. Its consistency checks would reduce the risk of either future implementation extending the CLI surface without complete contract coverage.
