---
id: KI-TOOL-CLI-006
title: Add multi-repository invocations
theme: cli
horizon: next
status: in-progress
blocks: [KI-TOOL-CLI-003]
blocked-by: []
baseline-ref: 3780dec701eace7277c0cda203712949acab777a
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

1. Lock the repeatable `[--repo <path-or-pattern>]` grammar for `audit`, `conform`, `diag`, `educate`, `skill`, and `upgrade`, including deterministic expansion, duplicate physical-root rejection, target ordering, and per-target result shape.
2. Introduce one shared target-set resolver that first preflights every explicit literal path or pattern match, otherwise reads only a regular `.mgitconfig` in the physical CWD, and finally retains one-repository CWD discovery. No adapter may retain a bespoke resolution path.
3. Parse the bounded `.mgitconfig` container shape internally: accept declared child containers and repository entries, follow only declared container entries downward, ignore owned-link entries, preserve declaration order, reject unsafe or malformed entries, and never invoke or require `mgit`.
4. Adapt every repository operation to consume the resolved target set and render concise per-repository outcomes in target order. A later mutation failure retains earlier successful targets and produces a non-zero overall result; read-only operations isolate each target's diagnostics.
5. Add black-box CLI contracts for every adapted operation, explicit literals and patterns, direct-CWD configuration, nested declared containers, ignored owned links, no ancestor configuration search, all-target preflight failure, duplicates, invalid roots, deterministic ordering, and retained earlier mutations after a later failure.
6. Update root help, completions, `ki(1)`, README, and developer documentation with the target-set contract. Correct generic manual selectors to `[command]`, group every `ki repo …` synopsis together, and add the required command-group orientation and spacing. Prepare a non-blocking KI Website handoff for public user guidance rather than editing that repository here.

## Files touched

- `src/commands/repo.ts`, `src/commands/diag.ts`, `src/commands/skill.ts`, `src/commands/update.ts`, and command registration/completions
- `src/core/repository.ts` and a focused target-set or bounded configuration-parser module where separation improves containment
- `src/tests/cli/` multi-target repository contracts
- `man/ki.1`, README, developer documentation, and a non-blocking KI Website handoff for public user guidance

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove all-target preflight, explicit-target and direct-CWD `.mgitconfig` selection, no ancestor configuration search, deterministic pattern and declaration ordering, isolated per-repository diagnostics, and retained earlier mutations after a later failure.

## Dependencies / blocks

The completed [KI-TOOL-CLI-005](KI-TOOL-CLI-005-align-command-scopes-and-repository-resolution.md) and [KI-TOOL-CLI-008](KI-TOOL-CLI-008-consolidate-harness-and-developer-commands.md) establish this item’s repository boundary and selector grammar. This item blocks [KI-TOOL-CLI-003](KI-TOOL-CLI-003-add-native-governed-plan-inventory.md).

## Discussion

### Target-set authority

The target-set resolver is the sole authority for repository selection across every `ki repo` operation. It returns already preflighted physical roots in deterministic order, so command adapters can focus on their operation rather than repeating path, pattern, or configuration logic.

### Bounded configuration grammar

The comparison to `mgit` is behavioural, not an integration. KI recognises only the declared repository and container forms it needs, ignores owned links, follows only declared containers downward, and treats a direct-CWD regular `.mgitconfig` as the only implicit aggregate selector. URLs and ambient ancestor configuration do not participate in target discovery.

### Failure and mutation model

Explicit target requests are all-or-nothing at selection time: one unmatched pattern, invalid root, or duplicate rejects the entire request before any operation begins. After a valid set is selected, each target runs independently in order; mutation operations retain earlier successes when a later target fails, while read-only operations report isolated diagnostics.

### Documentation ownership

The executable's help, completion, README, manual, and developer guidance remain in this repository. Public end-user explanation belongs to `ki-website`; the implementation records a non-blocking handoff there without editing its content or changing that repository's priority.
