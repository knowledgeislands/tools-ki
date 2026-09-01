---
id: KI-TOOL-CLI-061
area: CLI
title: Modularize runtime operation core
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

# Modularize runtime operation core

## Goal

Turn the runtime domain entry point into a readable barrel over cohesive preparation, audit, education, and conform modules without changing rubric execution behavior.

## Context

`src/core/runtime/index.ts` currently combines public types, preparation, catalogue execution, education, audit, and conform behavior. Repository commands already consume these as distinct operations, while the core entry point leaves their boundaries difficult to see and maintain.

## Boundary

Do not change rubric contracts, execution ordering, progress events, conform safety, finding levels, coverage policy, or public command output. Do not create internal unit tests or abstractions whose only purpose is reducing file size.

## Shaping

Inventory public exports, callers, coverage guards, and operation-specific dependencies before choosing module boundaries. Validate preparation, education, audit, and conform as independently cohesive concepts while preserving execution ordering, semantic progress events, and every conform safety rule. Plan this work only when no active rubric-runtime feature is changing the same execution paths, and verify it through existing repository CLI contracts rather than internal unit tests.

## Discussion

The entry point is approximately 590 lines, but size alone is not the reason for the work. Planning must validate the provisional concepts against every caller and the full coverage guard rationale before selecting an exact file layout.
