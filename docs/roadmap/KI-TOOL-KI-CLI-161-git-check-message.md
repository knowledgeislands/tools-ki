---
id: KI-TOOL-KI-CLI-161
area: CLI
title: Git message check
project: tools-burndown
priority: medium
size: s
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T21:30:00Z
updated_at: 2026-10-19T21:55:00Z
transferred_from: ki-principal ki.tools-burndown hooks-standard design, COMMIT-MSG a), 2026-10-19
---

# KI-TOOL-KI-CLI-161: Git Message Check

## Goal

`ki git check-message <file>` checks a proposed commit message against the deterministic `ki-git` message rules and exits non-zero with a one-line reason when it fails, so that every KI repository's committed `.githooks/commit-msg` can call it with no Node or package dependency.

## Context

Kris decided on 19 October, under GIT-HOOKS a) and COMMIT-MSG a) in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md), that every KI repository keeps all hook content in a committed `.githooks/`, bound by `core.hooksPath`, that Husky leaves the estate, and that message checks come from a `ki git check-message` command; until it ships, package-less repositories run `pre-commit` only. The [hooks-standard design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/design/hooks-standard.md) sets out the convention and the rollout.

Today Commitlint checks messages only in Bun repositories, through `.husky/commit-msg`; about 21 package-less KI repositories have no message check. A shell pattern in each hook would copy the `ki-git` vocabulary into every repository and drift from it.

The deterministic rules are those `ki-git`'s standard binds through Commitlint today: the type is one of `chore`, `docs`, `feat`, `fix`, `refactor` and `test`; a scope, when present, is lowercase kebab-case; the subject is non-empty and has no terminal full stop; Git-generated merge and revert messages pass, as Commitlint's conventional default treats them. Judgment rules (imperative mood, narrowest type, one coherent unit) stay with `ki-git` and are not checked.

## Boundary

- In: the command, reading the message file Git passes to `commit-msg` and ignoring comment lines and a scissors cut as `git commit` does; the rule set above taken from one source that `ki-git` owns, ideally read from the installed harness rather than copied; exit codes and a concise failure message naming the rule and the remedy; help text, manual, command inventory, README and REPO-OPS-028 lines; tests through `run(args, context)`.
- Out: writing or binding hooks, which the hooks-standard composition and binding work owns; any change to `ki-git`'s vocabulary; trailer checks; replacing Commitlint inside this record, which the Husky retirement in the hooks rollout decides.

## Dependencies / blocks

None to build. The hooks rollout's package-less wave adds `.githooks/commit-msg` only after this ships, and the Bun wave may switch from Commitlint to it once it does.

## Discussion

Open for planning: whether `ki git` becomes a new command group, which needs a `git` component in `.ki.toml`, or the command sits under an existing group; whether the rule set is read from the harness's `ki-git` references or a small published data file; whether a message on standard input is also accepted; and whether the Bun repositories drop Commitlint for this command, which would remove two devDependencies from `PKG-5`. tools-ki owns priority and design.
