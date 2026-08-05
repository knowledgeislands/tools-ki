---
id: KI-TOOL-CLI-014
title: Complete CLI completions
theme: cli
horizon: next
status: draft
blocks: []
blocked-by: [KI-TOOL-CLI-016]
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

`src/commands/manage/completions.ts` renders hard-coded shell branches keyed to a small set of command names and word positions. `src/commands/root/catalogue.ts` supplies first-level inventories for help and the current shallow completion lists, but it cannot represent nested grammar, option signatures, or option values. The actual Commander registration across the focused command modules is the authoritative command structure.

The CLI-015 modularisation places the relevant command families under `src/commands/manage/`, `src/commands/repo/`, `src/commands/trade/`, `src/commands/acquire/`, and `src/commands/root/`. Contract tests follow the same grammar-oriented layout under `src/tests/cli/`.

## Steps

- [ ] Establish a typed completion grammar as the one shared input to both renderers. It must represent a command's description, reachable subcommands, accepted options, repeatability, and the value strategy for each argument or option without making completion invoke the CLI again.
- [ ] Populate that grammar from the registered Commander surface through a narrow adapter. Keep deliberately synthetic placement rules explicit where Commander alone cannot express them, notably repository and registry selectors being valid before or after the operation.
- [ ] Render Bash candidates at every grammar depth, including `acquire → chatgpt → import`, `repo → skill → add|remove`, `trade → routes → add|remove|list|check`, and `dev → local → set|on|off`; retain the standard Bash registration contract.
- [ ] Render the same grammar as an autoloadable Zsh `_ki` artifact with concise descriptions, retaining its `#compdef` header, `compdef` registration, and no invocation during loading.
- [ ] Give every value-bearing position exactly one strategy: closed documented values; shell-native path completion for filesystem-oriented values including `--repo`, capture directories, and `--output`; or no candidates for opaque free-form identifiers and text. A typed `--repo` glob remains valid even when path completion yields no match.
- [ ] Cover the public contract through `run(args, context)`: every registered command path is offered by both shells; every command's options appear only at valid positions; documented enums complete; path positions delegate natively; repeated selectors remain repeatable; and Fish plus retired completion paths remain syntax errors.
- [ ] Update README and the manual to describe the supported shells, full grammar coverage, closed-value completion, path delegation, and the deliberate absence of invented dynamic values.

## Files touched

- `src/commands/manage/completions.ts`
- `src/commands/manage/completion-grammar.ts` (new)
- `src/commands/root/catalogue.ts`
- `src/commands/{acquire,bootstrap,dev,harness,repo,root,skill,trade}/` (grammar-adapter integration only)
- `src/tests/cli/manage/completions.test.ts`
- `src/tests/cli/manage/completion-registration.test.ts`
- `src/tests/cli/manage/inventory.test.ts`
- `src/tests/cli/root/help.test.ts`
- `README.md`
- `man/ki.1`
- This roadmap item

## Verify

- `bunx vitest run src/tests/cli/manage/completions.test.ts src/tests/cli/manage/completion-registration.test.ts src/tests/cli/manage/inventory.test.ts src/tests/cli/root/help.test.ts`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `ki manage completion bash` and `ki manage completion zsh` contain candidates for every path reported by the corresponding `ki … --help` command, including `acquire chatgpt import`, `repo skill add`, `trade routes add`, and `dev local set`.
- Both scripts offer `--repo` and `--agora` around repository operations; `--repo` delegates its following value to filesystem completion without excluding a manually typed pattern.
- Both scripts complete declared enum values where the grammar defines them, and do not offer invented values for opaque identifiers.
- `ki manage completion fish` remains a usage error and generated scripts do not invoke the network or mutate KI state.

## Dependencies / blocks

CLI-015 is complete and established the command/test module boundaries used here. CLI-016 must first deliver the final roadmap subcommand grammar so this item can cover it without a follow-up completion gap. This item requires no compatibility aliases or peer-repository changes.

## Discussion

### The Commander tree is the completeness authority

Completion has fallen behind because its separately maintained lists cover only selected namespaces. The live Commander registration already defines the public grammar, descriptions, nesting, and option ownership, so a narrow typed adapter should derive the structural completion tree from it. The adapter is also the place to make inheritance and supported option positions explicit, rather than duplicating positional shell conditions in two renderers.

The adapter must not expose Commander as an uncontrolled runtime dependency to the renderers. It should convert only the stable public grammar into a small data model, then make the deliberately non-local placement rules visible and tested. That leaves new commands detectable in contract tests without coupling emitted shell code to Commander internals.

### Option names and option values need different policies

Every valid option name is safe and useful to offer. Its following value is not uniformly enumerable. Closed vocabularies should complete their documented values, and path-bearing parameters should use the shell's normal filesystem completion. Other values—such as free-text titles, URLs, capability names, and opaque trade identifiers—must remain user-entered unless a later change establishes a local, read-only authoritative source. This keeps completion useful without silently changing CLI authority or causing shell tabs to invoke stateful work.

### Shell parity is a public contract

Bash and Zsh may use different native mechanisms, but they must expose the same command paths, options, and declared value strategies. Tests should inspect scripts emitted through `run(args, context)` and compare them to the CLI's help grammar, so a newly registered command or option cannot ship without an intentional completion policy.

### Readiness decision

The implementation is ready to enter `ready` when the adapter's public data model and the exact path/opaque-value policies above are approved. No dynamic lookup is approved in this item.
