---
id: KI-TOOL-CLI-015
title: Modularize CLI command and contract layout
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make the command implementation and CLI-contract test layout mirror the public `ki` grammar, so each command family has a focused, discoverable home without changing the CLI contract.

## Context

`src/commands/` already has focused directories for `agora`, `manage`, `registry`, and `repo`, but several root command families remain flat modules: `acquire`, `bootstrap`, `dev`, `harness`, `skill`, and `trade-command`.

The same flat area also contains cross-cutting command assembly in `root.ts`, command inventories in `catalogue.ts`, and the harness-only helper `harness-refresh.ts`.

`src/tests/cli/` is similarly a large flat collection of command contracts and repository-operation scenarios, even where its test names already identify an unambiguous public command family.

## Boundary

Preserve every public command name, option, output, completion candidate, exit code, generated artefact, and in-process CLI-contract testing seam.

Do not introduce compatibility commands, alter command semantics, replace CLI contracts with unit tests of internal modules, or implement the separate recursive shell-completion scope in KI-TOOL-CLI-014.

## Current state

The largest remaining flat command module is `src/commands/trade-command.ts`; `dev.ts`, `harness.ts`, and `bootstrap.ts` also combine command registration with domain helpers.

`root.ts` assembles root factories from the flat modules, while `catalogue.ts` carries inventories and summaries for multiple command families.

CLI tests use the required `run(args, context)` sandbox seam, but test files for root command families, repository operations, lifecycle behaviour, and command inventory remain peers in one directory rather than an ownership-oriented hierarchy.

## Steps

- [ ] Define the target source and test directory conventions from the public command grammar, including the explicit homes of root assembly, command catalogues, shared CLI test helpers, and cross-cutting repository-operation contracts.
- [ ] Move each flat root command family into a focused directory with a narrow entry module and colocate helpers with their owning family, including `harness-refresh` under harness and the trade route and record operations under trade.
- [ ] Split root assembly and command inventory data by their owning grammar surface while preserving the one authoritative public registration and completion inventory boundary.
- [ ] Re-home CLI-contract tests beneath matching command-family or cross-cutting operation directories without changing the sandbox seam, fixture ownership, assertions, or coverage scope.
- [ ] Update imports, developer documentation, and test discovery so no active flat command or CLI-contract test layout remains outside the agreed shared entry-point or helper locations.
- [ ] Prove unchanged public grammar, outputs, completions, and error behaviour through focused contracts and the full repository gate.

## Files touched

- `src/commands/`
- `src/tests/cli/`
- `docs/developer/local-development.md`
- This roadmap item

## Verify

- Focused CLI-contract suites for every moved command family and cross-cutting repository operation pass through `run(args, context)`.
- `bun run test:coverage` retains the repository's enforced 100% thresholds.
- `bunx tsc --noEmit`, `bunx biome check .`, Markdown lint, and man-page checks pass.
- `ki --help`, every root command-family `--help`, `ki manage completion bash`, and `ki manage completion zsh` preserve their current grammar and completion inventories.

## Dependencies / blocks

This is a self-contained structural refactor.

It intentionally precedes KI-TOOL-CLI-014 so the recursive completion grammar lands on a stable command and test ownership layout.

## Discussion

### Public grammar is the ownership boundary

The public grammar, rather than a source-file historical accident, should decide where a command and its contract tests live.

Each root command family should have one focused implementation home; command-family helpers remain there unless they are genuinely cross-cutting and have an explicit shared owner.

### CLI contracts remain black-box tests

Moving a test file must not weaken the repository rule that the CLI API is tested through `run(args, context)` and sandboxed filesystem effects.

Internal implementation helpers may become smaller and more focused, but their existence does not authorise direct unit tests that would fossilise module boundaries.

### Completion work stays separate

This item keeps the existing completion contract aligned while moving its inputs.

KI-TOOL-CLI-014 remains responsible for deriving complete recursive command and option completion from the registered grammar.
