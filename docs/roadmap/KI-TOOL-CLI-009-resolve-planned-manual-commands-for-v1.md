---
id: KI-TOOL-CLI-009
title: Resolve planned manual commands for V1
theme: cli
horizon: blocking
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 84c88ca5ed39f8e2af5b42874a417aba6020095b
---

## Context

Promote `ki search`, `ki cleanup`, and `ki docs` into the intended V1 public surface, then implement them. The manual and changelog publish that surface ahead of implementation so review has one complete V1 command inventory rather than a mixture of shipped and `*`-prefixed entries.

`ki search` searches the installed local capability set, `ki cleanup` removes only explicitly KI-owned stale state, and `ki docs` prints an appropriate KI documentation location. Their operational contracts are deliberately local-first and deterministic.

## Boundary

Do not broaden these commands into external marketplace search, browser automation, or destructive unmanaged-file removal. The changelog remains a concise V1 command baseline; options and operational detail belong in `ki(1)` and user guides.

## Current state

The source currently registers none of these commands. The manual and changelog now name them as intended V1 commands; implementation follows the reviewed local capability-search, managed-cleanup, and documentation-routing contracts below.

## Steps

1. Publish `ki search`, `ki cleanup`, and `ki docs` in the manual and changelog, remove the obsolete `*` marker explanation, and make the manual describe the intended V1 surface.
2. Implement the locked contracts with black-box CLI tests and update help, completions, manual, and user guides.
4. Render and inspect the manual, then verify the runtime exposes each command without any `*`-prefixed planned interface.
5. Perform a post-implementation CLI-surface audit: compare command registration, root and command help, completion inventory, documentation, and black-box contracts against the intended V1 command inventory. Record and resolve every discrepancy before acceptance.

## Files touched

- `src/commands/`, `src/tests/cli/`, completions, and relevant core modules
- `man/ki.1`, `CHANGELOG.md`, README, and user guides

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `mandoc -Tutf8 man/ki.1 | col -b` renders the intended V1 manual.
4. `rg '\\\*ki (search|docs)|unreleased development surface' man/ki.1` has no matches.

5. The post-implementation CLI-surface audit finds no undocumented command, documented-but-unregistered command, stale completion, or missing black-box command contract.

## Dependencies / blocks

This item is independent of KI-TOOL-CLI-008’s code changes, but both must complete before further CLI-surface work resumes.

## Delegation

### Locked decisions

- `ki search <query>` requires one non-empty query and searches only verified installed harnesses. It matches case-insensitively against harness identifier, capability kind, and capability name; results are sorted by harness identifier, capability kind, and capability name. It never consults a repository, a remote registry, or the network. No match exits successfully with an explicit empty result.
- `ki cleanup` has no arguments. It may remove only a persisted, versioned KI-owned stale-artifact format. No such format exists in V1, so it reports that no eligible managed stale state exists and makes no filesystem change. It must not infer that transaction-looking directories, cache contents, unconfigured harnesses, links, or unknown files are stale.
- `ki docs [topic]` is read-only and prints a canonical URL; it never launches a browser or fetches content. The supported topics are `overview` (the default), `manual`, and `roadmap`, resolving respectively to the repository overview, tracked `ki(1)` manual, and roadmap URLs. An unknown topic exits with a grammar-style error.
- The manual describes the precise V1 contracts above. The changelog remains a compact command inventory and does not repeat option or output detail.

### Escalate

- Escalate any requirement to delete an existing cache or transaction artefact, open a browser, fetch documentation, search a remote supplier, or discover a repository; none is authorised by this item.

### Rounds

1. **Round 1 — implementation.** One mechanical worker owns all command registration, command modules, local tests, and directly related documentation. The work is serial because `src/cli.ts`, `src/commands/catalogue.ts`, help, completions, and the manual are shared integration points.
2. **Round 2 — integration gate.** The orchestrator reviews the full diff, tests the command contracts, runs the required verification, and performs the explicit CLI-surface alignment audit.

### Worker brief

- **CLI-009 local commands** — class: mechanical; minimum model: `gpt-5.6-terra` at high reasoning, because the worker must integrate three public commands with strict local boundaries and preserve 100% black-box coverage. Scope: `src/cli.ts`, `src/commands/`, focused `src/core/` helpers only when needed, `src/tests/cli/`, `man/ki.1`, README, and user guides. Do not edit roadmap files, `CHANGELOG.md`, unrelated command paths, or any other repository. Done: all three commands are registered, appear in root help and completion output, implement every locked contract, and have black-box CLI tests; the manual and user documentation state the same contracts. Verification: run focused tests, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx @biomejs/biome check` on changed TypeScript, `mandoc -Tutf8 man/ki.1 | col -b`, and `git diff --check`. Checkpoint: report files changed, exact command outputs exercised, verification output, and any escalation. Do not commit.
