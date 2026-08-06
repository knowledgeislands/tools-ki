---
id: KI-TOOL-CLI-014
title: Complete CLI completions
theme: cli
horizon: next
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 28075f57f84b60b8f11b31328b1d6fe339b8f2e0
---

## Goal

Let Bash and Zsh users discover every supported `ki` command, subcommand, and applicable option from the shell, including the full `ki acquire chatgpt import` path and repository selectors such as `--repo`.

## Context

`ki manage completion bash` and `ki manage completion zsh` now derive nested command candidates and inherited options from the registered Commander tree. They cover paths such as `ki acquire chatgpt import`, `ki repo skill add`, `ki trade routes add`, and `ki dev local set`.

The remaining completion policy is not fully represented by Commander alone. Commander accepts repository selection options both before and after a repository operation, so the grammar must make those synthetic valid positions explicit and offer filesystem completion for `--repo` in each. It must also classify every value position as a documented enum, a path, or opaque free-form input.

The existing CLI-contract tests inspect generated script text for representative paths. They do not yet prove recursive command coverage, complete option placement, option-value behaviour, or parity between help and shell completion grammars.

## Boundary

Support Bash and Zsh only; `ki manage completion` continues to reject unsupported shells, including Fish. Do not alter command semantics, introduce a completion-installation command, make network requests from a completion script, or guess values for unconstrained identifiers. Dynamic application-state values, such as a configured Agora name or installed harness identifier, are out of scope unless they can be sourced locally without invoking a stateful command.

## Current state

`src/commands/manage/completion-grammar.ts` already derives recursive command paths and inherited option names from the registered Commander tree, and both shell renderers consume that projection. The remaining gap is policy and proof: value strategy is still a command-path heuristic, root-position `--repo` does not receive filesystem completion, and the contract tests exercise representative paths rather than proving parity with the registered help grammar.

The CLI-015 modularisation places the relevant command families under `src/commands/manage/`, `src/commands/repo/`, `src/commands/trade/`, `src/commands/acquire/`, and `src/commands/root/`. Contract tests follow the same grammar-oriented layout under `src/tests/cli/`.

## Steps

- [x] Establish a typed completion grammar as the one shared input to both renderers. It represents a command's description, reachable subcommands, accepted options, repeatability, and the value strategy for each argument or option without making completion invoke the CLI again.
- [x] Populate that grammar from the registered Commander surface through a narrow adapter. Keep deliberately synthetic placement rules explicit where Commander alone cannot express them, notably repository and registry selectors being valid before or after the operation.
- [x] Render Bash candidates at every grammar depth, including `acquire → chatgpt → import`, `repo → skill → add|remove`, `trade → routes → add|remove|list|check`, and `dev → local → set|on|off`; retain the standard Bash registration contract.
- [x] Render the same grammar as an autoloadable Zsh `_ki` artifact with concise descriptions, retaining its `#compdef` header, `compdef` registration, and no invocation during loading.
- [x] Give every value-bearing position exactly one strategy: closed documented values; shell-native path completion for filesystem-oriented values including `--repo`, capture directories, and `--output`; or no candidates for opaque free-form identifiers and text. A typed `--repo` glob remains valid even when path completion yields no match.
- [x] Cover the public contract through `run(args, context)`: every registered command path is offered by both shells; every command's options appear only at valid positions; documented enums complete; path positions delegate natively; and Fish plus retired completion paths remain syntax errors.
- [x] Update README and the manual to describe the supported shells, full grammar coverage, closed-value completion, path delegation, and the deliberate absence of invented dynamic values.

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

CLI-015 is complete and established the command/test module boundaries used here. The completed CLI-016 roadmap-subcommand work established the grammar this item now covers; it is retained in Git history rather than as a live roadmap dependency. This item requires no compatibility aliases or peer-repository changes.

## Review

- Reopened again after loading the repaired Zsh script exposed candidate descriptions as literal quoted text. The Zsh renderer must emit newline-delimited raw `candidate:description` records to `_describe`, not shell-quoted records embedded in an already shell-quoted case payload.
- Reopened during review after the generated Bash and Zsh scripts were found to omit a closing `fi` in their token-processing loops. The completion grammar correctly includes `repo roadmap`; the syntax error prevented a refreshed script from loading, leaving a shell's previously sourced completion function active. The repair restores that closing branch in both renderers.
- Repair verification: generated Bash and Zsh scripts pass their native syntax parsers; Zsh sources after `compinit`; and the generated Bash function completes `repo roadmap` with `list`, `prune`, `promote`, and `demote`, while excluding the retired `plan` command.
- Delivered the typed completion grammar and Bash/Zsh renderers for the complete registered CLI grammar, including typed enum, path, and opaque-value strategies.
- Preserved the stated boundary: Fish and retired completion paths remain errors; generated completions do not invoke the CLI, network, or dynamic state.
- During verification, the user explicitly authorised remediation of the repository-local coverage gap. Reachable paths now have CLI-contract coverage; unreachable zero-target and diagnostic-label branches were removed.
- Baseline: `28075f57f84b60b8f11b31328b1d6fe339b8f2e0`.
- Verification passed: focused completion contract suite; scoped coverage-remediation suite (192 tests); `bunx tsc --noEmit`; Biome; Markdown and manual checks; and `bun run test:coverage` (37 files, 488 tests, 100% statements, branches, functions, and lines).
- Repair verification passed: `bunx vitest run src/tests/cli/manage/completions.test.ts`, `bunx tsc --noEmit`, Biome, and `bun run test:coverage` (37 files, 492 tests, 100% statements, branches, functions, and lines).
- No external coordination, compatibility aliases, dynamic completion lookup, push, release, or other unresolved concern remains.

## Discussion

### The Commander tree is the completeness authority

Completion has fallen behind because its separately maintained lists cover only selected namespaces. The live Commander registration already defines the public grammar, descriptions, nesting, and option ownership, so a narrow typed adapter should derive the structural completion tree from it. The adapter is also the place to make inheritance and supported option positions explicit, rather than duplicating positional shell conditions in two renderers.

The adapter must not expose Commander as an uncontrolled runtime dependency to the renderers. It should convert only the stable public grammar into a small data model, then make the deliberately non-local placement rules visible and tested. That leaves new commands detectable in contract tests without coupling emitted shell code to Commander internals.

### Option names and option values need different policies

Every valid option name is safe and useful to offer. Its following value is not uniformly enumerable. Closed vocabularies should complete their documented values, and path-bearing parameters should use the shell's normal filesystem completion. Other values—such as free-text titles, URLs, capability names, and opaque trade identifiers—must remain user-entered unless a later change establishes a local, read-only authoritative source. This keeps completion useful without silently changing CLI authority or causing shell tabs to invoke stateful work.

### Shell parity is a public contract

Bash and Zsh may use different native mechanisms, but they must expose the same command paths, options, and declared value strategies. Tests should inspect scripts emitted through `run(args, context)` and compare them to the CLI's help grammar, so a newly registered command or option cannot ship without an intentional completion policy.

### Verification gate

Focused completion, TypeScript, Biome, Markdown, and manual checks passed. The full suite requires permission to bind its local installer-fixture server; the unprivileged sandbox rejects that binding with `listen EPERM`. With that permission it passes all 488 tests at 100% statements, branches, functions, and lines. The initial coverage deficit was resolved through public CLI tests for reachable presentation and optional-data paths, while three impossible branches were removed from internal-only helpers.

### Readiness decision

The implementation is ready to enter `ready` when the adapter's public data model and the exact path/opaque-value policies above are approved. No dynamic lookup is approved in this item.
