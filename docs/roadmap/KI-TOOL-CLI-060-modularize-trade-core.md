---
id: KI-TOOL-CLI-060
area: CLI
title: Modularize trade lifecycle core
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

# Modularize trade lifecycle core

## Goal

Turn the trade domain entry point into a readable barrel over cohesive lifecycle modules without changing the public trade protocol or CLI contract.

## Context

`src/core/trade/index.ts` currently combines estate discovery, record decoding, payload projection, lifecycle decisions, and several mutation paths. The domain already has focused configuration, identifier, payload, route, and operation modules, so the remaining entry point obscures boundaries that already exist conceptually.

## Boundary

Do not change trade file formats, lifecycle semantics, command output, route configuration, observation policy, cross-repository authority, or public exports. Do not split functions solely to reduce line count or introduce compatibility shims.

## Shaping

Inventory current exports, callers, coverage guards, and parsed-meaning invariants before choosing module boundaries. Validate estate discovery, record codec, lifecycle evaluation, and lifecycle mutation as independently cohesive concepts; retain only boundaries that improve comprehension without changing public exports. Plan this work only when no active trade-protocol delivery is using the same source surface, and verify it through existing `ki trade` and `ki repo roadmap` CLI contracts rather than internal unit tests.

## Discussion

The entry point is approximately 950 lines, but size alone is not the reason for the work. Planning must validate the provisional concepts against the actual call graph rather than treating them as a required file layout.
