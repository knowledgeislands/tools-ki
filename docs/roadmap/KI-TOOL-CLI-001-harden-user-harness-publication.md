---
id: KI-TOOL-CLI-001
title: Harden user harness installation and runtime skill publication
theme: cli
horizon: next
status: in-progress
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
