---
id: KI-TOOL-CLI-001
title: Harden user harness installation and runtime skill publication
theme: cli
horizon: next
status: done
blocks: []
blocked-by: []
baseline-ref: b99387b600abd0041e1253b2a09429a855b1e2db
---

## Context

Make canonical-harness core-skill publication fail-safe while retaining runtime-selected projection through `ki bootstrap` and `ki dev`.

## Boundary

This item does not change harness-owned hook state or introduce a hook-installer subprocess.

## Current state

Bootstrap and `ki dev` use the in-process `installBootstrapSkills` boundary. The compatible harness keeps hook state outside these commands. Foreign core-skill links are now refused instead of replaced silently; no harness handoff is required.

## Steps

1. ✓ Map bootstrap, skill-linking, agent-runtime, and hook boundaries and their failure paths.
2. ✓ Retain the import-safe direct publication boundary; no compatible hook-installer subprocess exists.
3. ✓ Remove unconditional replacement from bootstrap and development re-projection.
4. ✓ Add black-box coverage proving bootstrap preserves a foreign core-skill link.
5. ✓ Run complete CLI verification; no user-facing documentation changes were required because the refusal diagnostic already explains intentional replacement.

## Files touched

- `src/commands/bootstrap.ts`
- `src/commands/dev.ts`
- `src/tests/cli/bootstrap.test.ts`

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`

## Dependencies / blocks

This item has no dependency or downstream block.

## Acceptance

### Delivered

- Bootstrap and `ki dev` retain the in-process `installBootstrapSkills` publication boundary.
- Bootstrap and development re-projection refuse to replace a foreign core-skill link.
- Black-box coverage proves that bootstrap preserves a foreign core-skill link.

### Summary of changes

Foreign core-skill links are preserved instead of being silently replaced during bootstrap or development re-projection. The primary changes are in `src/commands/bootstrap.ts`, `src/commands/dev.ts`, and `src/tests/cli/bootstrap.test.ts`.

### Verification

- `bun run test` — 24 test files and 378 tests passed.
- `bun run test:coverage` — 24 test files and 378 tests passed; statements, branches, functions, and lines each reached 100% coverage.
- `./bin/ki repo audit --repo .` — passed with no FAIL or WARN findings.

Verification was re-run at `8d20ce35f9ad4ce5918feb5b5c3baee28c8afb6c`.

### Outstanding concerns

None. Compatible-harness hook state remains intentionally outside bootstrap and development projection.

### Mini recap

The direct publication boundary is safe when an unmanaged core-skill link is present: refusal is preferable to silent replacement. No follow-up route is proposed.

## Done

Accepted by the user on 2026-07-29. Core-skill publication now preserves foreign links rather than replacing them silently. No residual concern or follow-up is intended.
