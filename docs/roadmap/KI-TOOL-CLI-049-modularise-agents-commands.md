---
id: KI-TOOL-CLI-049
title: Modularise agents and commands
area: CLI
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: f661e1d4a0099e12cf2b98d919025bd3c0444533
---

## Goal

Separate agent-runtime integration and command invocation orchestration so vendor-specific concerns, vendor-neutral services, typed core operations, and terminal adapters have clear ownership.

## Context

`src/agents` mixed vendor descriptors with shared configuration and skill services. Several Commander action bodies also owned domain orchestration, mutation sequencing, progress, and terminal rendering in the same module.

## Boundary

This is a structural refactor only. Commands retain Commander grammar, `KiContext` adaptation, option parsing, terminal rendering, stdout/stderr, and exit translation. Typed orchestration belongs in `src/core` behind narrowly injected capability ports and semantic event observers. Public output, exit codes, agent support, trade semantics, managed-skill behaviour, and repository correctness gates remain unchanged.

No compatibility shims, caching, result reuse, or behavioural shortcuts are introduced.

## Current state

Agent descriptors are grouped by vendor while runtime-neutral types and detection live under a shared boundary. Terminal presentation is command-owned. Core operations own repository, roadmap, trade, harness, manage, bootstrap, and development orchestration without importing `KiContext`, command modules, or terminal output ports.

Only cross-domain infrastructure primitives remain directly under `src/core`: `errors.ts` and `paths.ts`.

## Steps

- [x] Separate vendor-specific agent descriptors and conventions behind a vendor entry point.
- [x] Group vendor-neutral agent types, detection, configuration, managed skills, capability status, bootstrap, and activation services behind focused boundaries.
- [x] Extract typed core operations from command actions, beginning with repository audit and conform orchestration and extending through roadmap, trade, harness, manage, bootstrap, and development flows.
- [x] Pass focused execution ports and semantic progress observers into core operations so long-running work can stream evidence without core owning terminal output.
- [x] Move terminal presentation primitives, repository reporting/progress, and trade HTML rendering out of `src/core` into command-owned presentation modules.
- [x] Rename the former transaction module as the `src/core/filesystem` publication boundary.
- [x] Exercise affected commands exclusively through `sandbox()` and retain 100% product-code coverage.

## Check

- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --repo .`

## Dependencies

No local work item blocks this record. The accepted CLI-047 core-domain refactor established the starting structure; CLI-048's runtime-host behaviour remains unchanged.

## Documentation impact

No user-facing guide or decision-record change is required because the public CLI contract is unchanged. This roadmap record retains the source-layout and operation-boundary evidence.

## Review

### Delivered

Reorganised agent integration by vendor/shared ownership; moved all terminal presentation to the command layer; introduced focused filesystem, repository, work, trade, harness, manage, bootstrap, and development operation boundaries; and reduced commands to CLI adaptation and presentation responsibilities.

### Summary of changes

Core operations receive narrow typed capability ports rather than `KiContext`. Repository execution uses semantic progress trackers and observers, preserving live streaming while keeping bars, timers, trees, icons, and wording command-side. Imports were migrated directly with no legacy forwarding paths.

The implementation was committed as independently verified modules: agent layout, filesystem publication, presentation primitives, repository execution/presentation, roadmap operations, repository audit/conform operations, harness operations, trade presentation and operations, manage operations, and bootstrap/development operations.

### Verification

`bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .` all pass. Coverage remains 100% on statements, branches, functions, and lines. All tests continue to drive the CLI through `sandbox()`.

### Outstanding concerns

None.

### Post-change review

The dependency direction is now one-way: commands adapt the CLI host into typed core operations, while core has no command or terminal-presentation imports. The split follows stable responsibilities rather than file-size targets, and the command files that remain comparatively large are dominated by grammar and rendering rather than hidden domain mutation.

### Mini recap

CLI-049 completes the agreed application-layer cleanup without changing user-visible behaviour. The resulting structure supports future command work through focused operations and ordered semantic events rather than expanding Commander action bodies.

## Discussion

The filesystem publisher remains intentionally defensive: path-scope validation, symlink protection, concurrent replacement detection, and atomic publication are retained under the clearer `src/core/filesystem` name.
