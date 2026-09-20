---
id: KI-TOOL-CLI-077
area: CLI
title: Visualise estate governance
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-20T07:34:49Z
updated_at: 2026-09-20T07:47:23Z
---

## Goal

Provide a local graphical view of governance health across the Knowledge Islands estate so repository state, audit findings, dependencies, roadmap horizons, and worktree hygiene can be understood without assembling a manual checkpoint ledger.

## Context

The 21-repository baseline audit proved that the underlying evidence exists but is costly to compare as prose and command output. The desired dashboard needs current multi-repository discovery and read-only governance evidence, including private repositories that must not be published on the public KI Website.

`tools-ki` already owns repository resolution and governance execution. The Harness owns the portable standards and checkers, while KI Website owns public content presentation rather than private local estate operations.

## Boundary

Start read-only and local. Do not publish private repository metadata, duplicate governance rules outside the Harness, mutate repositories from the dashboard, or make KI Website the source of estate truth. Do not create a separate dashboard repository until the product boundary is large and stable enough to justify one.

## Current state

`tools-ki` can resolve and audit one repository but has no estate snapshot model, multi-repository aggregation command, or graphical status surface. The completed baseline provides the first concrete field set and privacy boundary, but its checkpoint was intentionally removed after project-local work was captured.

## Steps

- [ ] Define a read-only estate snapshot model that composes existing repository resolution, audit, dependency, roadmap, and Git evidence without duplicating Harness rules.
- [ ] Add a command that discovers an explicitly configured estate and emits the snapshot in stable machine-readable form.
- [ ] Add a local graphical surface over that snapshot with repository drill-down and links to canonical records.
- [ ] Cover partial availability, stale evidence, private-repository handling, and shared-tree state with fixtures and boundary tests.
- [ ] Document local operation, evidence freshness, privacy defaults, and the conditions that would justify extracting a separate dashboard product.

## Files touched

Expected scope is new estate modules under `src/core/`, command wiring under `src/commands/`, a bounded local presentation surface, colocated tests, package scripts where needed, and operator documentation. `ki-plan` must refine the exact UI seam before readiness.

## Verify

Run focused estate-model and command tests during shaping, then `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bunx biome check .`, and the declared `ki-engineering`, `ki-repo-tools`, and `ki-work-roadmap` audits.

## Dependencies / blocks

No build-order blocker is known. Planning must choose the smallest local UI mechanism and confirm how repositories enter the configured estate without introducing hidden global discovery or publishing private data.

## Documentation impact

### Decision Records

No Decision Record is required for the read-only local first slice. A hosted, shared, authenticated, or separately deployed dashboard would require a later ownership and privacy decision.

### Specifications

Specify the estate snapshot contract and evidence freshness semantics once the first slice chooses its stable output boundary.

### Guides

Add an operator guide for configuring the estate, generating the snapshot, opening the dashboard, and interpreting unavailable or stale evidence.

### Roadmap

Keep extraction into a separate repository outside this item unless implementation reveals a stable independently deployable seam.

## Discussion

### Recommended ownership

Place the first implementation in `tools-ki`. A machine-readable estate snapshot and a local UI can share its existing repository-resolution and audit capabilities while consuming Harness-owned contracts. If the UI later becomes an independently deployable product, extract it from an evidenced seam rather than starting with a speculative repository.

### First useful slice

Prefer a read-only estate snapshot with a small local graphical surface: repository identity, current commit and cleanliness, worktree count, declared skills, audit summary, dependency freshness, roadmap counts by horizon and lifecycle, and explicit unresolved external actions. Preserve links back to canonical repository records instead of copying their prose.

### Privacy and freshness

Compute the view locally on demand, identify stale or unavailable evidence, and keep private repository names and findings off public hosting by default. Any later shared or hosted dashboard needs a separate decision about redaction, authentication, storage, and refresh authority.
