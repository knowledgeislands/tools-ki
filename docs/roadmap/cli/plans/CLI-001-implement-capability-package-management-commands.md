---
id: 'CLI-001'
title: Implement capability package-management commands
status: in-progress
roadmap: cli/implement-capability-package-management-commands
blocks: —
blocked-by: —
baseline-ref: 0cd15ad372b5050c6f2be014d0131a337a93f1c8
---

## Context

ADR-KI-TOOLS-002 reserves the public capability package-management vocabulary, but the executable currently exposes only harness-level installation and inspection plus scoped skill activation. Deliver the named top-level forms through the existing verified-harness registry without reintroducing legacy dispatch or blurring user and repository activation boundaries.

## Current state

- `ki --help` does not expose `list`, `missing`, `outdated`, `install`, `reinstall`, `uninstall`, `update`, or `upgrade`.
- `ki harness` already provides verified harness installation, inventory, inspection, and non-canonical removal; it is the lower-level capability source for the new surface.
- ADR-KI-TOOLS-002 defines the intended inventory, status, maintenance, and CWD-resolved upgrade roles, but not their implemented CLI contract.

## Steps

1. Define the exact argument, output, exit-code, and scope contracts for every new top-level form from ADR-KI-TOOLS-002, distinguishing harness inventory from capability inventory and refusing ambiguous, unverified, or out-of-scope targets.
2. Implement the read-only inventory and status forms (`ki list`, `ki missing`, and `ki outdated`) through injected context capabilities and the installed-harness registry.
3. Implement the maintenance and upgrade forms (`ki install`, `ki reinstall`, `ki uninstall`, `ki update`, and CWD-resolved `ki upgrade`) with explicit verified-harness acquisition, user/repository activation boundaries, and safe mutation semantics.
4. Register the forms in the root CLI, update HELP, completions, and `ki(1)`, and keep planned or unavailable forms out of the public surface until their contract tests and release evidence exist.
5. Add CLI-contract coverage for successful, unavailable, ambiguous, unsafe, dry-run, and mutation cases; run the complete quality gate.

## Files touched

- `src/cli.ts` and command modules for the new public forms
- Registry, harness, resolver, and activation modules required by the settled contracts
- `src/tests/cli/` contract tests and shared CLI fixtures
- `man/ki.1`, completion output, and relevant user documentation

## Verify

1. `ki --help` and every new command's `--help` expose only the settled public grammar.
2. CLI-contract tests show that read-only forms do not mutate state; mutations honour verified-harness and explicit-scope boundaries; unavailable or ambiguous requests fail clearly.
3. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` pass.

## Dependencies / blocks

The work depends on the existing verified-harness registry and ADR-KI-TOOLS-002 vocabulary, both already present. It has no plan dependency and is independent of CLI-002.
