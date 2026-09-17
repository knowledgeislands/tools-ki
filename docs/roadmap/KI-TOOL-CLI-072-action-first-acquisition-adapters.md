---
id: KI-TOOL-CLI-072
area: CLI
title: Action-first Acquisition Adapters
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: b9c4f355d958a8796ba60277c223c6f65196ba24
created_at: 2026-09-16T20:55:57Z
updated_at: 2026-09-17T06:24:17Z
---

# Action-first Acquisition Adapters

## Goal

Make `ki acquire` the provider-neutral action-first executable surface for repository-enabled acquisition adapters, with verified skill metadata, resumable atomic acquisition state, separate Granola detail and transcript observations, governed reset, and post-acquisition dispositions.

## Context

The existing CLI exposes provider-first `ki acquire granola import` and `ki acquire chatgpt import` branches, while Harness acquisition semantics remain embedded in `ki-housekeeping-*` skills. Harness item `KI-HARNESS-OPS-006` and its Granola standard establish read-only source acquisition, complete identity enumeration, explicit omissions, fail-closed receiver selection, immutable staged evidence, and source-retirement separation, but their public grammar and skill taxonomy now need a coordinated cutover. Completed Granola imports in `kit-legal` and `kit-principal` must remain valid, while the uncommitted `kit-hnr` Harbour documents provide a read-only interrupted-import recovery scenario.

## Boundary

Change only `tools-ki`. Consume machine-readable acquisition declarations from verified installed Harness skills without parsing instructional prose. Remove the provider-first grammar rather than preserving an alias. Keep every provider boundary read-only, retain folder evidence as routing evidence, fail closed on receiver conflicts, and never infer omitted adapter selection as `--all`. Do not modify, commit, or clean Harness, Arcadia, or receiver repositories. Prepare only a bounded tools-ki-owned outbound trade for the Harness metadata and language changes. Inspect but do not mutate the `kit-hnr` recovery fixture.

## Current state

`src/commands/acquire/index.ts` directly wires local ChatGPT capture and Granola commands beneath provider names. Granola stores one combined source hash and advances `ledger.json` after complete import; transcript reads therefore repeat with routine detail acquisition, and recovery relies on orphan document inspection rather than a bound journal. There is no repository-context adapter listing, generic action dispatch, reset contract, or disposition representation.

## Steps

- [x] Define and validate a verified acquisition-adapter capability projection on installed skill metadata, including adapter identity, actions, repository properties, invocation properties, provider capability/omission policy, mutation boundary, checkpoints, and reset semantics.
- [x] Replace provider-first commands with action-first `list`, `import`, `status`, `reconcile`, and `reset`, enforcing exact-one inference, explicit `--all`, common versus adapter-specific options, supported actions, and actionable unresolved/unknown diagnostics.
- [x] Implement repository-context adapter inventory showing enabled, available, invalid or unavailable states with actions, configuration, executable status, and activation guidance.
- [x] Refactor Granola acquisition behind the adapter registry with separate mutable-detail and transcript hashes, bounded unavailable-transcript retries, explicit transcript refresh, immutable-by-default acquired transcripts, and no provider mutation surface.
- [x] Add atomically written, interval-bound in-progress journals and authoritative complete-generation checkpoints; resume verified work, reject corrupt/stale/incompatible journals, and advance checkpoints only after complete verification.
- [x] Represent staged, retained, harvested, traded, superseded, and awaiting-review dispositions so moved documents do not look corrupt and changed disposed sources produce amendments.
- [x] Add previewed, confirmed local reset scopes for adapter checkpoint, source identity, component, and complete rebuild without granting provider mutation.
- [x] Update help, completion, README, manual, changelog, and recovery documentation; prepare a bounded Harness trade for acquisition-skill split and metadata/command updates.
- [x] Verify the interrupted-import recovery contract against the receiver fixture without embedding receiver-specific operations in tools-ki documentation.
- [x] Run focused acquisition tests, full coverage and engineering gates, then move this record to `awaiting-review` with a review packet.

## Files touched

- `src/commands/acquire/`
- `src/core/acquire/`
- `src/core/harness/`
- `src/core/configuration/` as required for verified adapter resolution
- `src/commands/manage/completion/`
- `src/tests/cli/acquire/` and related CLI fixtures
- `README.md`
- `man/ki.1`
- `CHANGELOG.md`
- `docs/guides/`
- `-/_TRADES/knowledgeislands/ki-agentic-harness/`
- `.ki.toml` only if the outbound work route must be declared
- `docs/roadmap/KI-TOOL-CLI-072-action-first-acquisition-adapters.md`
- `docs/roadmap/_ISSUES.md`

## Verify

- `bunx vitest run src/tests/cli/acquire`
- `bun run test:coverage`
- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bunx knip`
- `bun run build`
- `ki repo audit --skill ki-engineering --repo .`
- `ki repo audit --skill ki-work-roadmap --repo .`
- `ki repo audit --skill ki-repo-tools --repo .`
- `ki repo audit --skill ki-authoring --repo .`
- `ki repo audit --skill ki-trades --repo .`
- `git diff --check`

## Dependencies / blocks

Harness `KI-HARNESS-OPS-006` remains in progress and currently publishes `ki-housekeeping-granola` plus the old provider-first grammar. This delivery defines tools-ki's executable consumer contract and returns the Harness-owned acquisition-skill rename, dependency, frontmatter, and documentation work as an outbound trade. Existing receiver configuration and committed ledgers must be migrated or read through the new current contract without sibling writes.

## Documentation impact

### Decision Records

No tools-ki Decision Record is expected; the Harness taxonomy and contract correction is returned through a bounded trade to its owning repository.

### Specifications

No standalone Specification is expected. CLI behavior is locked by this record and its public contract tests.

### Guides

Update public command documentation, completion grammar, manual, changelog, adapter activation guidance, checkpoint/reset behavior, and transcript refresh policy.

### Roadmap

Keep this record current through Awaiting review. Harness `KI-HARNESS-OPS-006` remains independently owned and in progress.

## Review

### Delivered

Implemented the action-first `ki acquire list|import|status|reconcile|reset` grammar, verified adapter discovery and selection, ChatGPT adapter migration, and Granola schema-three checkpoint, journal, transcript, reset, and disposition contracts.

### Summary of changes

The CLI now consumes verified machine-readable acquisition declarations, distinguishes enabled, available, and invalid adapters, enforces exact-one or explicit all-selection rules, and rejects adapter-specific overrides with `--all` before provider contact. Granola now revalidates detail independently from transcript content, retries explicit omissions under a bounded policy, resumes verified journal components, commits only complete generations, supports moved-document dispositions and confirmed local reset scopes, and remains provider read-only. Public docs, help, completions, manual, changelog, and specification are current. Outbound trade `TRD-7a4b4609` returns the Harness skill split and metadata work to its owner.

### Verification

Focused acquisition, help, and completion tests pass. The full suite passes with 100% statements, branches, functions, and lines. TypeScript, Biome, man-page lint, build, dependency analysis, Markdown checks, and repository audits are recorded in the implementation commit handoff.

### Outstanding concerns

Harness `KI-HARNESS-OPS-006` must adopt submitted trade `TRD-7a4b4609` before receiver repositories can resolve `ki-acquire-granola` through the installed public command. Receiver recovery is an operational action under separate authority and is not a durable tools-ki concern.

### Post-change review

The implementation retains the provider read-only boundary, contains all state mutation inside the selected repository, compares durable evidence by verified hashes, and removes the provider-first alias. The adapter registry and Granola persistence concerns are split into focused core modules; contract tests drive only the CLI seam.

### Mini recap

CLI-072 is delivered and accepted: action-first acquisition, verified adapters, separate transcript checkpoints, resumable atomic journals, disposition-aware reconciliation, governed reset, and public documentation are complete; Harness follow-up has direct roadmap owners.

## Done

Accepted 2026-09-17 by Kris Brown on the review packet above. Harness follow-up is owned directly by existing `KI-HARNESS-OPS-005` and `KI-HARNESS-OPS-006`; the redundant unreceived trade is withdrawn.

## Discussion

Origin: direct owner request on 2026-09-16. This item supersedes the command-language assumption in Harness `KI-HARNESS-OPS-006` without claiming authority to update or complete that sibling record.
