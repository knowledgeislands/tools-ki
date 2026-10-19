---
id: KI-TOOL-KI-CLI-161
area: CLI
title: Git message check
kind: deliver
purpose: capability
component: git
project: tools-burndown
priority: high
size: s
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: b32a5e5a6f752c5686bbf3e27ff4b77d16b3a968
created_at: 2026-10-19T21:30:00Z
updated_at: 2026-10-19T23:53:17Z
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

## Current state

No `ki git` command group exists. tools-ki's own `.githooks/commit-msg` runs Commitlint against `commitlint.config.ts`, which carries the four rules above over `@commitlint/config-conventional`. The `ki-git` standard already names `ki git check-message` as the package-less binding once this record ships.

## Design

Decided under HIGH-APPLY, 20 October:

- **Command group:** a new root group `ki git` with one subcommand, `check-message <file>`, as COMMIT-MSG a) names it; `git` joins the `ki-work-roadmap` components in `.ki.toml`.
- **Rule source:** the rule set lives in one tools-ki core module, `src/core/git/message.ts`, as the published canonical Commitlint configuration does. Reading `ki-git`'s prose at run time would be fragile, and a harness data file is a ki-agentic-harness change outside this record; a later harness data file can replace the constants without changing the command.
- **Input:** the message file only, as Git passes it to `commit-msg`; no standard-input form.
- **Commitlint:** the Bun repositories keep Commitlint; dropping it is the hooks rollout's decision, outside this record.

Behaviour:

- Lines from a scissors line (`# ------------------------ >8 ------------------------`) onward are dropped, then every line starting with `#`; leading blank lines are skipped and the first remaining line is the header.
- A header Git generates passes untouched, as Commitlint's default ignores do: `Merge branch|tag|remote-tracking branch|pull request …`, `Merge … into …`, `Revert …`, `Reapply …`, and `fixup!`, `squash!` and `amend!` prefixes.
- Otherwise the header must read `type(scope)!: subject` with optional scope and `!`. Checks, in order: an empty message; a header not in that form; a type outside `chore`, `docs`, `feat`, `fix`, `refactor`, `test`; a scope segment, split on `/` and `,`, that is not lowercase kebab-case; an empty subject; a subject ending in a full stop.
- A pass exits 0 silently. A failure writes `ki: error: <rule>: <reason>` and a `next: <remedy>` line to standard error, as every `ki` error does, and exits 1. A missing or unreadable file exits 1 naming the path; usage errors exit 2.

## Requirements

1. A conventional header with each permitted type, with and without kebab-case scope and `!`, passes silently.
2. Each rule fails with exit 1 and a one-line reason naming the rule and the remedy.
3. Comment lines and everything from the scissors line are ignored.
4. Git-generated merge, revert, reapply and autosquash messages pass.
5. A missing file fails naming the path.
6. Help, manual, command inventory, README, changelog, the repository-operations specification and `.ki.toml` components name the command.

## Steps

- [x] Add `src/core/git/message.ts` with the rule set and checker.
- [x] Add `src/commands/git/index.ts` and register `git` in the root catalogue.
- [x] Add `src/tests/cli/git/check-message.test.ts` through `run(args, context)`, and the inventory test lines.
- [x] Add `git` to the `.ki.toml` components.
- [x] Update the manual, regenerated command inventory, README, changelog and a new repository-operations requirement.
- [x] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/git/message.ts`, `src/commands/git/index.ts`, `src/commands/root/catalogue.ts`, `src/commands/root/index.ts`
- `src/tests/cli/git/check-message.test.ts`, `src/tests/cli/manage/inventory.test.ts`
- `.ki.toml`, `man/ki.1`, `man/ki.commands.json`, `README.md`, `CHANGELOG.md`, `docs/specs/repository-operations.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and `ki repo audit` pass.
- The source-built command accepts this repository's recent commit messages and rejects a bad one.

## Dependencies / blocks

None to build. The hooks rollout's package-less wave adds `.githooks/commit-msg` only after this ships, and the Bun wave may switch from Commitlint to it once it does.

## Documentation impact

### Decision Records

None: COMMIT-MSG a) and the HIGH-APPLY choices in Design are the decisions.

### Specifications

A new repository-operations requirement for `ki git check-message`.

### Guides

None beyond the README and manual.

### Roadmap

None.

## Review

### Delivered

The whole record, from baseline `b32a5e5a` on 20 October 2026, by the `burnki` run in the tools-burndown Project.

### Change Summary

- `src/core/git/message.ts`: the six types and the checker, returning the first broken rule with its reason and remedy.
- `src/commands/git/index.ts`, `src/commands/root/*`: the new `ki git` group and `check-message <file>`.
- `src/cli.ts`: `ki git` skips MCP inventory adoption, like help and the recovery diagnostics, so a malformed MCP configuration cannot block a commit.
- `src/tests/cli/git/check-message.test.ts`: 26 cases through `run(args, context)`; `src/tests/cli/manage/inventory.test.ts` gains the group.
- `.ki.toml` (in the planning commit), the manual, the regenerated command inventory, README, changelog and REPO-OPS-030.
- Deviation: the failure renders as the house `ki: error:` line with a `next:` remedy line rather than one combined line.

### Verification

| Requirement | Evidence |
| --- | --- |
| 1 | `passes %j silently`, six headers across types, scopes and `!` |
| 2 | `rejects %j naming the rule and remedy`, eight cases covering every rule |
| 3 | `ignores comment lines, leading blank lines and everything from the scissors line` |
| 4 | `passes the Git-generated header %j`, ten headers |
| 5 | `refuses a missing message file, naming its path` |
| 6 | Inventory tests pass; REPO-OPS-030, manual, README and changelog name the command |

- Gate: `bun run test:coverage` passed, 83 files and 1,450 tests at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and the command-inventory check passed; `ki repo audit --repo .` FAIL=0.
- The source-built command passed a recent commit message of this repository and a valid header, and rejected `Fix things.` with exit 1.

### Outstanding concerns

- A repository with `core.commentChar` other than `#` would have its comment lines read as message text; no KI repository sets it.
- The rule set is a copy of `ki-git`'s, as the Commitlint configuration is; a harness data file could replace it later.

### Post-change review

Package-less repositories can now bind `.githooks/commit-msg` to `ki git check-message "$1"`, which the hooks rollout's package-less wave waits on; the command ships with the next release.

### Mini recap

`ki git check-message <file>` checks a commit message against the deterministic `ki-git` rules with no package.

## Discussion

The four planning questions are settled in Design. Header length and subject case, which `@commitlint/config-conventional` also checks, are left out because `ki-git` does not bind them; tools-ki owns priority and design.
