---
id: KI-TOOL-CLI-059
area: CLI
title: Inspect editor projection drift
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: eddb7e2dd824bf73b37a7b200d3c0f23ee15e905
---

# Inspect editor projection drift

## Goal

Compare one resolved Agora with one explicitly selected local editor workspace and explain projection drift without modifying the editor or repository estate.

## Context

`ki agora open` projects a resolved Agora into Zed or VS Code through Agora-owned target adapters. It cannot inspect a target in reverse or classify missing declared members, extra registered repositories, external paths, or unregistered KI repositories. VS Code exposes durable `.code-workspace` files; Zed retains local workspaces in an application-owned SQLite database whose schema is not a portable API.

## Boundary

The implementation must not write editor state, guess the active or most-recent workspace, promise restoration of a closed window, treat editor grouping as repository consent, store local paths in portable declarations, or hide unknown external folders. The Zed adapter must open its database read-only. `--target` and `--workspace` are explicit: for VS Code, `<selector>` is an absolute `.code-workspace` file; for Zed, it is an explicit decimal workspace identifier detected in the stable or preview local database. Exit status is `0` for an exact projection, `1` for drift or unsupported observation, and `2` for invalid grammar, selectors, or Agora resolution.

## Current state

Agora-owned target adapters expose only an open operation. The local registry and reciprocal resolver can identify selected Agora members and every registered KI repository, while repository declarations can distinguish an unregistered KI checkout from an external folder. The command surface has no projection-observation model, reverse adapter contract, or target-neutral drift classification.

## Steps

- [x] Extend `core/agora/targets` with a target-neutral observation model and adapter contract alongside the open contract.
- [x] Implement VS Code workspace parsing and physical path normalization with support for paths containing spaces.
- [x] Implement guarded, read-only Zed workspace observation for explicit workspace identifiers and known schemas.
- [x] Add deterministic comparison and classification against the resolved Agora and local registry.
- [x] Add `ki agora inspect`, terminal reporting, completion, specification, and privacy documentation.
- [x] Add fixture-driven CLI tests for exact, missing, extra, external, unregistered, malformed, unsupported-schema, and unavailable-target cases.

## Files touched

- `src/core/agora/targets/`
- `src/core/agora/projection.ts`
- `src/commands/agora/`
- `src/tests/cli/agora/`
- `src/tests/cli/manage/`
- `src/tests/cli/root/`
- `docs/decisions/`
- `docs/specs/agoras.md`
- `README.md`
- `man/ki.1`
- `docs/roadmap/KI-TOOL-CLI-059-inspect-editor-projection-drift.md`

## Verify

- Tests use fixture workspace files and databases rather than the user's live editor state.
- Read-only evidence proves neither adapter writes its selected source.
- Accessible terminal text distinguishes every classification without relying only on icons or colour.
- `bun run test:coverage`, `bun run build`, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip --reporter compact`, man-page lint, and the complete repository audit pass.

## Dependencies / blocks

No local work-item dependency. The implementation consumes the existing canonical Agora resolver and target adapter boundary. It is independent of `KI-TOOL-CLI-058`, although delivering audit first settles their shared command, documentation, completion, and test surfaces.

## Documentation impact

### Decision Records

`ADR-KI-TOOLS-003` records the approved target-observation boundary and fail-closed application-database policy.

### Specifications

Add normative observation, classification, and unsupported-schema behavior to `docs/specs/agoras.md`.

### Guides

Add concise user-facing invocation and privacy guidance to the README and manual. No developer-guide change is required because the existing Agora-owned adapter boundary remains intact.

### Roadmap

Check every delivery step and attach final verification evidence before moving the record to awaiting review.

## Review

### Delivered

Delivered explicit, read-only local editor projection inspection without modifying editor, repository, registry, or Agora declarations. Baseline `eddb7e2dd824bf73b37a7b200d3c0f23ee15e905` became implementation commit `16fd8122a51c113fa0f26f91d17eed6300abfbda`; active-workspace inference, restoration, and portable local-path storage remained excluded.

### Summary of changes

Added target observation contracts, VS Code JSONC workspace decoding, guarded Zed SQLite observation, one target-neutral physical-root classifier, `ki agora inspect`, deterministic accessible reporting, fixture-driven CLI tests, help and completion discovery, specification and user/manual documentation, and `ADR-KI-TOOLS-003` for the approved application-owned read-only boundary.

### Verification

The focused inspect, Agora, help, and completion suites passed 30 tests. The integrated `bun run test:coverage` gate passed all 702 tests at 100% statements, branches, functions, and lines; build, compiled CLI help loading, TypeScript, Biome, Knip, rumdl, man-page lint, the focused `ki-agora` and `ki-decision-records` audits, and the complete 18-skill repository audit passed.

### Outstanding concerns

No blocking concern. Node-hosted CLI coverage exercises the equivalent `node:sqlite` read-only arm; the Bun-specific SQLite import is covered by a justified runtime-host exclusion and verified by the compiled Bun build and CLI load check.

### Post-change review

The implementation keeps target-specific decoding behind Agora-owned adapters and centralizes all projection meaning in one classifier. Explicit selectors, physical-path normalization, fail-closed schema handling, deterministic classifications, and exit statuses match the Ready plan, so the item is ready for acceptance.

### Mini recap

Users can now explain drift between a resolved Agora and one explicit VS Code or Zed workspace without granting mutation authority. The durable application-storage decision is recorded in `ADR-KI-TOOLS-003`; no further learning requires promotion.

## Discussion

The VS Code and Zed adapters remain separable source decoders over one normalized comparison model. Target-specific source selection stays behind the adapter boundary, and unsupported editor state fails closed rather than changing the shared Agora contract.
