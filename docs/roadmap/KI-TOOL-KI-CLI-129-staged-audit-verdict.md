---
id: KI-TOOL-KI-CLI-129
area: CLI
title: Scoped audit verdict
project: ways-of-working
component: repo
purpose: capability
kind: deliver
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T19:25:02Z
updated_at: 2026-10-14T19:25:02Z
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

- [ ] Add `runner` and `environment` to the repository operation context so core audit can read the Git index through the injected seam.
- [ ] Add a core verdict-scope module: staged-path listing, explicit-path normalisation, and the containment predicate.
- [ ] Thread the scope through `auditRepositories`, computing the failing verdict from in-scope FAIL findings and exposing the scope on each repository result.
- [ ] Add `--staged` and `--paths` to the command, render the scope line, the outside-scope mark and the scoped summary counts, and keep unscoped output unchanged.
- [ ] Cover the behaviour with CLI contract tests: staged scope passes on an unrelated finding and fails on a staged one, containment on a containing directory and a deleted path, explicit paths, combined options, validation errors, concise rendering and unchanged unscoped output.
- [ ] Document the options in the specification, the user guide, the manual and its generated inventory, and the changelog.
- [ ] Run the full gates and set the record to awaiting review.

## Files touched

`src/commands/repo/audit.ts`, `src/commands/repo/operation-context.ts`, `src/commands/repo/shared/reporting/audit.ts`, `src/commands/repo/shared/reporting/shared.ts`, `src/core/repository/operations/audit.ts`, `src/core/repository/operations/types.ts`, `src/core/repository/operations/verdict-scope.ts` (new), `src/core/repository/index.ts`, `src/tests/cli/repo/verdict-scope.test.ts` (new), `docs/specs/repository-audit.md`, `docs/guides/user/repository-operations.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`, this record.

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

## Discussion

### Why the verdict and not the evaluation

Scoping evaluation to staged files would make tree-wide criteria lie: a zone or identity check cannot be answered from one file. The gate-scope report lists the criteria that need the whole tree. Scoping the verdict keeps every answer true and only decides which answers block.

### Subject-less findings

A finding that names no path cannot be attributed to a staged change, so it is outside the scope. The alternative, treating it as always in scope, would make `--staged` useless whenever any tree-wide FAIL exists, which is the condition the option exists to relieve. CI's whole-tree verdict catches it.
