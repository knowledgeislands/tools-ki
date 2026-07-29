---
id: KI-TOOL-CLI-005
title: Align command scopes and repository resolution
theme: cli
horizon: next
status: in-progress
blocks: [KI-TOOL-CLI-006]
blocked-by: []
baseline-ref: e659bea937732687809c1fa84344ab7822205551
---

## Context

Make command scope explicit: every command outside `ki repo …` is user-level and never discovers a repository. A repository operation accepts one optional `[--repo <path>]`; without that option it discovers one repository from the CWD. It validates an explicit path as that exact physical KI repository and never falls back to an ancestor or the CWD.

## Boundary

This item does not add repeatable multi-repository invocation, persisted workspaces, recursive discovery, compatibility aliases, machine-readable output, or cross-repository transaction rollback.

## Current state

`createContext()` discovers a repository for every command. That ambient result affects `ki list`, `ki missing`, `ki outdated`, lifecycle guards, and `ki diag`. User skill activation is nested under `ki skill user`, repository skill activation under `ki skill repo`, and `ki upgrade` is top-level. Lifecycle, harness, update, and upgrade commands expose shallow `--dry-run` no-op previews; `ki acquire chatgpt import` and `ki harness info` expose `--json`.

### CLI surface

Changed command paths:

- `ki skill user add <skill>` becomes `ki skill add <skill>`.
- `ki skill user remove <skill>` becomes `ki skill remove <skill>`.
- `ki skill repo add <skill>` becomes `ki repo skill add <skill>`.
- `ki skill repo remove <skill>` becomes `ki repo skill remove <skill>`.
- `ki upgrade` becomes `ki repo upgrade`.
- `ki diag` becomes user-only; `ki repo diag` is added for explicit repository resolution evidence.

Every `ki repo` operation accepts `[--repo <path>]`:

- With no `--repo`, it discovers exactly one KI repository from the CWD.
- With the option, it resolves only that supplied physical root; it does not inspect the CWD or ancestors.
- An invalid supplied root or failed CWD discovery stops the invocation with an error.
- Repeatable multi-repository invocation is deferred to `KI-TOOL-CLI-006`.

Removed options:

- `--json` is removed from `ki acquire chatgpt import` and `ki harness info`.
- `--dry-run` is removed from `ki install`, `ki reinstall`, `ki uninstall`, `ki harness uninstall`, `ki update`, and `ki repo upgrade`.

Retained options:

- `ki acquire chatgpt import --dry-run` remains because it validates and previews the KEP without creating it.
- `ki repo conform --dry-run` remains because it renders its proposed writes and commands without applying them.
- Existing non-preview options remain: `ki update --cli`; `ki repo audit` and `ki repo conform` output controls; `ki repo conform --skill`; and `ki skill rubric --write`.

Commands unchanged in meaning, except that their documentation adopts `<required-argument>` and `[optional]` syntax:

- `ki bootstrap`, `ki completions`, `ki dev`, `ki doctor`, `ki harness list`, `ki harness install`, `ki list`, `ki missing`, `ki outdated`, `ki update`, `ki version`, `ki acquire chatgpt import`, and `ki skill rubric`.
- `ki repo educate`, `ki repo audit`, and `ki repo conform` retain their operation semantics while gaining the shared repeatable target boundary.

Deferred rather than added by this item:

- Repeatable multi-repository `ki repo` invocation belongs to `KI-TOOL-CLI-006`.
- `ki repo plan list` belongs to `KI-TOOL-CLI-003`.
- `ki workspace` belongs to `KI-TOOL-CLI-004`.

Man-page notation is part of this item:

- Every `ki(1)` synopsis uses `<required-argument>` and `[optional-argument]` notation, including nested commands and option values.
- Existing bare positional labels and prose-only placeholders are replaced with the same grammar used by CLI help, README examples, and user guides.

## Steps

1. Define and register the final grammar: `ki skill add <skill>`, `ki skill remove <skill>`, `ki repo skill add <skill>`, `ki repo skill remove <skill>`, `ki repo upgrade`, and `ki repo diag [--repo <path>]`; remove superseded paths with no compatibility aliases.
2. Make the base context repository-neutral. Implement single-target repository resolution: no option discovers from CWD, and `[--repo <path>]` validates only that exact physical root.
3. Refactor every `ki repo` operation to use the shared single-target boundary and report the resolved repository consistently.
4. Keep `ki diag` user-only and move repository diagnostics to `ki repo diag`. Remove ambient repository reads from user commands, including capability status/listing and lifecycle guards.
5. Retain `--dry-run` only on `ki acquire chatgpt import` and `ki repo conform`. Remove lifecycle, harness, update, and upgrade dry-run flags plus both `--json` flags.
6. Add black-box contracts for command grammar, exact-path and CWD resolution, no repository discovery by user commands, diagnostic separation, and removed flags.
7. Update help, completions, the full `ki(1)` synopsis and command reference, README, guides, and the V1 command baseline using `<required-argument>` and `[optional-argument]` syntax consistently; run complete verification and audit.

## Files touched

- `src/context.ts`, command registration, repository resolution, and affected command modules
- `src/tests/cli/` command-contract and repository-resolution coverage
- `README.md`, `man/ki.1`, user guides, completions, and `CHANGELOG.md`

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove user commands never discover a repository, and each `ki repo` operation resolves only the CWD result or its supplied exact root before work begins.
5. CLI help, completions, manual, README, and changelog name only the final commands and use consistent argument syntax.

## Dependencies / blocks

This item blocks [KI-TOOL-CLI-006](KI-TOOL-CLI-006-add-multi-repository-invocations.md). It has no external dependency.
