---
id: KI-TOOL-CLI-012
title: Make bootstrap failure local-mode safe
theme: cli
horizon: blocking
status: acceptance
blocks: []
blocked-by: []
baseline-ref: 887fbfae8bab1b5a4d121110e1ee3b0dcf4bedae
---

## Context

Prevent `ki bootstrap` from leaving a configured local development harness half-disabled when the archive bootstrap path fails. The observed failure restores the installed archive payload, then fails while loading its incomplete core-skill set before it can refresh user-skill links or reconcile `[local]`. That leaves local user-skill links, a configured local source, and an inactive local projection; `ki doctor` consequently reports target mismatches.

## Boundary

This item does not change the eight-skill bootstrap contract, silently accept an incomplete archive, alter unrelated harness installation policy, or make local development the default bootstrap mode. It does not block `KI-TOOL-CLI-011`; the two items touch distinct command paths.

## Current state

`ki bootstrap` calls `restoreCanonicalHarness` before it resolves the archive's bootstrap skills. Restoring removes an active local payload projection and installs or reuses the archive. If `installedBootstrapSkillSources` or a later projection/configuration step fails, the command has no rollback: `[local]` and existing local links remain while the archive is active. The current `ki doctor` report also treats a linked configured skill whose archive capability cannot be resolved as healthy because it has no expected target to compare.

## Steps

1. Establish an atomic bootstrap transition around archive restoration, core-skill validation, user-skill projection, and local-configuration reconciliation; on a failure after an active local projection is displaced, restore that projection and retain a self-consistent local configuration and managed links.
2. Ensure bootstrap rejects or diagnoses incomplete archive core-skill inventory before declaring a successful archive transition, with actionable error output that distinguishes archive incompleteness from a local-link problem.
3. Make `ki doctor` fail explicitly when a configured managed skill cannot be resolved from the active expected source, rather than treating the absence of an expected target as a linked pass.
4. Add CLI-contract coverage for an active local harness followed by a failing bootstrap archive path, asserting the post-failure payload links, configuration, and user-skill targets remain consistent; cover the unresolved-skill Doctor diagnostic.
5. Exercise the full local/installed transition matrix: repeated `dev local on` → `off` → `on` → `off` cycles, installed-harness refresh/reprojection, and failure at each transition boundary. Each successful or failed transition must leave one coherent mode—payload, managed user-skill links, configuration, and Doctor report agree on the same active source.

## Files touched

- `src/commands/bootstrap.ts`
- `src/core/registry.ts`
- `src/agents/bootstrap.ts`
- `src/commands/doctor.ts`
- `src/tests/cli/bootstrap.test.ts`
- `src/tests/cli/dev.test.ts`
- `src/tests/cli/doctor.test.ts`

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --skill ki-roadmap --repo .`

## Dependencies / blocks

This is a Blocking local-mode reliability fix with no work-item dependency. It does not block the independently Ready workspace-registration feature, but it should take precedence when working on local-development lifecycle safety.

## Delegation

One fresh serial implementation worker (`gpt-5.6-sol`, high reasoning) owns bootstrap, registry, Doctor, and their CLI tests. Locked: preserve the eight-skill contract and leave all four state surfaces coherent after every successful or failed transition. Escalate any solution that requires weakening archive validation, changing default local-mode policy, or recovering by deleting user-owned content. Done means focused failure-injection and transition tests pass, then the full suite, typecheck, style check, and roadmap audit pass. The worker stops before commit for orchestrator review.

## Acceptance

Delivered in `dcdb1bc fix(bootstrap): preserve local mode on failure`.

- Canonical restoration stages and validates its exact eight-skill inventory before replacing an active local projection; bootstrap rolls configuration and managed links back if a later transition step fails.
- `bootstrap --refresh` now preserves both remembered `[local]` and `[repositories]` settings, and Doctor reports an unresolvable configured source as a failure.
- CLI coverage exercises archive failure during active local mode, repeated local/on/off failure cycles, managed-link rollback, and the unresolved-source Doctor diagnostic.

Verified with `bun run test --coverage` (434 passing; 100% statements, branches, functions, and lines), `bunx tsc --noEmit`, `bunx biome check`, `git diff --check`, and `ki repo audit --skill ki-roadmap --repo .`.

No release, push, or lifecycle closure has been performed.

## Discussion

### Failure sequence

The local projection is valid only when the installed canonical harness payload contains exactly the three expected local symlinks. `restoreCanonicalHarness` removes that projection before the bootstrap command verifies that the archive supplies every required core skill. A failure after that mutation leaves user-facing state split between the old local projection and the newly active archive.

### Recovery contract

The failure boundary must be recoverable: either preflight every failure-prone archive condition before displacing local mode, or reliably reinstate the original local projection and managed skill links on failure. The final contract must never leave a configured `[local]` source while its harness projection is inactive.

### Doctor expectation

Doctor must distinguish a link that matches a verifiable active source from a configured skill whose active source cannot provide the declared capability. The latter is an inventory/configuration failure, not a healthy link.

### Transition matrix

The local-development lifecycle has four externally visible state surfaces: the installed harness payload, managed user-skill links, the user configuration, and Doctor's resolved source. Tests must cover repeated local-to-installed and installed-to-local transitions, archive refreshes, and injected failures after each mutation boundary. No path may leave these surfaces describing different modes.
