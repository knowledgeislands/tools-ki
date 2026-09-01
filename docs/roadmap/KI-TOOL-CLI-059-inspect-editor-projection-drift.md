---
id: KI-TOOL-CLI-059
area: CLI
title: Inspect editor projection drift
theme: cli
horizon: next
status: in-progress
blocks: []
blocked_by: []
baseline_ref: eddb7e2dd824bf73b37a7b200d3c0f23ee15e905
---

# Inspect editor projection drift

## Goal

Compare one resolved Agora with an explicitly selected local editor workspace and explain projection drift without modifying the editor or repository estate.

## Context

`ki agora open` projects a resolved Agora into Zed or VS Code through Agora-owned target adapters. It cannot inspect a target in reverse or classify missing declared members, extra registered repositories, external paths, or unregistered KI repositories. VS Code exposes durable `.code-workspace` files; Zed retains local workspaces in an application-owned SQLite database whose schema is not a portable API.

## Boundary

The implementation must not write editor state, guess an active or most-recent workspace, promise restoration of a closed window, treat editor grouping as repository consent, store local paths in portable declarations, or hide unknown external folders. The Zed adapter must open its database read-only and fail before reading workspace data when its explicitly supported schema is absent.

## Current state

The Agora target boundary supports opening but not observation. `ki agora inspect <agora> --target <zed|vscode> --workspace <selector>` will normalize observed physical roots and report exact, missing, extra registered, external, and unregistered KI paths. For VS Code, `<selector>` is an absolute `.code-workspace` file. For Zed, it is an explicit decimal workspace identifier from the detected stable or preview local database. Exit status will be `0` for an exact projection, `1` for drift or unsupported observation, and `2` for invalid grammar, selectors, or Agora resolution.

## Steps

- [ ] Extend `core/agora/targets` with a target-neutral observation model and adapter contract alongside the open contract.
- [ ] Implement VS Code workspace parsing with physical path normalization and support for paths containing spaces.
- [ ] Implement guarded, read-only Zed workspace observation for explicit workspace identifiers and known schemas.
- [ ] Add deterministic comparison and classification against the resolved Agora and local registry.
- [ ] Add `ki agora inspect`, terminal reporting, completion, specification, and privacy documentation.
- [ ] Add fixture-driven CLI tests for exact, missing, extra, external, unregistered, malformed, unsupported-schema, and unavailable-target cases.

## Files touched

- `src/core/agora/targets/`
- `src/commands/agora/`
- `src/tests/cli/agora/`
- `docs/specs/agoras.md`
- `README.md`

## Verify

- Tests use fixture workspace files and databases rather than the user's live editor state.
- Read-only failure injection proves that neither adapter writes its selected source.
- Accessible terminal text distinguishes every classification without relying only on icons or colour.
- `bun run test:coverage`, `bun run build`, and the complete repository audit pass.

## Dependencies / blocks

No local work-item dependency. The implementation consumes the existing canonical Agora resolver and target adapter boundary. It is independent of `KI-TOOL-CLI-058`, although delivering the audit first would give users a useful preflight.

## Documentation impact

### Decision Records

Record an architecture decision only if implementation requires a target-observation dependency or application-database policy not already captured by the Agora adapter boundary.

### Specifications

Add normative observation, privacy, classification, and unsupported-schema behavior to `docs/specs/agoras.md`.

### Guides

Add concise target examples and limitations to the README. Do not document application-owned database layout as a portable KI contract.

### Roadmap

Check each delivery step and attach fixture-driven verification evidence before moving the record to awaiting review.

## Discussion

VS Code and Zed observation share one normalized comparison model but retain target-specific source selection. Their adapter tests are separable implementation lanes after the command contract is fixed, and their review remains joined because both publish the same classification and exit semantics.
