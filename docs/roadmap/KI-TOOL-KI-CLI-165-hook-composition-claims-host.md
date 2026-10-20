---
id: KI-TOOL-KI-CLI-165
area: CLI
title: Hook composition claims host
kind: deliver
purpose: capability
project: tools-burndown
component: repo
priority: medium
size: m
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: ee40f26565fd3852a067164dab564e0f4745d23c
created_at: 2026-10-19T22:46:17Z
updated_at: 2026-10-20T04:40:28Z
transferred_from: ki-principal ki.tools-burndown hooks-standard design section 4.2, HOOK-CAPTURE a), 2026-10-19
---

# KI-TOOL-KI-CLI-165: Hook Composition Claims Host

## Goal

`ki repo conform` writes `.githooks/pre-commit` and `.githooks/commit-msg` byte-exact from the canonical `ki-repo` data for the declared `primary_shape` and package presence, at mode `0755`, and binds `core.hooksPath` to `.githooks` where hooks are due.

## Context

The owner approved implementation on 20 October 2026 with one canonical hook pair per shape and package presence, no extension point, no hooks for the dotfiles shape or repositories without `.ki.toml`, and a read-only dry-run plan. This supersedes the earlier content-claims and local-lines proposals in this record. The canonical data is `ki-agentic-harness` main at `1089728178ff835d3119ab7c7434ade2309867f2`, `skills/keystone/ki-repo/scripts/rubric/contexts/canonical-hooks.ts`, audited by HOOK-1 to HOOK-4. The [hook model](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.chezmoi/design/git-hooks-model.md) supplies the background; the owner's current decisions govern where its earlier alternatives differ.

## Boundary

- In: load the resolved `ki-repo` canonical data; create or replace both hooks at mode `0755`; bind the clone; preserve idempotence and safe publication; report every planned write and binding in dry-run; CLI contract tests; manual, guide and changelog alignment.
- Out: new claims or extension mechanisms, canonical template edits, estate mutation, new work records, installation, remote calls, release and acceptance.

## Current state

- tools-ki immutable baseline: `ee40f26565fd3852a067164dab564e0f4745d23c`.
- Harness main: `1089728178ff835d3119ab7c7434ade2309867f2`; 1,343 tests passed.
- tools-ki: 1,365 tests passed with 100% statement, branch, function and line coverage; `tsc --noEmit` and `biome check .` passed. The first isolated-checkout attempt lacked the existing boundary-tool dependencies; linking the already installed local dependencies resolved it without an install.

## Steps

- [x] Verify tools-ki main's test coverage, type-check and lint baseline and the harness main tests before editing; work only in the runtime-owned linked worktree.
- [x] Resolve canonical hook content from the selected `ki-repo` capability using `primary_shape` and package presence. Keep template semantics in the harness. A shape declaring no hooks skips hook conversion; invalid shape declarations are refused by the existing declaration validator.
- [x] Feed canonical content into the existing hook publication planner, so it replaces whole files, repairs executable modes, updates the binding even when a different path was configured, and retains the existing bounded Husky retirement and package/Knip repairs. Validate all writes before publishing; dry-run publishes nothing.
- [x] Cover first adoption, drift, modes, binding, package variants, no-hook shapes, unsafe paths, bad canonical data and repeated no-op runs through `run(args, context)` with sandbox fixtures; retain bounded Husky and Knip migration coverage, replacing superseded line-attribution expectations.
- [x] Update the command documentation and this record's review packet. Run tools-ki's coverage, type-check and lint gates, and read-only conform dry-runs against three estate repositories.
- [x] Commit explicit paths locally with the model co-author trailer. Fast-forward primary main only after gates pass and no overlapping uncommitted paths or contested staging exist; otherwise retain the delivery branch. Never push or release.

## Files touched

Hook loading and planning in `src/core/repository/`, conform event rendering, CLI sandbox fixtures and contracts, `man/ki.1` and its generated inventory, the repository operations guide, changelog and this record.

## Verify

`bun run test:coverage`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/biome check .`, focused `rumdl check`, `bun run ki:tools:lint-man`, and three read-only `bun src/main.ts repo conform --repo <checkout> --skill ki-repo --dry-run --progress never` previews.

## Dependencies / blocks

Canonical harness data is available on main at `1089728178ff835d3119ab7c7434ade2309867f2`. No remaining dependency or design blocker. Primary integration depends on passing gates and an uncontested destination.

## Documentation impact

### Decision Records

No new record: the owner's canonical-hook and no-extension decisions are already supplied by this implementation brief.

### Specifications

The harness owns the accepted hook contract and HOOK-1 to HOOK-4; this delivery implements that existing contract without changing it.

### Guides

Update the repository operations guide, manual and generated manual inventory to explain canonical replacement, no-hook exclusions, binding and previews.

### Roadmap

Update only this record and prepare its review packet. Capture, acceptance and pruning are outside the grant.

## Review

### Delivered

Canonical hook publication and binding are delivered from immutable baseline `ee40f26565fd3852a067164dab564e0f4745d23c`. Canonical policy and text stay in the resolved harness; the host creates or replaces each due hook at mode `0755`, binds `.githooks`, and reports an unapplied dry-run plan. Dotfiles shapes and targets without `.ki.toml` receive no hook creation. No estate conform was applied, no new record was created, and no release or remote operation was performed.

### Change Summary

- `src/core/repository/canonical-hooks.ts` loads and checks the resolved `ki-repo` canonical pair, selected by primary shape and package presence.
- `src/core/repository/hooks.ts` publishes canonical whole files and exact executable modes, replaces foreign or absolute bindings, and retains bounded Husky retirement and Knip repairs. The superseded line-attribution and local-content renderer were removed; the estate sweep's existing foreign-binding policy is preserved.
- Conform orchestration and event rendering use this policy; CLI fixtures and contracts cover adoption, byte drift, executable drift, variants, exclusions, binding, safe refusal and idempotence.
- The manual, generated `man/ki.commands.json`, repository operations guide and changelog describe the resulting behavior.
- Two unrelated committed roadmap changes advanced main during the run; the isolated branch fast-forwarded to `949cd36a6ac5b0d9b04be5982fa9cd840eddf60e` before the final combined gate. Their files were not edited by this delivery.

### Verification

- `bun run test:coverage`: 85 files and 1,372 tests passed; statements, branches, functions and lines all 100%.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `./node_modules/.bin/biome check .`: passed, 376 files, no fixes.
- `./node_modules/.bin/rumdl check CHANGELOG.md docs/guides/user/repository-operations.md docs/roadmap/KI-TOOL-KI-CLI-165-hook-composition-claims-host.md`: passed.
- `bun run ki:tools:lint-man` and `bun scripts/generate-command-inventory.ts`: passed.
- `bun src/main.ts repo conform --repo <checkout> --skill ki-repo --dry-run --progress never`: all three previews exited 0. `ki-principal` and `ki-agentic-harness` required no hook write or binding; `tools-mgit` proposed replacing `.githooks/pre-commit` and creating `.githooks/commit-msg`, with its existing binding already correct. Pre-publication warnings on tools-mgit describe the unapplied old hooks; dependency-owned `.rumdl.toml` proposals were also left unapplied.
- Harness baseline: 1,343 tests passed at `1089728178ff835d3119ab7c7434ade2309867f2`.

### Outstanding concerns

None within the approved implementation boundary. Estate application and release remain outside this delivery; acceptance belongs to the owner.

### Post-change review

The goal and scope are satisfied. Hook policy has one owning data source, and no claims or extension contract was introduced. Core owns loading and repository effects; commands only render events. Fresh CLI and estate previews support creation, replacement, exclusion and no-op behavior, while migration tests protect the remaining package, lockfile and Knip repairs. The record is ready for human review, without self-acceptance.

### Mini recap

Canonical hook writing, binding and read-only previews are implemented and documented, with the complete local gate green. No additional knowledge record or follow-on record is proposed; the existing harness contract and repository guide hold the durable behavior.

## Discussion

The owner settled the previous open questions: canonical text replaces repository-specific hook lines; no extension is preserved. The hook planner owns publication and binding, while the harness owns the text. No new design decision is required by this plan.
