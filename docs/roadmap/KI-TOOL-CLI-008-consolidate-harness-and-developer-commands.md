---
id: KI-TOOL-CLI-008
title: Reconcile implementation with the documented V1 CLI surface
theme: cli
horizon: blocking
status: acceptance
blocks: [KI-TOOL-CLI-006]
blocked-by: []
baseline-ref: 84c88ca5ed39f8e2af5b42874a417aba6020095b
---

## Context

The V1 changelog and `ki(1)` manual establish the intended public CLI surface and its ordered groups. Before further CLI surface work begins, reconcile actual command registration, help, completion, and behaviour with that surface. The reconciliation is deliberately a command-tree refactor: rename, move, or remove existing paths rather than adding unrelated capability.

The documented target is:

- `ki harness install <harness-id>`, `ki harness reinstall <harness-id>`, and `ki harness uninstall <harness-id>` are the sole harness lifecycle commands.
- `ki dev local on <local-harness-path>` and `ki dev local off` replace `ki dev on|off`.
- `ki dev skill rubric <skill> [--write]` replaces `ki skill rubric <skill> [--write]`.
- `ki repo [--repo <path>] <command>` is the documented canonical form for the shared repository selector; command-specific options remain with their command.

The known discrepancies are the currently registered top-level `ki install`, `ki reinstall`, and `ki uninstall` commands; the current `ki dev on|off` and `ki skill rubric` paths; and separate child ownership of `--repo`. The changelog and manual already present the intended V1 surface, except that the manual’s repository notation now deliberately leads the parser change.

## Boundary

Do not add unrelated capabilities, change user or repository skill activation semantics, alter acquisition, bootstrap, release distribution, or repository maintenance, or start later CLI capability work before this reconciliation is reviewed. Preserve lifecycle safety checks while moving supported paths; do not silently drop replacement capability.

## Current state

The public documentation groups General, Installation, Diagnostics, User management, Repository management, Harness management, Acquisition, and Development in a V1 release baseline. The manual additionally documents Global options and Repository options, which the changelog intentionally omits.

The runtime still exposes the retired top-level lifecycle commands and former development paths. Each repository child currently owns `--repo <path>`; the shared parent will own it instead. Commander may still accept that parent option after a child command, but only the documented prefix form is canonical and no custom order parser is warranted. The current harness uninstall path does not use the lifecycle command’s active-user-skill guard; the consolidated harness commands must retain that guard.

## Steps

1. Capture the implementation-versus-documentation inventory in CLI contracts, including each current path that must disappear and its one intended replacement.
2. Refactor the command tree so `ki harness install|reinstall|uninstall <harness-id>` owns harness lifecycle work. Move the replacement and active-skill safety checks into that group, remove the top-level lifecycle registrations, and remove capability-qualified lifecycle targeting.
3. Refactor `ki dev` into `local on|off` and `skill rubric` subgroups. Move rubric generation and its dev-linked write guard into `ki dev skill rubric`; remove the former `ki dev on|off` and `ki skill rubric` registrations.
4. Move `--repo <path>` ownership to the shared `ki repo` command grammar. Pass its resolved selection consistently to audit, conform, educate, diag, skill, and upgrade operations; remove each child command’s registration. Treat the documented prefix form as canonical without adding a custom parser to forbid Commander’s equivalent trailing acceptance.
5. Regenerate help and completion contracts, then reconcile README and user guides with the changelog and `ki(1)`. Keep Global and Repository option groups manual-only.
6. Add black-box CLI tests for every intended command, every retired command’s grammar failure, shared prefix repository selection, lifecycle safety, and unchanged user/repository skill activation semantics.

## Files touched

- `src/cli.ts`, `src/commands/catalogue.ts`, `src/commands/harness.ts`, `src/commands/lifecycle.ts`, `src/commands/dev.ts`, `src/commands/skill.ts`, `src/commands/diag.ts`, `src/commands/repo.ts`, and `src/commands/update.ts`
- `src/core/registry.ts` and `src/core/rubric-render.ts`
- `src/tests/cli/` command-tree, lifecycle, development, repository, help, and completion contracts
- `README.md`, `docs/guides/user/`, `docs/decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md`, `man/ki.1`, and `CHANGELOG.md`

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove that only the documented V1 paths are accepted, former paths fail as unknown commands, `ki repo --repo <path> <command>` selects only that repository, and lifecycle operations retain active-user-skill safety.

## Dependencies / blocks

This blocking reconciliation must finish before [KI-TOOL-CLI-006](KI-TOOL-CLI-006-add-multi-repository-invocations.md) changes repository target selection. KI-TOOL-CLI-006 then extends the settled shared `ki repo` option boundary to repeatable target selection and direct-CWD `.mgitconfig` resolution.

## Delegation

### Locked decisions

- The only accepted lifecycle paths are `ki harness install|reinstall|uninstall <harness-id>`; no top-level lifecycle or capability-qualified target alias remains.
- The only accepted development paths are `ki dev local on|off` and `ki dev skill rubric <skill> [--write]`.
- The documented canonical repository selector placement is `ki repo --repo <path> <command>`; child `--repo` registrations are removed. Commander’s trailing acceptance of the parent option is not a second documented interface and is not rejected by a custom parser.
- Lifecycle removal and replacement preserve the active-user-skill and development-link safety checks.
- README and guide changes are integrated only after the command-tree and manual work pass their contracts.

### Escalate

- Commander accepts a parent option after a child command even when positional options are enabled. This is accepted as an implementation detail; escalate only if the parent option cannot reach nested `skill add|remove`.

### Rounds

1. **Round 1 — command-tree implementation.** One mechanical code worker owns command registration, operation wiring, completions, and CLI contracts; no documentation files.
2. **Round 1 — V1 manual pruning.** One mechanical documentation worker owns KI-TOOL-CLI-009’s manual-only removal work; it does not edit KI-TOOL-CLI-008 or implementation files.
3. **Round 2 — integration.** The orchestrator reviews both diffs, reconciles README, guides, changelog, and manual, then runs the full verification gate.

### Worker briefs

- **CLI-008 command tree** — class: mechanical; minimum model: `gpt-5.6-terra` at high reasoning, because nested Commander grammar and 100% black-box coverage require careful integration. Scope: `src/cli.ts`, `src/commands/`, completion sources, and `src/tests/cli/`; do not edit Markdown, `man/ki.1`, or roadmap files. Done: only the locked command paths parse; former paths fail; lifecycle guards and repository selection behaviour are preserved; the documented prefix repository selection works through the shared parent option; targeted tests pass. Checkpoint: report files changed, commands exercised, and targeted test output.
- **CLI-009 contract research** — class: research; minimum model: `gpt-5.6-terra` at medium reasoning, because safe search, cleanup, and documentation behaviour must be defined before implementation. Scope: read-only command, catalogue, core, test, and documentation inspection; do not edit implementation or documentation. Done: report bounded contracts, policy decisions, test cases, and unsafe assumptions to avoid. Checkpoint: identify each decision that requires owner approval.

The orchestrator reviews every diff and runs the stated verification before preparing either item for acceptance.

## Acceptance

### Delivered

- Consolidated harness lifecycle operations under `ki harness install|reinstall|uninstall <harness-id>` and removed generic top-level and capability-qualified lifecycle grammars.
- Moved local harness switching to `ki dev local on|off` and rubric publication to `ki dev skill rubric <skill> [--write]`.
- Moved `--repo <path>` registration to the `ki repo` parent and passed its selection through every repository operation.
- Preserved active-user-skill, canonical-harness, and development-link lifecycle protections.
- Reconciled the README, lifecycle guide, architecture decision record, V1 changelog, and manual, including the new harness reinstallation command.

### Summary of changes

The runtime, root help, completion catalogue, tests, and supporting documentation now use the documented V1 command tree. Commander retains equivalent trailing parsing of the parent repository option as an implementation detail, while the manual documents only the canonical prefix form.

### Verification

- `bun run test:coverage` — 23 files and 371 tests passed; statements, branches, functions, and lines are each 100% covered.
- `bunx tsc --noEmit`, `bunx @biomejs/biome check src/cli.ts src/commands src/core src/tests/cli`, and `git diff --check` passed.
- `mandoc -Tutf8 man/ki.1 | col -b` rendered the manual successfully.
- `./bin/ki repo audit --repo .` passed after regenerating the linked harness’s stale rubric catalogues through `ki dev skill rubric <skill> --write`.

### Outstanding concerns

KI-TOOL-CLI-009 remains in progress. Its V1 command names are documented, but safe operational contracts for `ki search`, `ki cleanup`, and `ki docs` still require product decisions before implementation.

### Mini recap

The V1 command tree is ready for acceptance. This item leaves no compatibility aliases for retired lifecycle or development paths, and it keeps the next multi-repository item behind the settled shared repository-selector boundary.
