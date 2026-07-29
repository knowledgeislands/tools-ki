---
id: KI-TOOL-CLI-008
title: Reconcile implementation with the documented V1 CLI surface
theme: cli
horizon: blocking
status: in-progress
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
- `ki repo [--repo <path>] <command>` accepts the shared repository selector immediately after `ki repo`; command-specific options remain with their command.

The known discrepancies are the currently registered top-level `ki install`, `ki reinstall`, and `ki uninstall` commands; the current `ki dev on|off` and `ki skill rubric` paths; and the current trailing per-command `--repo` parser grammar. The changelog and manual already present the intended V1 surface, except that the manual’s repository notation now deliberately leads the parser change.

## Boundary

Do not add unrelated capabilities, change user or repository skill activation semantics, alter acquisition, bootstrap, release distribution, or repository maintenance, or start later CLI capability work before this reconciliation is reviewed. Preserve lifecycle safety checks while moving supported paths; do not silently drop replacement capability.

## Current state

The public documentation groups General, Installation, Diagnostics, User management, Repository management, Harness management, Acquisition, and Development in a V1 release baseline. The manual additionally documents Global options and Repository options, which the changelog intentionally omits.

The runtime still exposes the retired top-level lifecycle commands and former development paths. It accepts `--repo <path>` after each repository subcommand, rather than once after `ki repo`. The current harness uninstall path does not use the lifecycle command’s active-user-skill guard; the consolidated harness commands must retain that guard.

## Steps

1. Capture the implementation-versus-documentation inventory in CLI contracts, including each current path that must disappear and its one intended replacement.
2. Refactor the command tree so `ki harness install|reinstall|uninstall <harness-id>` owns harness lifecycle work. Move the replacement and active-skill safety checks into that group, remove the top-level lifecycle registrations, and remove capability-qualified lifecycle targeting.
3. Refactor `ki dev` into `local on|off` and `skill rubric` subgroups. Move rubric generation and its dev-linked write guard into `ki dev skill rubric`; remove the former `ki dev on|off` and `ki skill rubric` registrations.
4. Move `--repo <path>` to the shared `ki repo` command grammar. Pass its resolved selection consistently to audit, conform, educate, diag, skill, and upgrade operations; remove each child command’s trailing `--repo` grammar.
5. Regenerate help and completion contracts, then reconcile README and user guides with the changelog and `ki(1)`. Keep Global and Repository option groups manual-only.
6. Add black-box CLI tests for every intended command, every retired command’s grammar failure, shared prefix repository selection, lifecycle safety, and unchanged user/repository skill activation semantics.

## Files touched

- `src/cli.ts`, `src/commands/harness.ts`, `src/commands/lifecycle.ts`, `src/commands/dev.ts`, `src/commands/skill.ts`, and `src/commands/repo.ts`
- `src/tests/cli/` command-tree, lifecycle, development, repository, help, and completion contracts
- `README.md`, `docs/guides/user/`, `man/ki.1`, `CHANGELOG.md`, and generated completion artefacts

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
- The only accepted repository selector placement is `ki repo --repo <path> <command>`; trailing child `--repo` options are removed.
- Lifecycle removal and replacement preserve the active-user-skill and development-link safety checks.
- README and guide changes are integrated only after the command-tree and manual work pass their contracts.

### Escalate

- Escalate any Commander limitation that prevents the shared parent `--repo` option from reaching nested `skill add|remove` without a non-standard parser or a second accepted grammar.

### Rounds

1. **Round 1 — command-tree implementation.** One mechanical code worker owns command registration, operation wiring, completions, and CLI contracts; no documentation files.
2. **Round 1 — V1 manual pruning.** One mechanical documentation worker owns KI-TOOL-CLI-009’s manual-only removal work; it does not edit KI-TOOL-CLI-008 or implementation files.
3. **Round 2 — integration.** The orchestrator reviews both diffs, reconciles README, guides, changelog, and manual, then runs the full verification gate.

### Worker briefs

- **CLI-008 command tree** — class: mechanical; minimum model: `gpt-5.6-terra` at high reasoning, because nested Commander grammar and 100% black-box coverage require careful integration. Scope: `src/cli.ts`, `src/commands/`, completion sources, and `src/tests/cli/`; do not edit Markdown, `man/ki.1`, or roadmap files. Done: only the locked command paths parse; former paths fail; lifecycle guards and repository selection behaviour are preserved; targeted tests pass. Checkpoint: report files changed, commands exercised, and targeted test output.
- **CLI-009 manual pruning** — class: mechanical; minimum model: `gpt-5.6-terra` at low reasoning, because the disposition is locked as omission rather than implementation or deferral. Scope: `man/ki.1` only; do not edit roadmap files, changelog, or implementation. Done: remove the two unavailable `*` commands and their now-obsolete explanation, and make the description describe the V1 release surface. Checkpoint: report the rendered-manual excerpt and `mandoc` result.

The orchestrator reviews every diff and runs the stated verification before preparing either item for acceptance.
