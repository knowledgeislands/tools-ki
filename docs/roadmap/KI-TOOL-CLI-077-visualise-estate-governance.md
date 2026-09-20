---
id: KI-TOOL-CLI-077
area: CLI
title: Visualise estate governance
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-20T07:34:49Z
updated_at: 2026-09-20T07:34:49Z
---

## Goal

Provide a local graphical view of governance health across the Knowledge Islands estate so repository state, audit findings, dependencies, roadmap horizons, and worktree hygiene can be understood without assembling a manual checkpoint ledger.

## Context

The 21-repository baseline audit proved that the underlying evidence exists but is costly to compare as prose and command output. The desired dashboard needs current multi-repository discovery and read-only governance evidence, including private repositories that must not be published on the public KI Website.

`tools-ki` already owns repository resolution and governance execution. The Harness owns the portable standards and checkers, while KI Website owns public content presentation rather than private local estate operations.

## Boundary

Start read-only and local. Do not publish private repository metadata, duplicate governance rules outside the Harness, mutate repositories from the dashboard, or make KI Website the source of estate truth. Do not create a separate dashboard repository until the product boundary is large and stable enough to justify one.

## Discussion

### Recommended ownership

Place the first implementation in `tools-ki`. A machine-readable estate snapshot and a local UI can share its existing repository-resolution and audit capabilities while consuming Harness-owned contracts. If the UI later becomes an independently deployable product, extract it from an evidenced seam rather than starting with a speculative repository.

### First useful slice

Prefer a read-only estate snapshot with a small local graphical surface: repository identity, current commit and cleanliness, worktree count, declared skills, audit summary, dependency freshness, roadmap counts by horizon and lifecycle, and explicit unresolved external actions. Preserve links back to canonical repository records instead of copying their prose.

### Privacy and freshness

Compute the view locally on demand, identify stale or unavailable evidence, and keep private repository names and findings off public hosting by default. Any later shared or hosted dashboard needs a separate decision about redaction, authentication, storage, and refresh authority.
