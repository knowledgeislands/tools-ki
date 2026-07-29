---
id: KI-TOOL-CLI-012
title: Audit and enforce CLI structural consistency
theme: cli
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Perform one behaviour-preserving consistency pass over the `ki` command tree, module boundaries, documentation inventories, and CLI-contract test architecture. Establish durable checks so public commands, help, completions, manual and changelog inventories, and coverage evidence cannot drift independently. The result should keep the CLI's public `run(args, context)` seam as the only product-code test entry point and preserve 100% four-metric coverage as a dead-code detector.

## Boundary

Do not add product commands, cleanup deletion, or vendoring behaviour; redesign Commander or `KiContext`; replace CLI-contract tests with internal unit tests; or treat installer tests as CLI unit tests. Preserve public output and exit semantics except for explicitly approved corrections to stale inventory or order. Refactor by concern rather than an arbitrary line-count target.

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

### Promotion condition

Promote this item before another public command is added, or when either managed cleanup or cross-repository vendoring begins implementation and would extend the command surface. Re-evaluate the condition after the current direct doctor and bootstrap corrections settle; the known inventory drift and missing mechanical test-boundary guard are evidence that a consistency pass will soon be warranted.

### Open decisions

Choose whether canonical command order follows purpose-oriented manual presentation, alphabetical completion order, or runtime registration. Decide whether nested completion coverage should extend beyond the current root and first-level repository surface. Decide whether the test-boundary guard remains local to `tools-ki` or becomes a reusable `ki-tools` governance criterion, and whether the publication filesystem mock is sanctioned or removed through an injected capability.

### Relationship to other future work

This item has no dependency on `KI-TOOL-CLI-010` or `KI-TOOL-VENDOR-001`; all three are independently schedulable. Its consistency checks would reduce the risk of either future implementation extending the CLI surface without complete contract coverage.
