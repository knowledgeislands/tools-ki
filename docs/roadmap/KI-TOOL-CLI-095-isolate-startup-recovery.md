---
id: KI-TOOL-CLI-095
area: CLI
title: Isolate startup recovery
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T09:46:47Z
---

# KI-TOOL-CLI-095: Isolate startup recovery

## Goal

Users can view help, version, and diagnostic repair guidance even when MCP inventory configuration is malformed.

## Context

`run()` adopts the MCP inventory before argument parsing. A malformed `[mcp]` table therefore prevents `ki --help`, `ki --version`, and `ki manage doctor` from reaching their own handlers.

## Boundary

Keep strict MCP inventory validation for commands that consume it. Do not suppress actionable errors on binding operations or change the configured inventory path.

## Current state

`src/cli.ts` performs `adoptMcpInventory` globally before Commander dispatch, although help/version and recovery diagnostics do not need the inventory.

## Steps

- [ ] Gate inventory adoption by the actual command need, preserving a single adopted environment where relevant.
- [ ] Add public CLI tests for malformed MCP configuration across help/version/doctor and inventory-consuming commands.
- [ ] Document the recovery behavior if user-facing guidance changes.

## Files touched

`src/cli.ts`, MCP inventory integration tests, and relevant documentation.

## Verify

Focused startup tests, type check, Biome, and full coverage gate pass.

## Dependencies / blocks

None; no external MCP service is contacted by tests.

## Documentation impact

### Decision Records

No new decision; this preserves CLI recovery access under invalid local configuration.

### Specifications

State which entrypoints remain usable under malformed MCP configuration.

### Guides

Update troubleshooting text only if it currently implies global startup failure.

### Roadmap

Record delivery here; no known follow-on.

## Discussion

### Dispatch boundary

Help and version are parser-level requests; doctor must inspect broken configuration rather than be stopped by an unrelated preflight.
