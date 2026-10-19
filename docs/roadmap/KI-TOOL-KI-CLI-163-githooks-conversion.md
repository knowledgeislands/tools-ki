---
id: KI-TOOL-KI-CLI-163
area: CLI
title: Committed githooks conversion
kind: deliver
purpose: capability
project: tools-burndown
component: repo
priority: high
size: m
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 0629726466b3cb085c4ec3c1bb2f2e5da8a01390
created_at: 2026-10-19T22:10:00Z
updated_at: 2026-10-19T22:15:00Z
transferred_from: ki-principal ki.tools-burndown hooks-standard design section 4.2, GIT-HOOKS a), 2026-10-19
---

# KI-TOOL-KI-CLI-163: Committed Githooks Conversion

## Goal

`ki repo conform` moves a repository's commit gate into a committed `.githooks/`: it writes `.githooks/pre-commit` and `.githooks/commit-msg` with any Husky content inlined behind the common refusal frame, sets `prepare` to bind `core.hooksPath` while keeping a boundary-install suffix, removes `husky` and `.husky/`, and binds the clone, so that each pilot repository converts in one reviewed run.

## Context

Kris decided on 19 October, under GIT-HOOKS a) in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md), that every KI repository keeps all hook content in a committed `.githooks/`, bound by a relative `core.hooksPath`, and that Husky and `.husky/` leave. The [hooks-standard design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/design/hooks-standard.md), section 4.2, names the tools-ki side; WAVE-PLAN a) runs the pilot wave in ki-principal, tools-ki and va-principal with this change's local source build.

The harness side landed first as ki-agentic-harness `95a1ab58`: `ki-repo` HOOK-1 to HOOK-5 diagnose existence, binding, refusal and Husky remnants at WARN, and `ki-engineering` SCR-5 and SCR-11 repair a `prepare` or hook content once both committed hooks carry the frame. Neither creates a hook: a rubric write cannot set the executable mode, and a binding lives in the clone's Git configuration, outside any rubric proposal. The host has to do both.

## Boundary

- In: a host-owned hook-conversion step in `ki repo conform` when `ki-repo` is among the selected skills; composing both hooks from the existing `.githooks/` stub and `.husky/` content; refusing whatever it cannot attribute; the `prepare`, `husky` dependency and `bun.lock` edits; deleting `.husky/`; the binding and the `.husky/_` leftover; dry-run reporting; tests through `run(args, context)`; the manual, changelog and README lines.
- Out, each its own unit: the shape-skill hook-content claims mechanism, which needs the harness to declare claims, so a repository with no hook and no Husky, such as va-principal, gets no composed content here; the `ki estate converge` binding sweep; `ki git check-message` ([KI-TOOL-KI-CLI-161](KI-TOOL-KI-CLI-161-git-check-message.md)); running the conversion against any repository, which the wave runs own; a release.

## Current state

tools-ki has no hook handling. Its own `.husky/pre-commit` and `.husky/commit-msg` are bound through `.husky/_`; ki-principal and ki-agentic-harness carry committed `.githooks/` stubs that refuse on missing tools and then run `sh "$root/.husky/<hook>"`. `NativeWrite` already carries an optional `mode`; publication has no deletion.

## Design

### When it runs

In `conformRepositories`, after the registry write and skill resolution and before the rubric conform, when `ki-repo` is among the selected skills. It reads the tree first and calls Git only when `.githooks/` or `.husky/` exists, so a repository with neither is untouched. In a dry run it reports every proposed change and makes none; otherwise it publishes the conversion before the rubric conform, so SCR-5 and SCR-11 then audit and repair the converted tree.

### Composition

For each of `pre-commit` and `commit-msg`:

- `.husky/<hook>` is read with Husky boilerplate removed: a leading shebang and the Husky 8 `. "$(dirname -- "$0")/_/husky.sh"` line. `bunx <tool>` becomes `<tool>`, the tool joining the `node_modules/.bin` refusal list, since the frame puts that directory on `PATH`.
- An existing `.githooks/<hook>` splits into its frame and its content. The frame is every leading line the frame template recognises: shebang, comments, blanks, `root=`, the `missing` loops and their tests, the refusal `if`, `echo` and `exit 1` lines, and the `PATH` step; its tool lists are kept. In the content, the one line `sh "$root/.husky/<hook>" "$@" || exit 1` or `exec sh "$root/.husky/<hook>" "$@"` is replaced by the Husky content; every other content line is kept.
- The hook is then written whole: `#!/bin/sh`, a two-line comment, `root=`, the `node_modules/.bin` refusal (package-backed only), a `command -v` refusal for `ki` and for tools the old frame tested that way, the `PATH` step (package-backed only), then the content. Tool lists keep first-seen order. The file is written at mode `0755`; an unchanged file is not rewritten.
- A `.githooks/<hook>` that does not delegate to Husky is left as it is.

It refuses the whole conversion, naming the file and line and writing nothing, when it meets: a tracked `.husky/` file other than the two hooks; a `.husky/<hook>` that an existing non-delegating `.githooks/<hook>` would orphan; any other `.husky` reference in a stub or in Husky content; a frame line it does not recognise; or a hook path that is not a regular file.

### Manifest, lockfile and `.husky/`

- `prepare`: `husky`, `husky install`, either followed by `&& <rest>`, becomes `git config core.hooksPath .githooks`, then `&& <rest>` unless `<rest>` is that same binding, and so the boundary-install suffix is kept. A missing `prepare` is set to the binding. Any other Husky call refuses; a `prepare` without Husky is left alone.
- `husky` leaves `dependencies` and `devDependencies`. The manifest is reserialised with its own indentation, or on one line where it was one line, keeping key order.
- `bun.lock` loses exactly its workspace `"husky": "<range>",` line and its `"husky": ["husky@…` package line; any other `husky` mention refuses. Another lockfile refuses while `husky` is declared, since only a networked install could rewrite it.
- `.husky/` is removed whole, untracked `_` included.

### Binding

When `.githooks/pre-commit` exists or is being written, `git config --get core.hooksPath` is read in the repository root. Unset, or resolving to `.husky/_`, it is set to `.githooks`; any other value is reported and left alone. A leftover untracked `.husky/_` with no tracked `.husky/` file is removed. Reversal is `git config --unset core.hooksPath`.

### Reporting

Each change prints one line through the existing conform event stream: `proposed write`, `would apply write`, `applied write`, and new `remove <path>`, `would remove <path>`, `bind core.hooksPath .githooks`, `would bind …` and `keep core.hooksPath <value>` lines.

## Requirements

1. Inlines ki-principal's and tools-ki's Husky hooks into frame-first `.githooks/` hooks that pass the harness HOOK-4 and SCR-11 checks.
2. Keeps repository-specific content after the delegation line, such as ki-principal's KB audit.
3. Keeps the boundary-install suffix in `prepare`.
4. Removes `husky` from the manifest and `bun.lock`, and `.husky/` from the tree.
5. Binds an unset or `.husky/_` clone and leaves any other value with a report.
6. Refuses unattributable lines, unknown `.husky` files and other lockfiles, writing nothing.
7. Writes hooks at mode `0755`.
8. Is idempotent: a second run changes nothing.
9. A dry run changes nothing.
10. Runs only with `ki-repo` selected and touches no repository without `.githooks/` or `.husky/`.

## Steps

- [x] Add `src/core/repository/hooks.ts`: plan (read, compose, refuse) and apply (writes, removals, binding).
- [x] Wire it into `conformRepositories` with the new events, and render them in `src/commands/repo/conform.ts`.
- [x] Write fixture tests through `run(args, context)` on tools-ki's and ki-principal's hook shapes, package-less and refusal cases, the binding cases, idempotence and dry run.
- [x] Update the manual, changelog and README.
- [x] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/repository/hooks.ts`, `src/core/repository/operations/conform.ts`, `src/core/runtime/git.ts`
- `src/commands/repo/conform.ts`
- `src/tests/cli/repo/hooks.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, `README.md`, `docs/guides/user/repository-operations.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip` and `ki repo audit` pass.

## Dependencies / blocks

Needs ki-agentic-harness `95a1ab58`, landed. Blocks the hooks pilot wave, which converts tools-ki, ki-principal and va-principal with this change's source build.

## Documentation impact

### Decision Records

None: the convention is GIT-HOOKS a) in ki-principal and ADR-KI-HARNESS-SKILLS-017 in the harness.

### Specifications

None: no portable contract changes.

### Guides

The repository-operations guide and the manual's `repo conform` entry name the step.

### Roadmap

The claims mechanism and the estate binding sweep stay "To capture" in the design note.

## Review

### Delivered

The whole record, from baseline `06297264` on 19 October 2026, by the `hookconf` run in the tools-burndown Project.

### Change Summary

- `src/core/repository/hooks.ts`: plans the conversion (reads `.husky/` and `.githooks/`, composes both hooks, edits `package.json` and `bun.lock`, reads the binding) and refuses before any change; applies it by validating every write, reporting each step, then publishing, removing `.husky/` and binding.
- `src/core/repository/operations/conform.ts`: runs the step after the repository frame opens and before the rubric conform, when `ki-repo` is selected; the four hook events join the conform event stream.
- `src/core/runtime/git.ts`: exports `scrubbedGitEnvironment`, so the binding is read and set for the repository root rather than an inherited `GIT_DIR`.
- `src/commands/repo/conform.ts`: renders `write`, `remove`, `bind` and `keep core.hooksPath` lines, with `would` in a dry run.
- Tests: `src/tests/cli/repo/hooks.test.ts` holds 27 cases through `run(args, context)` with real Git.
- Documentation: the manual, the regenerated command inventory, the changelog, README and the repository-operations guide.
- Deviations:
  - The `.husky/` index-tracking check became a directory check: any entry other than `_`, `pre-commit` and `commit-msg` refuses, tracked or not, and so needs no Git call.
  - A missing `prepare` gains the binding only when Husky was in use and a committed pre-commit hook will exist, so a leftover `.husky/_` alone does not add one.
  - A `.githooks/<hook>` whose only `.husky` mention is a comment counts as not delegating.

### Verification

| Requirement | Evidence |
| --- | --- |
| 1 | Covered by `converts a Husky-only repository…` and `inlines Husky into committed stubs…`: the first non-frame line under the HOOK-4 `FRAME_LINE` pattern is the SCR-11 baseline `lint-staged` line |
| 2 | Covered by `inlines Husky into committed stubs…`: the KB audit lines follow the inlined content and `ki` joins the PATH refusal |
| 3 | Covered by `converts a Husky-only repository…` and the `prepare` cases |
| 4 | Covered by `converts a Husky-only repository…`, `a lockless package…` and the lockfile refusals |
| 5 | Covered by the unset, `.husky/_`, `.githooks` and `tooling/hooks` binding cases, and `a failed binding is reported` |
| 6 | Covered by 15 refusal cases and the symlink and non-regular-file case, each asserting every file and the binding unchanged |
| 7 | The mode assertions in `converts a Husky-only repository…` |
| 8 | The repeated run in `converts a Husky-only repository…`, and `…a repository already converted needs nothing` |
| 9 | Covered by `a dry run reports every change and makes none` |
| 10 | Covered by `runs only with ki-repo selected…`, whose hook-less case runs with the refusing sandbox runner |

- Gate:
  - `bun run test:coverage` passed: 82 files and 1,405 tests, all at 100%.
  - `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and the command-inventory check all passed.
  - `ki repo audit --repo .` passes with no failure. Its HOOK-1, HOOK-3, HOOK-5, SCR-5 and SCR-11 warnings are tools-ki's own unconverted Husky gate, which the pilot wave converts.
- Composition was planned, without applying, on temporary copies of the tracked hook files, manifest and lockfile of tools-ki, ki-principal and ki-agentic-harness. All three composed with no refusal, the Husky content inlined, ki-principal's KB audit and ki-agentic-harness's staged-skill functions kept, and `tsc` and `ki` in their refusal lists. No repository was touched.

### Outstanding concerns

- va-principal has no hook and no Husky, so this step gives it nothing; its first `.githooks/pre-commit` needs the claims mechanism or a hand-written hook.
- Once released, every `ki repo conform` with `ki-repo` selected converts a Husky repository. The pilot runs the local source build; the release should follow the pilot so that the estate converts only after it.
- Refusal names a file and line but not a fix for every case; the wave runs will show which refusals need a hand edit.

### Post-change review

The conversion composes from what each repository already runs rather than from a template, so it needs no harness claim and keeps repository-specific content, at the cost of refusing whatever it cannot place. Planning everything before any write makes a refusal leave the tree, manifest, lockfile and binding untouched.

### Mini recap

`ki repo conform` with `ki-repo` selected now moves a Husky commit gate into a committed, bound, frame-first `.githooks/` and removes Husky; the three Husky repositories compose cleanly.

## Discussion

The conversion is a host step rather than a rubric conform because it needs an executable write, file removal and a Git configuration change, none of which a rubric proposal carries; it composes from what a repository already runs, so it needs no harness claim to convert a Husky repository. A repository with no hook and no Husky needs the claims mechanism, or a hand-written hook, for its first `.githooks/pre-commit`.
