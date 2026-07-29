---
id: KI-TOOL-CLI-007
title: Add roadmap-item supercommands
theme: cli
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Define native `ki repo` supercommands for inspecting and operating governed roadmap items so a user can coordinate the repository queue from the CLI rather than relying exclusively on an agent process skill.

## Boundary

Do not duplicate or silently bypass harness-owned work-item lifecycle semantics. Settle the exact command grammar, authority boundary, confirmation model, and relationship to `ki-plan` before this candidate enters an executable horizon.
