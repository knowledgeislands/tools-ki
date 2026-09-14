---
id: KI-TOOL-CLI-068
area: CLI
title: Split Harness storage lifecycles
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-14T14:04:03Z
updated_at: 2026-09-14T14:04:03Z
---

# Split Harness Storage Lifecycles

## Goal

Restore comprehension-first modularity by separating Harness registry configuration from installation transactions, interrupted-install recovery, development projection, restoration, and uninstall lifecycles.

## Context

The 2026-09-14 engineering review found `src/core/storage/registry.ts` at 572 lines with multiple independent callers and reasons to change. Its public surface currently combines release registry parsing and mutation with archive installation, orphan recovery, local development linking, restore, and removal operations. The registered mechanical engineering audit, 100% contract coverage, TypeScript, Biome, Knip, and build gates all pass, so this is a maintainability boundary gap rather than an observed behavioural defect.

## Boundary

Preserve every public CLI contract, fault-injection seam, transactional guard, recovery behaviour, barrel export, and test outcome. Do not change Harness lifecycle semantics, release metadata, configuration format, or installed filesystem shape merely to perform the split.

## Discussion

Split around stable lifecycle ownership rather than file length alone: release registry configuration, installation/replacement, recovery, and development projection should each have an explicit home and narrow internal interface. Keep the existing CLI-driven contract tests as the verification boundary and avoid new internal unit tests that would ossify the refactor.
