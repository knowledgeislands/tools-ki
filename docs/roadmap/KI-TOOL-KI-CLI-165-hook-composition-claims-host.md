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
status: done
blocks: []
blocked_by: []
baseline_ref: ee40f26565fd3852a067164dab564e0f4745d23c
created_at: 2026-10-19T22:46:17Z
updated_at: 2026-10-20T06:10:01Z
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
- Independent-review correction baseline: tools-ki `f2fdf22721ded0a9871bc93ece957332885d9a17`, with 1,372 tests and 100% coverage, type-check and Biome green before correction. Harness main also passed all 1,343 tests. The runtime-owned linked worktree reused installed dependencies without an install.

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

Canonical hook publication and binding are delivered from immutable baseline `ee40f26565fd3852a067164dab564e0f4745d23c`. Canonical policy and text stay in the resolved harness; the host creates or replaces each due hook at mode `0755`, binds `.githooks`, and reports an unapplied dry-run plan. Dotfiles shapes and targets without `.ki.toml` receive no hook creation. No estate conform was applied, no new record was created, and no release or remote operation was performed. The independent review of `f2fdf227` identified three publication-safety defects; this correction refuses symlinked hook parents independently of drift, validates the entire bounded Husky retirement tree, and limits TypeScript Knip repair to an unambiguous exported configuration. The record remains Awaiting review.

### Change Summary

- `src/core/repository/canonical-hooks.ts` loads and checks the resolved `ki-repo` canonical pair, selected by primary shape and package presence.
- `src/core/repository/hooks.ts` publishes canonical whole files and exact executable modes, replaces foreign or absolute bindings, and retains bounded Husky retirement and Knip repairs. The superseded line-attribution and local-content renderer were removed; the estate sweep's existing foreign-binding policy is preserved.
- Conform orchestration and event rendering use this policy; CLI fixtures and contracts cover adoption, byte drift, executable drift, variants, exclusions, binding, safe refusal and idempotence.
- The manual, generated `man/ki.commands.json`, repository operations guide and changelog describe the resulting behavior.
- Two unrelated committed roadmap changes advanced main during the run; the isolated branch fast-forwarded to `949cd36a6ac5b0d9b04be5982fa9cd840eddf60e` before the final combined gate. Their files were not edited by this delivery.
- Independent-review correction, unsafe parents: `.githooks` must be a physical repository directory when present, even when both canonical hooks already match and the only proposed action is binding, or when the binding also already matches. Internal and external parent symlinks are refused before hook publication.
- Independent-review correction, Husky retirement: the planner checks regular hook entries and allows only known regular generated files below the physical `_` directory, including its generated `.gitignore`. Unknown files, descendant directories and symlinks are refused without deleting their contents or publishing package, lockfile or hook changes.
- Independent-review correction, Knip repair: TypeScript repair recognizes a direct default object or a single named object exported as default, with a bounded import/comment preamble and simple root members. Helper declarations, mismatched exports and nested or otherwise ambiguous scopes require manual repair; unrelated members are never selected for editing.
- Independent-review regressions: CLI tests cover both symlink destinations with drift, binding-only and already-bound canonical hooks; notes beneath hook names and `_`; unsafe generated entries; helper objects, missing or mismatched exports and nested ignores. They also retain successful generated-file retirement and simple exported-configuration repair.

### Verification

- Corrective `bun run test:coverage`: 85 files and 1,397 tests passed; statements, branches, functions and lines all 100%.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `./node_modules/.bin/biome check .`: passed without fixes.
- `./node_modules/.bin/rumdl check .` and the focused changelog, repository guide and roadmap check: passed.
- `bun run ki:tools:lint-man`: passed.
- `bun scripts/generate-command-inventory.ts`: passed in read-only mode.
- Adversarial regressions were exercised against the reviewed implementation before restoring the correction; the unsafe symlink parents, Husky descendant trees and helper-object Knip repairs failed those assertions.
- Read-only `bun src/main.ts repo conform --repo <checkout> --skill ki-repo --dry-run --progress never` previews matched the reviewed baseline: chezmoi exited 0 with no hook operation; tools-mgit exited 0 with the same two canonical hook writes and no binding change; paperclip exited 2 for its missing `.ki.toml`, with no hook or binding plan. Hook, migration and declaration files, working-tree status and binding snapshots remained unchanged for all three targets.
- Harness green-main baseline: all 1,343 tests passed, without installation or network access.

### Outstanding concerns

No unresolved review defect remains within this correction. Complex or ambiguous `knip.ts` files are deliberately refused with a manual-repair next step. Estate application, release and acceptance remain outside this delivery.

### Post-change review

The correction addresses all three independent-review findings through the public CLI seam, including dry-run refusal and preservation of adversarial files. Hook policy still has one owning data source; commands and the generic publisher are unchanged. Bounded TypeScript recognition intentionally refuses ambiguous configurations instead of guessing their effective export. Full coverage and unchanged estate previews support the revised publication boundary. The record remains ready for human review, without self-acceptance.

### Mini recap

Canonical hook writing and binding now reject unsafe parents, Husky retirement rejects unknown descendants, and Knip repair requires a recognized exported object. The corrective gate is green, and the same three estate previews remain read-only. No new record was created; this record retains the correction evidence and remains Awaiting review.

## Done

Accepted 2026-10-20 by the independent reviewer under Kris Brown's standing grant on the review packet above.

## Discussion

The owner settled the previous open questions: canonical text replaces repository-specific hook lines; no extension is preserved. The hook planner owns publication and binding, while the harness owns the text. No new design decision is required by this plan.

### Independent acceptance, 20 October 2026

Independent acceptance failed the mandatory six-heading Review packet: the exact third-level heading `Independent-review corrections` appears between `Change Summary` and `Verification`, so the declared ki-work-roadmap audit fails ITEM-3. The correction evidence must be retained within the required six-part structure by the delivery owner before resubmission. No code defect was reproduced: the independently run coverage gate passed all 1,398 tests in 85 files at 100% statements, branches, functions and lines; TypeScript, Biome, rumdl, Knip, manual lint, command inventory and Syncpack passed. Read-only conform previews repeated the delivered results for chezmoi (exit 0, no hook operation), tools-mgit (exit 0, two canonical hook writes proposed), and paperclip (exit 2, missing `.ki.toml`); the inspected files, modes, Git status and hook binding stayed unchanged in all three. No conform was applied. Returned to in-progress under the review brief of 20 October 2026.

### Review-packet correction, 20 October 2026

The `burn2-tools-ki` run moved the four independent-review correction bullets from their extra third-level heading into Change Summary, so the Review packet carries exactly the six required headings in order; no evidence was dropped and no code changed. The record returns to awaiting review.

### Independent re-review and acceptance, 20 October 2026

The independent `accept4-tools-ki` review verified the immutable baseline and delivery commits, all completed Steps, the exact six-heading Review packet and the implementation against the approved canonical-hook boundary. The independently run coverage gate passed all 1,398 tests in 85 files at 100% statements, branches, functions and lines. TypeScript, Biome, rumdl, Knip, manual lint, command inventory and both Syncpack checks passed. The complete repository audit passed with zero failures and seven warnings after running it sequentially with coverage; an earlier overlapping invocation refused the occupied coverage directory and was rerun without bypass. No unresolved acceptance defect or attended check remains.

Read-only conform previews repeated the delivered results: chezmoi exited 0 without hook operations, tools-mgit exited 0 proposing the two canonical hook writes, and paperclip exited 2 for its missing declaration. File contents and modes, Git status and hook bindings were unchanged for all three. No conform was applied, and no release or runtime configuration change was made.

Closure authority is Kris's 20 October 2026 overnight grant, quoted by this run's brief and read back under OVERNIGHT-BURNDOWN in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md): "if you can quickly now accept ... accepting new things that are waiting with you and pruning those ... getting the roadmaps down to zero". This acceptance applies exactly to KI-TOOL-KI-CLI-165.

Prune preflight searched this repository and 22 accessible Knowledge Islands peers, including registered and unregistered local checkouts. Live links remain in the harness hook-content record and Principal work designs and messages. The known archived ki-techne-principal checkout is unavailable, so this is not an exhaustive historical-peer scan. This Done record is retained pending receiver-owned reference repairs and any necessary archived-peer evidence; peer document edits are outside this repository's review grant. The follow-up is routed to the coordinating work through its `messages.md`, without creating a work record.
