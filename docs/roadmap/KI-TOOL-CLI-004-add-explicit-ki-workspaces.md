---
id: KI-TOOL-CLI-004
title: Add explicit KI workspaces
theme: cli
horizon: next
status: acceptance
blocks: []
blocked-by: []
baseline-ref: c2ac480f5553eca0754d315a1528eed7dff14957
---

## Context

Let a user define a KI-owned `.ki-workspace.toml` in a parent directory, name explicit repository groups through `ki workspace`, and query their governed-work inventory through repository-scoped commands.

When `ki repo` runs from a directory containing that regular workspace file, its declared default group should take precedence over the direct-CWD `.mgitconfig` fallback. This makes KI workspaces the explicit authority while retaining `mgit` compatibility as an optional selector.

## Boundary

This item does not recursively scan ambient folders, replace Git or `mgit`, search ancestors for a workspace file, introduce mutation fan-out, or take ownership of governed-plan lifecycle transitions.

## Current state

The CLI has no persisted workspace definition. `KI-TOOL-CLI-006` owns the reusable target-set resolver; CLI-004 extends that resolver with KI-owned workspace selection before CLI-003 adds a plan-inventory command that can consume it.

### Workspace and selection contract

A regular `.ki-workspace.toml` in the physical current directory will declare `schema = 1`, a `default` group, and named groups whose relative repository paths or patterns resolve from the workspace directory. `ki workspace` will initialise, list, inspect, add, and remove those groups without needing a KI repository in the current directory.

Repository-scoped commands will accept `--workspace <group>` and resolve that named group from the direct-CWD workspace file. `--repo` and `--workspace` are mutually exclusive explicit selectors. With neither supplied, target selection is: the direct-CWD workspace default group, then the direct-CWD `.mgitconfig`, then normal single-repository discovery. No selector searches an ancestor workspace or `mgit` configuration.

## Steps

1. ✓ Define the direct-CWD `.ki-workspace.toml` schema and `ki workspace` grammar for initialising, listing, inspecting, adding, and removing named repository groups and their default.
2. ✓ Extend repository target selection with mutually exclusive `--repo` and `--workspace` selectors, then direct-CWD workspace-default, `.mgitconfig`, and single-repository fallback precedence.
3. ✓ Reuse the CLI-006 resolver for workspace-relative physical-root validation, duplicate detection, deterministic ordering, and clear missing or non-KI diagnostics.
4. ✓ Add black-box contracts for workspace persistence, group validation, selector precedence, ordering, and independent per-repository outcomes across existing `ki repo` commands.
5. ✓ Update help, completions, `ki(1)`, README, developer guidance, and the non-blocking `ki-website` handoff with the workspace authority and lifecycle boundary.

## Files touched

- `src/commands/`, `src/core/`, configuration/path modules, registration, and completions
- `src/tests/cli/` workspace selection and management contracts
- `man/ki.1`, README, developer documentation, and a non-blocking KI Website handoff for public user guidance

## Verify

1. `bunx tsc --noEmit`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove workspace-root containment, schema validation, explicit-selector conflict handling, direct-CWD precedence over `.mgitconfig`, deterministic selection, isolated diagnostics, and no workspace-management mutation from `ki repo` commands.

## Dependencies / blocks

CLI-004 has no blocking roadmap dependency. It extends the target-set selector from CLI-006 and provides a reusable workspace selector that CLI-003 may consume for inventory later.

## Delegation

One mechanical implementation lane may edit the workspace parser, target resolver, workspace command, registration, catalogue, and black-box CLI contracts. It uses `gpt-5.6-terra` as the minimum viable model because the contract is locked and the work is implementation-heavy.

Locked decisions: direct-CWD regular `.ki-workspace.toml`; `schema = 1`; named groups and a required default; workspace-relative paths or patterns; explicit `--repo` and `--workspace` conflict; fallback order workspace default, `.mgitconfig`, then normal discovery; workspace management is the only mutable surface.

Escalate any question about public command spelling, TOML grammar beyond the locked shape, output wording that affects compatibility, or a need to change unrelated command semantics. Definition of done: the bounded files implement that contract, focused black-box tests pass, and the worker reports changed files plus uncommitted verification output. The orchestrator reviews the diff, runs the full gate, and owns integration and acceptance.

## Acceptance

### Delivered

- `ki workspace init`, `list`, `show`, `add`, and `remove` manage a direct-CWD regular `.ki-workspace.toml` without requiring a KI repository in that directory.
- Workspace files use `schema = 1`, a required named default group, and ordered group member paths or patterns; malformed, symbolic, missing, or invalid files fail closed.
- Every `ki repo` operation now receives the mutually exclusive `--repo` and `--workspace` selectors through the shared target resolver. With neither selector, selection is direct-CWD workspace default, direct-CWD `.mgitconfig`, then normal repository discovery.
- Workspace member paths and patterns resolve physically from the workspace root, preserve deterministic ordering, reject missing, non-KI, duplicate, and unmatched targets, and do not search ancestor configuration.
- Root help, completion contracts, README, local-development guidance, `ki(1)`, and the non-blocking [`ki-website` handoff](../../-/_HANDOFFS/ki-website/KI-TOOL-CLI-004-ki-workspaces.md) describe the boundary.

### Verification

- `bunx tsc --noEmit`
- `bun run test:coverage` — 402 passing tests and 100% statements, branches, functions, and lines.
- `bunx markdownlint-cli2 --no-globs README.md docs/developer/local-development.md ./-/_HANDOFFS/ki-website/KI-TOOL-CLI-004-ki-workspaces.md`
- `mandoc -T utf8 man/ki.1`
- `./bin/ki repo audit --skill ki-roadmap --repo .` — 0 FAIL, 0 WARN.
- `git diff --check`

### Outstanding concerns

`ki workspace` records selectors but deliberately does not validate or normalise each member during mutation; validation happens when a repository operation selects the group. This keeps the workspace editable while a repository checkout is temporarily absent, and preserves the operation's all-or-nothing target preflight.

### Mini recap

CLI-004 adds KI-owned, explicit repository workspaces on top of CLI-006's shared physical target resolver. It is ready for user acceptance and remains an enabling selector for CLI-003's future governed-work inventory.

## Discussion

### Workspace ownership

A workspace is a named KI-owned definition of physical KI repository roots, not a replacement for Git discovery, `mgit`, or an ambient-directory scan. A direct-CWD workspace file is authoritative only for its declared default or an explicit group; no ancestor configuration silently changes a repository command's meaning.

### Workspace file shape

The workspace file uses a small, inspectable TOML shape: `schema = 1`, `default = "<group>"`, and one `[groups.<name>]` table with an ordered `repositories` array. Group entries may be literal relative paths or the same deterministic patterns accepted by `--repo`; they resolve from the workspace file's physical directory, never from an ambient ancestor.

Group names, references, duplicate physical roots, malformed TOML, an absent default, and a workspace file that is not a regular file are validation failures. No command normalises a hand-edited file or silently removes an unavailable member.

### Selector precedence

An explicit `--repo` or `--workspace` makes a caller's intent unambiguous, so the two selectors are rejected together rather than silently applying one. Without either selector, the direct-CWD `.ki-workspace.toml` default comes before direct-CWD `.mgitconfig`; ordinary repository discovery remains the final fallback.

### Command boundary

Workspace management is the only mutable surface in this item. Every `ki repo` operation remains responsible for its own behaviour after selection; workspace selection changes neither operation semantics nor lifecycle ownership. When CLI-003 introduces plan inventory, `ki repo --workspace <group> plan list` will follow from this shared selector without another aggregate implementation.

`ki workspace init` creates the initial file; `list` and `show` inspect it; `add` and `remove` make explicit, minimal group membership edits. Those commands work from the workspace directory and do not require any selected member to be the current repository.

### Dependency boundary

CLI-006 supplies multi-target resolution. CLI-004 adds persistence and named coordination independently; CLI-003 may subsequently consume the resulting selector for inventory.
