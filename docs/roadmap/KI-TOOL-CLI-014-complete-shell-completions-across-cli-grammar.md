---
id: KI-TOOL-CLI-014
title: Complete shell completions across the CLI grammar
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Let Bash and Zsh users discover every supported `ki` command, subcommand, and applicable option from the shell, including the full `ki acquire chatgpt import` path and repository selectors such as `--repo`.

## Context

`ki manage completion bash` and `ki manage completion zsh` currently emit a shallow, hand-authored completion surface. They offer root commands and only the immediate subcommands of `repo`, `manage`, `agora`, and `registry`. Consequently, `ki acquire` offers no `chatgpt` candidate, no deeper acquisition syntax is discoverable, and no command offers options such as `--repo`, `--agora`, or `--output`.

The runtime grammar is materially deeper than that surface: it includes nested paths such as `ki acquire chatgpt import`, `ki repo skill add`, `ki trade routes add`, and `ki dev local set`. Commander accepts the repository selection options both before and after a repository operation, so a complete interface must offer `--repo` and `--agora` at either valid position rather than treating options as a root-only concern.

The existing CLI-contract tests inspect generated script text and verify only the limited inventories above. They do not assert recursive command coverage, option coverage, option-value behavior, or parity between help and shell completion grammars.

## Boundary

Support Bash and Zsh only; `ki manage completion` continues to reject unsupported shells, including Fish. Do not alter command semantics, introduce a completion-installation command, make network requests from a completion script, or guess values for unconstrained identifiers. Dynamic application-state values, such as a configured Agora name or installed harness identifier, are out of scope unless they can be sourced locally without invoking a stateful command.

## Current state

`src/commands/manage/completions.ts` renders hard-coded shell branches keyed to a small set of command names and word positions. `src/commands/catalogue.ts` supplies inventories for the four completed first-level namespaces, but it cannot represent their nested grammar or option signatures. The actual Commander registration across `src/commands/` is the authoritative command structure.

## Steps

- [ ] Define one typed, recursive completion-grammar adapter from the registered Commander command tree, preserving command descriptions and every reachable subcommand path instead of adding another hand-maintained partial inventory.
- [ ] Make the Bash and Zsh renderers consume that grammar so command candidates work at every depth, including `acquire → chatgpt → import`, `repo → skill → add|remove`, `trade → routes → add|remove|list|check`, and `dev → local → set|on|off`.
- [ ] Complete every applicable long option and the standard help/version flags at its valid command position, including inherited repository and registry selectors before or after their nested operation; repeated options remain available where the CLI permits repetition.
- [ ] Attach an explicit value strategy to each value-bearing parameter: complete closed documented value sets (for example, shell, format, horizon, status, runtime, visibility, direction, and kind); delegate filesystem-oriented arguments and options such as `--repo`, capture directories, and `--output` to the shell's path completion; and offer no fabricated candidates for opaque free-form values.
- [ ] Keep the generated scripts side-effect free and compatible with native shell completion behavior: completing a path does not require the target to exist, and a user-entered glob remains a valid `--repo` pattern.
- [ ] Replace shallow inventory assertions with CLI-contract coverage that derives the public hierarchy from `--help` and proves every registered command/subcommand, option, and defined value strategy is emitted for both shells. Add focused cases for `ki acquire`, `--repo` before and after `ki repo audit`, repeated selectors, path-valued options, and rejected completion shells.
- [ ] Update the public completion documentation and man page to state the supported shells and the command, option, enum-value, and path-value completion contract.

## Files touched

- `src/commands/manage/completions.ts`
- `src/commands/manage/completion-grammar.ts` (new)
- `src/commands/catalogue.ts`
- `src/commands/root.ts`
- `src/tests/cli/completions.test.ts`
- `src/tests/cli/inventory.test.ts`
- `README.md`
- `man/ki.1`
- This roadmap item

## Verify

- `bunx vitest run src/tests/cli/completions.test.ts src/tests/cli/inventory.test.ts`
- `bun run test`
- `bunx tsc --noEmit`
- `ki manage completion bash` and `ki manage completion zsh` contain candidates for every path reported by the corresponding `ki … --help` command, including `acquire chatgpt import`, `repo skill add`, `trade routes add`, and `dev local set`.
- Both scripts offer `--repo` and `--agora` around repository operations; `--repo` delegates its following value to filesystem completion without excluding a manually typed pattern.
- Both scripts complete declared enum values where the grammar defines them, and do not offer invented values for opaque identifiers.
- `ki manage completion fish` remains a usage error and generated scripts do not invoke the network or mutate KI state.

## Dependencies / blocks

This is self-contained. It shares completion files with [KI-TOOL-CLI-013](KI-TOOL-CLI-013-group-governed-work-items-by-horizon.md), but neither change is a logical prerequisite; coordinate integration if both are active concurrently.

## Discussion

### The Commander tree is the completeness authority

Completion has fallen behind because its separately maintained lists cover only selected namespaces. The live Commander registration already defines the public grammar, descriptions, nesting, and option ownership, so a narrow typed adapter should derive the structural completion tree from it. The adapter is also the place to make inheritance and supported option positions explicit, rather than duplicating positional shell conditions in two renderers.

### Option names and option values need different policies

Every valid option name is safe and useful to offer. Its following value is not uniformly enumerable. Closed vocabularies should complete their documented values, and path-bearing parameters should use the shell's normal filesystem completion. Other values—such as free-text titles, URLs, capability names, and opaque trade identifiers—must remain user-entered unless a later change establishes a local, read-only authoritative source. This keeps completion useful without silently changing CLI authority or causing shell tabs to invoke stateful work.

### Shell parity is a public contract

Bash and Zsh may use different native mechanisms, but they must expose the same command paths, options, and declared value strategies. Tests should inspect scripts emitted through `run(args, context)` and compare them to the CLI's help grammar, so a newly registered command or option cannot ship without an intentional completion policy.
