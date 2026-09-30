---
id: KI-TOOL-CLI-093
area: CLI
title: Validate enumerated options
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: dad7a43d31dfe257b2d6cbefa9812e27f8b3b324
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T12:02:38Z
---

# KI-TOOL-CLI-093: Validate enumerated options

## Goal

Invalid CLI filter and output-format values fail clearly instead of appearing to produce valid empty results or inconsistent parser errors.

## Context

Roadmap `list` accepts any horizon or status string, trade `list` accepts any status string, and unsupported values silently filter to zero results. Output-format options are validated partly by command actions and partly by Commander choices, yielding different error presentations.

## Boundary

Preserve valid filter semantics and JSON report shape. Do not broaden filtering or add aliases.

## Current state

`src/core/work/operations.ts` filters strings directly; `src/commands/trade/records.ts` forwards status unchecked. Roadmap, registry, store, and MCP format options use mixed validation paths.

## Steps

- [x] Validate enumerated roadmap and trade list options at the command grammar boundary before inventory work.
- [x] Make unsupported `--format` values use the same CLI error shape across affected commands.
- [x] Add public `run(args, context)` tests for invalid and valid values, then reconcile help and manual wording.

## Files touched

`src/commands/repo/roadmap.ts`, `src/commands/trade/records.ts`, format-option command modules, CLI tests, and user-facing command documentation where needed.

## Verify

Focused CLI suites, `bunx tsc --noEmit`, Biome, generated command-inventory check, and `bun run test:coverage` pass; invalid filters return code 2 and an actionable error.

## Dependencies / blocks

None. This is independent of role-free Agora and KB search contracts.

## Documentation impact

### Decision Records

No durable architectural decision; this corrects existing grammar.

### Specifications

Clarify accepted filter values and invalid-input outcome in relevant CLI specifications.

### Guides

Keep the manual and help aligned with accepted options.

### Roadmap

Record delivery here; no known follow-on item.

## Review

### Delivered

The approved grammar correction is implemented from baseline `dad7a43d31dfe257b2d6cbefa9812e27f8b3b324`. No valid filter behavior or JSON report shape changed.

### Change Summary

Roadmap and trade commands reject unsupported filters before inventory; store and MCP lists now use the same grammar-error presentation for invalid formats. Completion offers the actual trade decision statuses and the Triage roadmap horizon. CLI tests, specifications, manual, and generated command inventory are updated.

### Verification

Focused CLI suites passed. `bunx tsc --noEmit`, Biome on changed TypeScript, manual lint, and generated inventory check passed. `bun run test:coverage -- --reporter=dot` passed 938 tests with 100% statements, branches, functions, and lines.

### Outstanding concerns

Independent review and acceptance remain. No known implementation failure remains.

### Post-change review

Unknown values no longer look like an empty successful query. Existing valid outputs remain covered by public CLI tests; the item is ready for review.

### Mini recap

CLI grammar, completion, tests, specifications, and manual inventory are aligned. No further learning route is required beyond review of this delivery.

## Done

Accepted 2026-09-30 by Kris Brown on the review packet above.

## Discussion

### Error convention

Use the existing `ki: error:` grammar-error presentation where command actions already use it, without changing successful output.
