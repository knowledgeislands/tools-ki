---
id: KI-TOOL-CLI-015
title: Unify direct-CWD diagnostics and repair
theme: cli
horizon: blocking
status: ready
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Make `ki diag` and a new top-level `ki repair` the single local diagnostics-and-recovery surface. Both commands always consider user/global KI state; when, and only when, the current working directory itself contains `.ki-config.toml`, they additionally report or repair that one repository. This replaces the selected-target diagnostic command `ki repo diag` and avoids introducing `ki repo repair`.

## Boundary

Neither `ki diag` nor `ki repair` accepts `--repo`, `--workspace`, or another repository selector. They do not discover a declaration in an ancestor, expand a workspace or `.mgit-config.toml`, follow a symlink, or select multiple repositories. A directory without a direct `.ki-config.toml` receives only the global result and is not an error. Repository operations that intentionally address explicit or multiple targets remain under `ki repo`.

This item does not make repair a general configuration generator, change bootstrap/local-mode recovery (`KI-TOOL-CLI-012`), make `ki repo init` implicit (`KI-TOOL-CLI-014`), or replace repository governance commands such as `ki repo audit` and `ki repo conform`.

## Current state

`ki diag` reports only installation mode, paths, and user configuration. `ki repo diag` delegates to `resolveRepositoryTargets`, so it accepts the repository command's `--repo` and `--workspace` selectors and can discover through a workspace, mGit configuration, or ancestors. `ki doctor` only validates the shape of a direct-CWD repository declaration; it does not resolve its declared skills or inspect their repository-local agent projections. There is no repair command.

## Steps

1. Remove `ki repo diag` and fold its useful direct-CWD repository information into `ki diag`, following the global report with a clearly labelled repository section only when the current directory contains `.ki-config.toml`.
2. Extend direct-CWD repository diagnostics to resolve every declared skill from the active provider and check the compatible repository-agent projection: each expected projection must be a non-dangling KI-managed symlink to the resolved skill source. Report malformed declarations, unresolved providers, missing projections, non-link/foreign entries, dangling links, stale targets, and incompatible runtime declarations deterministically.
3. Add top-level `ki repair`. It first reconciles only KI-managed global state that its diagnostics can prove needs repair, then, when a direct-CWD repository declaration is present, reconciles declared resolved repository-skill projections for compatible runtimes. Provide `--dry-run`; never create a declaration, add undeclared skills, overwrite foreign non-link content, follow symlinks, or guess a missing provider or runtime.
4. Establish the command result contract: `ki diag` is read-only and renders global results plus an optional direct repository section; `ki repair` renders global repair results plus an optional direct repository section, is a no-op when both scopes are healthy, and exits non-zero for unrepairable diagnostics after reporting them.
5. Add CLI-contract coverage for direct versus nested/ancestor declarations, no-repository CWD behaviour, selector rejection, workspace/mGit non-expansion, repository projection failures and successful repair, dry-run, foreign-entry protection, unresolved providers, and global-plus-repository output ordering.
6. Update command inventory, completion scripts, README, manual, and changelog. Keep Diagnostics ahead of Development in the manual and validate the finished roff with `mandoc -Tlint man/ki.1`.

## Files touched

- `src/commands/diag.ts`
- `src/commands/doctor.ts`
- `src/commands/repair.ts`
- `src/core/repository-operations.ts`
- `src/agents/skills.ts`
- `src/tests/cli/doctor.test.ts`
- `src/tests/cli/repo-targets.test.ts`
- new CLI contract tests for `diag` and `repair`
- command inventory and completion tests
- `README.md`
- `man/ki.1`
- `CHANGELOG.md`

## Verify

- Targeted CLI tests for diagnostics, repair, repository skill activation, repository target selection, help, and completions.
- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check`
- `mandoc -Tlint man/ki.1`
- `ki repo audit --skill ki-roadmap --repo .`

## Dependencies / blocks

This is a Blocking command-topology and repository-projection-health gap. It is independent of workspace registration (`KI-TOOL-CLI-011`), bootstrap rollback (`KI-TOOL-CLI-012`), parser diagnostics (`KI-TOOL-CLI-013`), and repository initialization (`KI-TOOL-CLI-014`), but must settle the top-level diagnostic/repair contract before a separate repository repair command is added.

## Discussion

### Direct-CWD means direct

The commands must inspect `context.workingDirectory/.ki-config.toml`, not perform repository resolution. That makes their result local and unsurprising: invoking them from a child directory of a repository does not reach upward, and invoking them from a workspace root does not recurse into its members. A regular direct declaration enables the repository portion; an invalid or symbolic entry is reported as a direct repository configuration error without selecting anything else.

### One local surface, separate target operations

`ki repo` remains appropriate where a user deliberately selects one or many repositories for an operation. Diagnostics and repair are different: they explain and, within strict ownership boundaries, reconcile the environment immediately around the invoking directory. Removing `ki repo diag` makes that distinction visible in the grammar rather than relying on options to change the meaning of a diagnostic command.

### Safe repair boundary

Repair is reconciliation, not inference. It may recreate a missing or stale KI-managed link when the declaration, provider, runtime intersection, and expected source are all valid. It must stop with an actionable result for a malformed declaration, unavailable provider, unsupported runtime, foreign path, or any state where it cannot prove both ownership and the intended target. `--dry-run` must show precisely the actions it would take without changing disk state.
