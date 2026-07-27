---
id: 'CLI-001'
title: Deliver `ki list` capability inventory
status: in-progress
roadmap: cli/deliver-ki-list-capability-inventory
blocks: —
blocked-by: —
baseline-ref: 0cd15ad372b5050c6f2be014d0131a337a93f1c8
---

## Context

`ki list` is the first package-management command suitable for V1: it makes the verified installed capability inventory and active user or repository skill declarations visible without changing state or introducing a release-update model that does not yet exist.

## Current state

- `ki harness list` reports only installed harness counts; it does not show supplied capabilities or active user and repository declarations together.
- User activation is recorded in the user configuration, and repository activation is recorded in a resolved repository's `.ki-config.toml`.
- The other reserved package-management commands require distinct desired-state, lifecycle, or release-update contracts and are tracked separately on the roadmap.

## Steps

1. ✓ Settle the `ki list` contract: it takes no arguments or options, does not fetch or mutate, inventories verified installed harnesses and their capabilities, lists declared user skills, and lists declared repository skills only when CWD resolves a KI repository.
2. ✓ Implement the command through injected context capabilities and existing installed-harness, user-configuration, and repository-declaration readers; retain existing errors for unsafe inventory and invalid declaration inputs.
3. ✓ Add CLI-contract coverage for populated and empty inventory, user activation, CWD-resolved repository activation, no resolved repository, invalid grammar, and no-mutation behaviour.
4. ✓ Register `ki list` in the root CLI, HELP, completions, `ki(1)`, and the V1 changelog baseline; leave all unimplemented package-management commands out of the public surface.
5. ✓ Run the complete quality gate and verify representative populated and empty sandboxes.

## Files touched

- `src/commands/list.ts`, root command registration, and completion catalogue
- `src/tests/cli/` list, HELP, and completion contracts
- `CHANGELOG.md`, `man/ki.1`, and relevant user documentation
- `docs/decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md`

## Verify

1. `ki list` produces a deterministic, read-only inventory and includes repository activation only in a resolved KI repository.
2. CLI-contract tests exercise the in-process `run(args, context)` seam and assert stdout, exit code, and no on-disk mutation.
3. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` pass.

## Dependencies / blocks

This plan uses the existing verified installed-harness inventory and explicit activation records. It has no plan dependency.

## Delegation

- Locked contract: `ki list` is a no-argument, read-only, no-network root command. It reports installed verified harnesses with their capabilities, declared user skills, and declared repository skills only when the context already resolves a KI repository. It does not add `missing`, `outdated`, lifecycle, update, or upgrade semantics.
- Round 1 — mechanical: implement the command and CLI contracts; files: `src/commands/list.ts`, `src/cli.ts`, `src/commands/catalogue.ts`, and `src/tests/cli/{list,help,completions}.test.ts`; minimum model: `gpt-5.6-terra` (the contract and existing seams are explicit); definition of done: focused contracts pass and the output is deterministic, read-only, and uses no fetcher; gate: orchestrator reviews the diff and reruns the focused suite before documentation work; checkpoint: report the changed paths, contract output, and focused-test result.
- Escalate: any need to infer a desired capability set, compare releases, mutate activation, add network access, or expose another reserved command.
- Round 2 — orchestrator: review the worker diff, complete documentation and changelog updates, run final verification, and commit only the gated work.
