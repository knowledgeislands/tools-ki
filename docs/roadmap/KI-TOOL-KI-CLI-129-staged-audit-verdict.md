---
id: KI-TOOL-KI-CLI-129
area: CLI
title: Scoped audit verdict
project: ways-of-working
component: repo
purpose: capability
kind: deliver
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 3026ab6a4255d960364b89ce1586776b79fefa06
created_at: 2026-10-14T19:25:02Z
updated_at: 2026-10-14T19:47:24Z
---

# Staged and explicit-path verdict scope on `ki repo audit`

## Goal

`ki repo audit` gains two options that narrow its verdict without narrowing its evaluation: `--staged` scopes the verdict to the paths staged in the repository's Git index, and `--paths` scopes it to an explicit list. Every rubric item still runs against the whole tree and every finding is still rendered; only a FAIL finding whose subject is a scoped path, a path under one, or a directory containing one makes the audit fail. A Knowledge Base pre-commit hook can then refuse the commit that causes a finding while leaving unrelated threads free to commit, with CI keeping the whole-tree verdict.

## Context

Kris accepted the design on 2026-10-14 at 20:20 BST in the `ways-of-working` thread, as received: "GATE-SCOPE / accept the design: open a KI-TOOL-KI-CLI record for --staged and --paths on ki repo audit and a KI-HARNESS-GOV record for the GATE-1 sentence; switch ki-principal's hook once the released ki carries the option; CI stays whole-tree".

The design is the [gate-scope report](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_THREADS/ways-of-working/gate-scope.report.md). Its finding: ki-principal's `.githooks/pre-commit` audits the whole tree because `ki repo audit` offers no narrower scope, not by decision, so one thread's non-conforming note blocks every other thread's commits. Evaluation must stay whole-tree because many criteria need the whole repository (zone layout, unique roadmap identity, wikilink resolution, a Project's close-out against every open record); only the verdict can be scoped. The directory-containment rule keeps a caused finding in scope: deleting a folder's index note stages a delete under that folder, so a finding on the folder blocks; staging a duplicate record identifier puts the finding on the staged file.

The sibling harness record carries one sentence in `ki-repo-kb` GATE-1 allowing a Knowledge Base hook to scope the audit's verdict while CI keeps the whole-tree verdict; ki-principal's hook line and Conformance sentence change under Kris's instruction once the released `ki` pin carries the option. Neither is in this record.

## Boundary

- In scope: `--staged` and `--paths <path...>` on `ki repo audit`, their validation, the Git index read through the injected runner, the containment rule, the rendering that marks findings outside the scope and discloses the scoped verdict, the exit status, tests through `run(args, context)` and `sandbox()`, the `REPO-AUDIT` specification, the repository-operations guide, `man/ki.1` and its generated inventory, and `CHANGELOG.md`.
- Out of scope: any change to rubric evaluation or to `ki repo conform`; a machine-readable reporter; the harness GATE-1 sentence and its checker; ki-principal's hook and Conformance note; a release, tag, publication or pin bump, which Kris decides separately.

## Requirements

- `--staged` reads the repository's staged paths with `git diff --cached --name-only --no-renames --diff-filter=ACMDT`, relative to the repository root, through the injected runner. A repository that is not a Git working tree, or whose index cannot be read, fails the command with a usage error before any audit runs.
- `--paths` takes one or more repository-relative paths; an absolute path inside the repository is accepted and made relative, and a path outside the repository is a usage error. The two options combine into one scope.
- Evaluation is unchanged: every selected skill runs every mechanical item against the whole repository, and every finding is rendered under the existing reporter levels.
- A finding is in scope when its subject names a scoped path, a path under a scoped directory, or a directory containing a scoped path. A finding with no subject, or whose subject is not a path, is outside the scope. A deleted staged path stays in scope so a finding on its containing directory still blocks.
- With a scope, the audit fails only on a FAIL finding in scope or a local registration failure. Findings outside the scope are rendered with an `outside scope` mark, and the summary discloses the scope and its in-scope counts beside the whole-tree counts.
- Without either option the command's output and exit status are byte-for-byte unchanged.

## Current state

`ki repo audit` takes `--skill`, `--progress`, `--progress-style`, `--reporter-levels` and `--concise` only. `auditRepositories` in `src/core/repository/operations/audit.ts` fails on any FAIL finding across the whole tree. Every finding may carry a `subject`, which the `ki-repo-kb` rubric fills with a repository-relative path, and rendering appends it after the criterion. The repository operation context carries no runner or environment, so core audit cannot yet ask Git anything.

## Steps

- [x] Add `runner` and `environment` to the repository operation context so core audit can read the Git index through the injected seam.
- [x] Add a core verdict-scope module: staged-path listing, explicit-path normalisation, and the containment predicate.
- [x] Thread the scope through `auditRepositories`, computing the failing verdict from in-scope FAIL findings and exposing the scope on each repository result.
- [x] Add `--staged` and `--paths` to the command, render the scope line, the outside-scope mark and the scoped summary counts, and keep unscoped output unchanged.
- [x] Cover the behaviour with CLI contract tests: staged scope passes on an unrelated finding and fails on a staged one, containment on a containing directory and a deleted path, explicit paths, combined options, validation errors, concise rendering and unchanged unscoped output.
- [x] Document the options in the specification, the user guide, the manual and its generated inventory, and the changelog.
- [x] Run the full gates and set the record to awaiting review.

## Files touched

`src/commands/repo/audit.ts`, `src/commands/repo/operation-context.ts`, `src/commands/repo/shared/reporting/audit.ts`, `src/commands/repo/shared/reporting/shared.ts`, `src/core/repository/operations/audit.ts`, `src/core/repository/operations/types.ts`, `src/core/repository/operations/verdict-scope.ts` (new), `src/core/repository/operations/index.ts`, `src/tests/cli/repo/verdict-scope.test.ts` (new), `docs/specs/repository-audit.md`, `docs/guides/user/repository-operations.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, this record.

## Verify

`bun run test`, `bun run test:coverage` at the repository's 100% thresholds, `bunx tsc --noEmit`, `bunx biome check`, `bun run ki:tools:lint-man`, `ki repo audit --repo .` and `git diff --check`. The new test file asserts exit status and output through the public CLI seam against a sandbox Git repository with real staged changes; no test contacts the network.

## Dependencies / blocks

No same-repository dependency. The ki-principal hook change depends on a released `ki` carrying this option and the `.github/ki-version` pin being bumped, which Kris authorises separately. The harness GATE-1 sentence is independent: its checker already accepts the hook line with a flag.

## Documentation impact

### Decision Records

No decision record. The whole-tree-evaluation, scoped-verdict choice is recorded here and in the gate-scope report; it does not change an accepted architecture or authority boundary.

### Specifications

`docs/specs/repository-audit.md` gains a `REPO-AUDIT` item for the scoped verdict and extends the accepted-options item so the command's option list stays exact.

### Guides

`docs/guides/user/repository-operations.md` describes the two options and the pre-commit use.

### Roadmap

No follow-on record here. The harness and ki-principal sides are owned by their repositories and Kris's instruction.

## Review

### Delivered

One feature commit on `main` from baseline `3026ab6a4255d960364b89ce1586776b79fefa06`, `feat(repo): scope the audit verdict to staged or named paths`: `ki repo audit --staged` and `--paths <path...>` narrow the verdict to a scope while every criterion still runs against the whole repository and every finding is still rendered. The scope is resolved before the report frame opens, so an unreadable index or a path outside the repository is a usage error with exit 2 and no audit runs. The frame carries a `⌖ verdict scoped to <n> <source> path(s)` line, a finding outside the scope carries `(outside scope)` after its subject, and the summary leads with the scoped verdict and `SCOPE: <n> paths FAIL=<f> WARN=<w>` before the whole-tree counts. A local registration failure blocks whatever the scope. Without either option the output and exit status are byte-for-byte unchanged. Delivered under Kris's decision of 2026-10-14 at 20:20 BST: "open a KI-TOOL-KI-CLI record for --staged and --paths on ki repo audit".

### Change Summary

- `src/core/repository/operations/verdict-scope.ts` (new) owns the staged-path read (`git diff --cached --name-only --no-renames --diff-filter=ACMDT --relative -z` through the injected runner), explicit-path normalisation within the repository, and the containment predicate `findingInScope`.
- `src/core/repository/operations/types.ts` adds `environment` and `runner` to `RepositoryOperationContext`; `src/commands/repo/operation-context.ts` supplies them from `KiContext`. `src/core/repository/operations/audit.ts` takes an optional `verdict` request, resolves it per repository before the frame opens, exposes `scope` on each result and fails only on in-scope FAIL findings or a registration failure.
- `src/commands/repo/audit.ts` adds the two options and forwards the scope to rendering. `src/commands/repo/shared/reporting/shared.ts` lets a finding entry carry a mark after its subject and a frame carry trailing context entries; `src/commands/repo/shared/reporting/audit.ts` renders the scope line, the outside-scope mark, the scoped verdict and counts, and the scoped multi-repository recap. `conform.ts` only follows the `findingEntry` signature.
- `src/tests/cli/repo/verdict-scope.test.ts` (new) holds ten CLI contract tests against sandbox Git repositories with real staged changes.
- `docs/specs/repository-audit.md` gains REPO-AUDIT-011 and extends REPO-AUDIT-005; `docs/guides/user/repository-operations.md` gains a scoped-verdict section; `man/ki.1` (both synopsis lines, a description paragraph, `.TH` date) and the regenerated `man/ki.commands.json`; `CHANGELOG.md` command surface and notable behaviour.

### Verification

- `bun run test:coverage`: 70 files, 1164 tests pass at 100% statements, branches, functions and lines; `bunx tsc --noEmit` clean; `bunx biome check src` at the pre-change baseline (26 warnings, 13 infos, 0 errors); `bunx knip` reports no unused exports; `bun run ki:tools:lint-man` and `mandoc -T lint` clean; `rumdl check` clean on the changed Markdown; `git diff --check` clean.
- `ki repo audit --repo .`: the only FAIL is the pre-existing DEPS-1 finding (four devDependencies beyond the 14-day adoption window), present at the baseline and outside this record, which forbids package installs. KNIP-2 failed mid-run on four unused type re-exports this change had added to the operations barrel; they were removed and KNIP-2 now passes. `ki repo audit --repo . --staged` on this change reports PASS with the DEPS-1 finding marked outside scope.
- `ki repo audit --skill ki-work-roadmap` passes on this record.

### Outstanding concerns

- DEPS-1 fails on `main` independently of this change: `@biomejs/biome`, `@vitest/coverage-v8`, `knip` and `vitest` have patch updates beyond the adoption window. Adopting them is a package change this run was not authorised to make and needs its own record or a dependency hold.
- A release, tag and `.github/ki-version` pin bump for the ki-principal hook switch are Kris's separate decision and are not performed here; the harness GATE-1 sentence and ki-principal's hook and Conformance note are owned by their repositories.
- A finding without a subject is outside every scope by design (see Discussion). A rubric that reports a path-caused failure without a subject would therefore not block a scoped commit; the `ki-repo-kb` rubric sets subjects, and CI's whole-tree verdict remains the backstop.

### Post-change review

The goal is met: the verdict is scoped, the evaluation is not, and the design's containment rule (staged path, path under a scoped directory, directory containing a scoped path, deletions included) is implemented and tested. Scope held to the record's boundary; conform, rubric evaluation and the harness sentence are untouched. Regression risk is low: unscoped output is asserted unchanged by a dedicated test and by the 380 existing repository tests, and the new context fields are additive. Ready for acceptance; the release that lets ki-principal use the option is a separate decision.

### Mini recap

Delivered `--staged` and `--paths` on `ki repo audit` with scoped verdict, whole-tree evaluation, marked findings and scoped summary; verified by the full gate at 100% coverage and a self-audit whose only failure predates the change. Concerns: the pre-existing DEPS-1 failure, the separate release decision, and the subject-less-finding rule. Possible learning route, not promoted: a rubric-authoring note that a FAIL finding should name its subject so scoped verdicts can attribute it.

## Discussion

### Why the verdict and not the evaluation

Scoping evaluation to staged files would make tree-wide criteria lie: a zone or identity check cannot be answered from one file. The gate-scope report lists the criteria that need the whole tree. Scoping the verdict keeps every answer true and only decides which answers block.

### Subject-less findings

A finding that names no path cannot be attributed to a staged change, so it is outside the scope. The alternative, treating it as always in scope, would make `--staged` useless whenever any tree-wide FAIL exists, which is the condition the option exists to relieve. CI's whole-tree verdict catches it.
