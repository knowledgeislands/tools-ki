---
id: KI-TOOL-CLI-015
title: Unify direct-CWD diagnostics and repair
theme: cli
horizon: blocking
status: acceptance
blocks: []
blocked-by: []
baseline-ref: 8183c56dc890095c15c18b8f2a32ab702a929c43
---

## Context

Make `ki diag` and a new top-level `ki repair` the single local diagnostics-and-recovery surface. Both commands always consider user/global KI state; when, and only when, the current working directory itself contains `.ki-config.toml`, they additionally report or repair that one repository. `ki repair` also attempts to register that direct physical root before evaluating whether later repair is possible. This replaces the selected-target diagnostic command `ki repo diag` and avoids introducing `ki repo repair`.

## Boundary

Neither `ki diag` nor `ki repair` accepts `--repo`, `--workspace`, or another repository selector. They do not discover a declaration in an ancestor, expand a workspace or `.mgit-config.toml`, follow a symlink, or select multiple repositories. A directory without a direct `.ki-config.toml` receives only the global result and is not an error. Repository operations that intentionally address explicit or multiple targets remain under `ki repo`.

This item does not make repair a general configuration generator, change bootstrap/local-mode recovery (`KI-TOOL-CLI-012`), make `ki repo init` implicit (`KI-TOOL-CLI-014`), or replace repository governance commands such as `ki repo audit` and `ki repo conform`. Registration is inventory only: it does not turn a failing repository into a conformant one or bypass later repair diagnostics.

## Current state

`ki diag` reports only installation mode, paths, and user configuration. `ki repo diag` delegates to `resolveRepositoryTargets`, so it accepts the repository command's `--repo` and `--workspace` selectors and can discover through a workspace, mGit configuration, or ancestors. `ki doctor` only validates the shape of a direct-CWD repository declaration; it does not resolve its declared skills or inspect their repository-local agent projections. There is no repair command.

## Steps

1. Remove `ki repo diag` and fold its useful direct-CWD repository information into `ki diag`, following the global report with a clearly labelled repository section only when the current directory contains `.ki-config.toml`.
2. Extend direct-CWD repository diagnostics to resolve every declared skill from the active provider and check the compatible repository-agent projection: each expected projection must be a non-dangling KI-managed symlink to the resolved skill source. Report malformed declarations, unresolved providers, missing projections, non-link/foreign entries, dangling links, stale targets, and incompatible runtime declarations deterministically.
3. Add top-level `ki repair`. It first reconciles only KI-managed global state that its diagnostics can prove needs repair, then, when a direct-CWD repository declaration is present, attempts to register that physical root before resolving the declaration or repository-skill projections. It then reconciles declared resolved repository-skill projections for compatible runtimes. Provide `--dry-run`; never create a declaration, add undeclared skills, overwrite foreign non-link content, follow symlinks, or guess a missing provider or runtime.
4. Establish the command result contract: `ki diag` is read-only and renders global results plus an optional direct repository section; `ki repair` renders global repair results plus an optional direct repository section, records a direct physical KI root even when later diagnostics are unrepairable, is a no-op when both scopes are healthy, and exits non-zero for unrepairable diagnostics after reporting them.
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

## Delegation

One fresh serial implementation worker (`gpt-5.6-sol`, high reasoning) owns direct-CWD diagnostics, repair, projections, tests, and documentation after CLI-013 and CLI-014 have landed. Locked: no selectors or discovery; direct regular declaration only; repair reconciles only proven KI-managed links and never adopts foreign content; diagnostics remain read-only. Escalate any proposed global repair action that is not already proven by a diagnostic or requires creating/guessing configuration. Done means the direct-CWD, rejection, projection, repair, dry-run, and documentation contract passes, followed by the full suite, typecheck, style check, roff lint, and roadmap audit. The worker stops before commit for review.

## Acceptance

Delivered in `09b90c4 feat(cli): unify direct repository diagnostics and repair`.

- Retired `ki repo diag`; top-level `ki diag` now adds a read-only repository section only for a regular direct-CWD declaration and checks declared compatible projections.
- Added `ki repair [--dry-run]`, which records a direct physical repository before evaluation and repairs only missing, dangling, or stale KI-managed projections; foreign entries and unresolvable declarations remain reported failures.
- Both commands reject selectors and do not traverse ancestors, workspace, mGit, or symbolic declarations. Public help, completions, README, changelog, and manual reflect the topology.

Verified with `bun run test --coverage` (447 passing; 100% statements, branches, functions, and lines), `bunx tsc --noEmit`, `bunx biome check`, `bun run ki:tools:lint-man`, `git diff --check`, and `ki repo audit --skill ki-roadmap --repo .`.

No release, push, or lifecycle closure has been performed.

## Discussion

### Direct-CWD means direct

The commands must inspect `context.workingDirectory/.ki-config.toml`, not perform repository resolution. That makes their result local and unsurprising: invoking them from a child directory of a repository does not reach upward, and invoking them from a workspace root does not recurse into its members. A regular direct declaration enables the repository portion; an invalid or symbolic entry is reported as a direct repository configuration error without selecting anything else.

### One local surface, separate target operations

`ki repo` remains appropriate where a user deliberately selects one or many repositories for an operation. Diagnostics and repair are different: they explain and, within strict ownership boundaries, reconcile the environment immediately around the invoking directory. Removing `ki repo diag` makes that distinction visible in the grammar rather than relying on options to change the meaning of a diagnostic command.

### Safe repair boundary

Repair is reconciliation, not inference. It may recreate a missing or stale KI-managed link when the declaration, provider, runtime intersection, and expected source are all valid. It must stop with an actionable result for a malformed declaration, unavailable provider, unsupported runtime, foreign path, or any state where it cannot prove both ownership and the intended target. `--dry-run` must show precisely the actions it would take without changing disk state.

### Registration boundary

Registration is separate from repairability. When the direct CWD has a physical regular `.ki-config.toml`, `ki repair` records that root in the local registry before it interprets the declaration or projection state. A malformed or unavailable declaration therefore remains available for later audit and bulk work, while `ki diag` stays read-only and `--dry-run` changes nothing.
