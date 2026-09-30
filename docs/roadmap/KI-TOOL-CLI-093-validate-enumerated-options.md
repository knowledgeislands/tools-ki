---
id: KI-TOOL-CLI-093
area: CLI
title: Validate enumerated options
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T09:46:47Z
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

- [ ] Validate enumerated roadmap and trade list options at the command grammar boundary before inventory work.
- [ ] Make unsupported `--format` values use the same CLI error shape across affected commands.
- [ ] Add public `run(args, context)` tests for invalid and valid values, then reconcile help and manual wording.

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

## Discussion

### Error convention

Use the existing `ki: error:` grammar-error presentation where command actions already use it, without changing successful output.
