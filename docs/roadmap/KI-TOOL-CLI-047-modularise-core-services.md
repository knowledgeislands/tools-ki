---
id: KI-TOOL-CLI-047
title: Modularise core services
area: CLI
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Make `src/core` easier to navigate and change by splitting cohesive service areas behind clear module boundaries.

## Context

`src/core` contains more than 6,400 lines across 31 modules. Several files now combine discovery, parsing, lifecycle, presentation, and mutation concerns; `trade-core.ts` alone has 965 lines. The CLI contract and sandbox tests allow internal movement when public command behaviour remains unchanged.

## Boundary

This is a comprehension-first structural refactor. Do not alter public CLI behaviour, introduce compatibility shims, or mix unrelated feature work into module moves.

## Shaping

Identify the largest mixed-concern modules, select one cohesive service boundary at a time, and move private helpers behind a small barrel only where it improves command-facing comprehension. Preserve injected `KiContext` capabilities and CLI sandbox coverage throughout.

## Discussion

Prioritise seams with stable concepts and clear command consumers, beginning with trade lifecycle/discovery or runtime loading only after a focused design pass. Keep the adopted audit-remediation host contract in `KI-TOOL-CLI-046` separate so its delivery can proceed independently.
