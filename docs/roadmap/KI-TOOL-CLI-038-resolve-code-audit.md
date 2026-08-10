---
id: KI-TOOL-CLI-038
area: CLI
title: Resolve code audit
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Improve the CLI's test-contract fidelity and preserve codebase navigability by resolving the validated findings from the 2026-08-10 code audit without changing user-facing behaviour.

## Context

The code audit found no high-severity concern and confirmed that the CLI's `run(args, context)` seam and isolated sandbox are strong architectural test boundaries. It identified four maintainability and test-contract improvements: retain separate stdout and stderr assertions in the shared test helper; make the boundary guard resolve imports rather than match a narrow pattern; remove the `core` to `agents` dependency inversion; and split responsibility hotspots only where existing domain seams make the result clearer.

## Boundary

Do not change the public CLI contract, introduce a broad rewrite, or apply the separate portable `ki-engineering` standards change here. Do not split files merely to meet a size target or replace clear local duplication with a generic abstraction.

## Shaping

Start with the two bounded test-harness improvements, each proved through the existing CLI contract suite. Then identify a neutral home for the shared bootstrap inventory and replace broad imports with narrow domain dependencies. Assess `repository-reporting`, `trade-core`, and the repository command factory individually; extract a module only when its responsibility, callers, and verification boundary are clear.

Promotion requires an implementation order that keeps every change independently reviewable, exact public-contract assertions for stream routing and import-boundary enforcement, and a scoped verification matrix for each selected structural refactor.

## Discussion

### Audit findings

The audit observed that the shared CLI test helper merges stdout and stderr, obscuring an important Unix CLI contract. Its import-boundary test does not resolve realistic nested product imports. It also found small `core` to `agents` dependency inversions and a few modules that combine otherwise distinct responsibilities.

### Delivery approach

The test-harness changes are independent and should precede structural refactors, so later work has stronger regression protection. The dependency direction and module splits remain separate, bounded changes: no aggregate "cleanup" pass and no mandatory decomposition of a coherent module.
