---
id: KI-TOOL-CLI-094
area: CLI
title: Keep previews read-only
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T09:46:47Z
---

# KI-TOOL-CLI-094: Keep previews read-only

## Goal

Dry-run commands leave the filesystem unchanged, and command help makes each preview/apply default explicit.

## Context

`ki registry add --dry-run` and `ki repo repair --dry-run` create the XDG state directory while preparing a preview. Registry add applies by default, whereas store mutation and VS Code sync require `--write`; the differing defaults are not always obvious from help.

## Boundary

Keep existing apply defaults and flags; silently reversing mutating commands would be a separate public-contract decision. Do not change actual apply behavior.

## Current state

Both affected commands call `mkdir` before `publishWrites` receives the dry-run flag. Other write-preview surfaces use `--write` by design.

## Steps

- [ ] Prepare dry-run registry and repair output without creating the state directory or other managed paths.
- [ ] Add public CLI tests that assert absent directories remain absent after previews and that real applies still work.
- [ ] Make help/manual text explicit about which commands write by default and which require `--write`.

## Files touched

Registry and repair command modules, relevant CLI tests, README/manual, and specification text where the preview contract is stated.

## Verify

Focused registry and repair tests, type check, Biome, manual lint, and full coverage gate pass.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

No new decision; existing write defaults remain intact.

### Specifications

State the no-write preview invariant.

### Guides

Clarify `--dry-run` versus `--write` defaults in command help and manual.

### Roadmap

Record delivery here; changing write defaults is excluded.

## Discussion

### Safety invariant

Preview must not create XDG directories merely to calculate a proposed write.
