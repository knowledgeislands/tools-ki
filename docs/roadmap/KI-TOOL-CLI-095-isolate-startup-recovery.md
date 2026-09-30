---
id: KI-TOOL-CLI-095
area: CLI
title: Isolate startup recovery
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: ce7e0087ca83f1de79adeeb589a0335bc5be5f6f
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T10:18:10Z
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

- [x] Gate inventory adoption by the actual command need, preserving a single adopted environment where relevant.
- [x] Add public CLI tests for malformed MCP configuration across help/version/doctor and inventory-consuming commands.
- [x] Document the recovery behavior if user-facing guidance changes.

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

## Review

### Delivered

The approved recovery boundary is implemented from baseline `ce7e0087ca83f1de79adeeb589a0335bc5be5f6f`. Strict validation remains for normal command dispatch.

### Change Summary

`src/cli.ts` skips MCP inventory adoption for parser help/version and `manage doctor|diag|repair`, leaving adoption before other command dispatch. Public CLI tests cover malformed binding on both sides; `docs/specs/cli.md` states the recovery exception.

### Verification

Focused MCP inventory tests, TypeScript check, and Biome passed. `bun run test:coverage -- --reporter=dot` passed 939 tests with 100% statements, branches, functions, and lines.

### Outstanding concerns

Independent review and acceptance remain. No known implementation failure remains.

### Post-change review

The CLI remains diagnosable when its MCP binding is malformed, without making ordinary commands accept that binding. The item is ready for review.

### Mini recap

Startup preflight is limited for recovery entrypoints; normal inventory adoption is retained. No follow-on work is proposed from this slice.

## Discussion

### Dispatch boundary

Help and version are parser-level requests; doctor must inspect broken configuration rather than be stopped by an unrelated preflight.
