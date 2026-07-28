---
id: 'KI-CLI-CLI-001'
title: Harden user harness installation and runtime skill publication
status: in-progress
roadmap: cli/harden-user-harness-installation-and-runtime-skill-publication
blocks: —
blocked-by: —
baseline-ref: b99387b600abd0041e1253b2a09429a855b1e2db
---

## Context

`ki bootstrap` owns the user-level contract for restoring the canonical harness and projecting its core skills into supported runtimes. This work makes that publication path fail-safe and runtime-selected while preserving unrelated user-owned files and refusing unsafe filesystem parents.

## Current state

Bootstrap and `ki dev` restore or reproject core skills through the existing in-process `installBootstrapSkills` boundary. The compatible harness has no local hook-installer to invoke: its hook guidance explicitly keeps hook-state ownership outside these commands. Core-skill projection now retains the normal KI-managed-link contract but refuses a foreign link instead of silently replacing it; no harness handoff is required.

## Steps

1. ✓ Map the current bootstrap, skill-linking, agent-runtime, and hook-installer boundaries, including their existing CLI contract tests and failure paths.
2. ✓ Retain the import-safe direct publication boundary; no hook-installer subprocess exists in the compatible harness, and its hook state remains out of scope.
3. ✓ Remove unconditional replacement from bootstrap and development re-projection; no compatible harness change or handoff is required.
4. ✓ Extend in-process CLI contract coverage to prove bootstrap preserves a foreign core-skill link while existing success, managed-link, and unsafe-parent coverage remains in place.
5. ✓ Run the complete CLI verification set. No user-facing documentation changes because the existing refusal diagnostic already instructs an intentional `--replace` workflow.

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
