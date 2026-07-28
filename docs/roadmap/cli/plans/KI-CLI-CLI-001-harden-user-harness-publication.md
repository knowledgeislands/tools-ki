---
id: 'KI-CLI-CLI-001'
title: Harden user harness installation and runtime skill publication
status: ready
roadmap: cli/harden-user-harness-installation-and-runtime-skill-publication
blocks: —
blocked-by: —
baseline-ref: —
---

## Context

`ki bootstrap` owns the user-level contract for restoring the canonical harness and projecting its core skills into supported runtimes. This work makes that publication path fail-safe and runtime-selected while preserving unrelated user-owned files and refusing unsafe filesystem parents.

## Current state

Bootstrap restores the canonical harness, resolves its core skill sources, and replaces KI-managed user skill links through `src/agents/bootstrap.ts` and `src/agents/skills.ts`. The received Foundation Tooling item asks for an explicit assessment of replacing the harness-local hook-installer subprocess with an import-safe direct call without weakening failure isolation.

## Steps

1. Map the current bootstrap, skill-linking, agent-runtime, and hook-installer boundaries, including their existing CLI contract tests and failure paths.
2. Decide and document the narrow publication boundary: retain a subprocess only where isolation is required, or introduce an import-safe direct call with equivalent runtime selection and containment guards.
3. Implement the selected boundary in the CLI and, if a compatible harness change is required, prepare a bounded recipient handoff rather than editing an unowned harness surface.
4. Extend in-process CLI contract tests for successful projection, managed-link replacement, unsafe-parent refusal, and preservation of unrelated user files.
5. Run the complete CLI verification set and update only the user-facing documentation that changes with the resulting contract.

## Files touched

- `src/agents/bootstrap.ts`, `src/agents/skills.ts`, and directly related runtime-resolution modules
- `src/tests/cli/bootstrap.test.ts`, `src/tests/cli/skill.test.ts`, and focused CLI fixtures
- `docs/guides/user/` only if observable bootstrap behaviour changes
- `+/_HANDOFFS/` only if a compatible harness-owned change is required

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. Exercise the affected bootstrap contracts through `sandbox()` tests, including unsafe-parent and unrelated-file cases.

## Dependencies / blocks

No plan-level dependency blocks this work. Any required hook-installer change remains owned by the KI Agentic Harness and must be handed off with an explicit recipient scope.
