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

## Discussion

### Authority model

Native commands may provide deterministic inspection and carefully bounded orchestration, but they must not become an alternate lifecycle authority. The harness remains responsible for work-item format and lifecycle semantics; any mutating command needs an explicit confirmation model and auditable ownership boundary.

### Alternatives

CLI-003 may satisfy the inspection portion through `ki repo plan list`. This item should be narrowed, superseded, or reshaped only after that delivered contract makes the remaining operational gap concrete; it must not duplicate inventory merely to expose a larger command group.

### Promotion condition

Revisit this candidate after CLI-003 and CLI-004 establish the inventory and workspace experience, with evidence of a coordination action that cannot remain an agent-process operation.
