---
id: KI-TOOL-CLI-006
title: Add multi-repository invocations
theme: cli
horizon: next
status: open
blocks: [KI-TOOL-CLI-003]
blocked-by: []
baseline-ref: null
---

## Context

Extend every `ki repo` operation from one resolved repository to a deterministic target set. Repeated `[--repo <path-or-pattern>]` options let a caller audit, conform, diagnose, manage skills, or upgrade selected repositories explicitly. Without `--repo`, a regular `.mgitconfig` directly in the physical CWD resolves its declared members downward; otherwise KI retains single-repository CWD discovery.

## Boundary

This item does not persist named workspaces, add multi-repository support to user commands, adopt `mgit` as a runtime dependency or compatibility surface, search ancestor directories for `.mgitconfig`, or introduce all-or-nothing rollback across repository mutations.

## Current state

`KI-TOOL-CLI-005` establishes the repository-only command boundary and exact single-path resolution. Each `ki repo` operation presently receives one repository and reports one result. `/Users/krisbrown/workspaces/kis/knowledgeislands/.mgitconfig` is a representative generated container configuration: it declares direct child repositories and child containers, which `mgit` resolves downward. The next inventory item needs this common multi-target boundary rather than a bespoke fan-out implementation.

### Target-set selection

1. Repeated `--repo <path-or-pattern>` values are the complete explicit target request. Literal paths resolve as exact physical KI roots; patterns select matching physical KI roots in deterministic order. An unmatched pattern, invalid root, or duplicate physical root is an error. Explicit values never inspect the CWD for either a repository or `.mgitconfig`.
2. With no `--repo`, KI checks only the physical CWD for a regular `.mgitconfig`. When present, it parses the declared child containers and repositories itself, follows only declared container entries downward, ignores owned-link entries, and preflights the resulting physical KI repository roots.
3. KI never searches ancestors for `.mgitconfig`. Without explicit targets and without a direct-CWD configuration, it retains the one-repository CWD discovery from KI-TOOL-CLI-005.

The `mgit` comparison is behavioural only: KI owns its parser, grammar, diagnostics, and operation semantics and does not invoke or require the `mgit` executable.

### Man-page notation

KI-TOOL-CLI-006 also corrects the `ki(1)` synopsis grammar while documenting repository target selection. Generic optional command selectors use `[command]`, as in `ki [command]` and `ki help [command]`; angle brackets remain for required user-supplied values such as `<path>`, `<skill>`, and `<shell>`.

The rendered manual also needs clearer sectional rhythm: place visible vertical separation after each major and command-group heading before its following prose or command synopsis. Split `SYNOPSIS` into user-level and repository-operation blocks, keeping every `ki repo …` synopsis contiguous in the latter so scope is visible before the detailed reference. Introduce `COMMAND GROUPS` with a short explanation that KI splits its commands by operational scope and purpose, then explain that `*` marks planned, unavailable interfaces. Every command group must begin with a concise purpose paragraph before its first command synopsis, separated visually from both the group heading and the first command.

## Steps

1. Define repeatable `[--repo <path-or-pattern>]` grammar, deterministic pattern expansion, duplicate handling, and target ordering for every `ki repo` operation.
2. Implement a shared multi-target resolver that preflights every explicit root or pattern match before operations begin, and that uses only a direct-CWD `.mgitconfig` for no-option downward target resolution before falling back to one-repository CWD discovery.
3. Parse the bounded `.mgitconfig` container shape internally: accept declared child containers and repository entries, ignore owned-link entries, preserve declaration order, reject unsafe or malformed entries, and never invoke or require `mgit`.
4. Refactor repository operations to run resolved targets in supplied or declared order with concise per-repository reporting. For mutations, retain earlier successful targets when a later target fails and return a non-zero overall result.
5. Add black-box CLI contracts for explicit multi-target audit, conform, diag, skill activation, and upgrade; direct-CWD `.mgitconfig` resolution; pattern matching; preflight failure; and duplicate or invalid target diagnostics.
6. Update help, completions, `ki(1)`, README, and user documentation to explain repository target-set detection, repeated `[--repo <path-or-pattern>]` syntax, direct-CWD `.mgitconfig` behaviour, no ancestor configuration search, and incremental mutation behaviour. Correct generic man-page command selectors to `[command]` while retaining angle brackets for required user-supplied values. Group all `ki repo …` entries together in a dedicated `SYNOPSIS` block. Improve the rendered manual's command-group orientation and visible spacing after headings and before command lists.

## Files touched

- `src/commands/`, repository-resolution modules, and command registration/completions
- `src/tests/cli/` multi-target repository contracts
- `man/ki.1`, README, and user documentation

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove all-target preflight, explicit-target and direct-CWD `.mgitconfig` selection, no ancestor configuration search, deterministic pattern and declaration ordering, isolated per-repository diagnostics, and retained earlier mutations after a later failure.

## Dependencies / blocks

The completed [KI-TOOL-CLI-005](KI-TOOL-CLI-005-align-command-scopes-and-repository-resolution.md) and [KI-TOOL-CLI-008](KI-TOOL-CLI-008-consolidate-harness-and-developer-commands.md) establish this item’s repository boundary and selector grammar. This item blocks [KI-TOOL-CLI-003](KI-TOOL-CLI-003-add-native-governed-plan-inventory.md).
