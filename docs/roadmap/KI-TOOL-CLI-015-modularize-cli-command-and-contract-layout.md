---
id: KI-TOOL-CLI-015
title: Modularize CLI command and contract layout
theme: cli
horizon: next
status: acceptance
blocks: []
blocked-by: []
baseline-ref: b52f39da94975be86185855510e2a7c8cc79dd62
---

## Goal

Make `src/commands/` and `src/tests/cli/` mirror the same public `ki` grammar, so each command family and its CLI contracts have matching, focused, discoverable homes without changing the CLI contract.

## Context

`src/commands/` already has focused directories for `agora`, `manage`, `registry`, and `repo`, but several root command families remain flat modules: `acquire`, `bootstrap`, `dev`, `harness`, `skill`, and `trade-command`.

The same flat area also contains cross-cutting command assembly in `root.ts`, command inventories in `catalogue.ts`, and the harness-only helper `harness-refresh.ts`.

`src/tests/cli/` is similarly a large flat collection of command contracts and repository-operation scenarios, even where its test names already identify an unambiguous public command family and a matching command source directory already exists.

## Boundary

Preserve every public command name, option, output, completion candidate, exit code, generated artefact, and in-process CLI-contract testing seam.

Do not introduce compatibility commands, alter command semantics, replace CLI contracts with unit tests of internal modules, or implement the separate recursive shell-completion scope in KI-TOOL-CLI-014.

Only shared underscore-prefixed CLI test helpers may remain directly under `src/tests/cli/`; active contract suites must use the corresponding command-family or cross-cutting-operation directory.

## Current state

The largest remaining flat command module is `src/commands/trade-command.ts`; `dev.ts`, `harness.ts`, and `bootstrap.ts` also combine command registration with domain helpers.

`root.ts` assembles root factories from the flat modules, while `catalogue.ts` carries inventories and summaries for multiple command families.

CLI tests use the required `run(args, context)` sandbox seam, but test files for root command families, repository operations, lifecycle behaviour, and command inventory remain peers in one directory rather than the same ownership-oriented hierarchy as `src/commands/`.

## Steps

- [x] Establish and record a clean `bun run test:coverage` baseline before changing either source or test layout.
- [x] Define the public-grammar directory convention for the test hierarchy, then re-home every active CLI-contract suite beneath the matching command-family or cross-cutting-operation directory; only underscore-prefixed shared helpers remain at the test root.
- [x] Run `bun run test:coverage` after the test-only refactor and stop if any metric falls below the enforced 100% threshold.
- [x] Apply the same directory convention to `src/commands/`: move each flat root command family into a focused directory with a narrow entry module, colocate `harness-refresh` under harness and trade route and record operations under trade, and split root assembly and command inventory data by their owning grammar surface.
- [x] Run `bun run test:coverage` again after the command-source refactor and stop if any metric falls below the enforced 100% threshold.
- [x] Update imports, developer documentation, and test discovery; prove unchanged public grammar, outputs, completions, and error behaviour through focused contracts and the final repository gate.

## Files touched

- `src/commands/`
- `src/tests/cli/`
- `docs/developer/local-development.md`
- This roadmap item

## Verify

- Focused CLI-contract suites for every moved command family and cross-cutting repository operation pass through `run(args, context)`.
- `bun run test:coverage` passes at the baseline, after the test-only move, and after the command-source refactor, retaining the repository's enforced 100% thresholds at every checkpoint.
- `bunx tsc --noEmit`, `bunx biome check .`, Markdown lint, and man-page checks pass.
- `ki --help`, every root command-family `--help`, `ki manage completion bash`, and `ki manage completion zsh` preserve their current grammar and completion inventories.

## Dependencies / blocks

This is a self-contained structural refactor.

It intentionally precedes KI-TOOL-CLI-014 so the recursive completion grammar lands on a stable command and test ownership layout.

## Acceptance

The completed boundary moves active CLI-contract suites and command implementations into matching public-grammar directories without changing the public CLI contract.

The immutable baseline is `b52f39da94975be86185855510e2a7c8cc79dd62`; the test-only phase is committed as `c70d929` and the command-source phase as `e277053`.

`bun run test:coverage`, `bunx tsc --noEmit`, Biome, Markdown lint, `mandoc -Tlint man/ki.1`, and `git diff --check` passed after integrating the command-source move and trade split.

No command grammar, completion candidate, lifecycle behaviour, or public output was intentionally changed.

## Discussion

### Public grammar is the ownership boundary

The public grammar, rather than a source-file historical accident, should decide where a command and its contract tests live.

Each root command family should have one focused implementation home; command-family helpers remain there unless they are genuinely cross-cutting and have an explicit shared owner.

### Mirrored test ownership

The test hierarchy must use the same domain names and nesting as the command hierarchy, rather than merely grouping files by a loose test category.

For example, the trade command family and its contracts live under matching `trade/` directories; existing `repo/`, `manage/`, `agora/`, and `registry/` source groups receive corresponding test groups.

Only underscore-prefixed helpers remain directly below `src/tests/cli/`, because they support multiple domains rather than defining a public command.

### CLI contracts remain black-box tests

Moving a test file must not weaken the repository rule that the CLI API is tested through `run(args, context)` and sandboxed filesystem effects.

Internal implementation helpers may become smaller and more focused, but their existence does not authorise direct unit tests that would fossilise module boundaries.

### Completion work stays separate

This item keeps the existing completion contract aligned while moving its inputs.

KI-TOOL-CLI-014 remains responsible for deriving complete recursive command and option completion from the registered grammar.
