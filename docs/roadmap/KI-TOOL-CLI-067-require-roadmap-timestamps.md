---
id: KI-TOOL-CLI-067
area: CLI
title: Require roadmap timestamps
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 076d58c882c94b72255c9a99bd590e2765935fb5
created_at: 2026-09-14T08:41:16Z
updated_at: 2026-09-14T13:44:06Z
---

# Require Roadmap Timestamps

## Goal

Make the canonical `created_at` and `updated_at` pair mandatory on every local roadmap item so age, inactivity, and staleness evidence is complete enough to inform prioritisation.

## Context

CLI-066 delivered optional timestamp parsing and statistics for the compatibility rollout. A 2026-09-14 registered-estate report found 195 readable roadmap items across 32 repositories with roadmap projections: 21 carried timestamps and 174 did not. Switching validation immediately would therefore invalidate almost 90% of readable estate records.

The desired final state is a mandatory complete pair. Existing records need a bounded, evidence-backed backfill before the Harness contract and CLI parser stop accepting absent timestamps.

## Boundary

Do not fabricate historical precision where repository history cannot support it, overwrite unrelated or concurrent changes in other repositories, conflate the 22 existing malformed-record faults with missing timestamp coverage, or make the mandatory gate effective before the selected migration set is clean.

### Rollout decisions

### Rollout order

Backfill selected local roadmap records first, validate every migrated repository, then publish the Harness requirement and finally remove the CLI compatibility path. This keeps the estate usable throughout the cutover.

### Historical evidence

Prefer the earliest followed Git commit time for `created_at` and the latest current-path Git commit time for `updated_at`, normalised to canonical UTC seconds. Records without sufficient tracked history need an explicit fallback and report rather than a silent invented date. A single migration instant is an acceptable fallback if the migration report identifies it.

The bounded estate probe found 180 physical records without `created_at`, including six records already excluded from readable statistics by other faults. Every one of the 180 has both earliest followed and latest current-path Git commit evidence, and none produces `created_at > updated_at`; no fallback timestamp is currently required.

### Estate targets

The exact 27-repository backfill set is:

- HNR: `5g-emerge-testbed-website`, `hnr-agentic-harness`, and `kit-hnr`.
- User configuration: `~/.local/share/chezmoi`.
- Equal Remedy: `er-agentic-harness`.
- Knowledge Islands: `homebrew-tap`, `ki-agentic-harness`, `ki-arcadia-principal`, `ki-specifications`, `ki-techne-principal`, `ki-website`, `mcp-acquire-whatsapp`, `mcp-git-audit`, `mcp-gsuite`, `mcp-housekeeping-chatgpt`, `mcp-housekeeping-claude`, `mcp-housekeeping-codex`, `mcp-ki-kb-fs`, `mcp-ki-kb-notion-mirror`, `mcp-m365`, `tools-git-almanac`, and `tools-ki`.
- Other Kit repositories: `kit-legal`, `kit-midnight.ninja`, `kit-principal`, `kit-techmedix`, and `vallearmonia-website`.

## Current state

The estate contains 180 physical roadmap records without the mandatory pair across 27 repositories. Every record has sufficient Git history for deterministic derivation, and no derived `updated_at` precedes its `created_at`. Repository cleanliness is volatile and must be checked again immediately before each edit.

## Steps

- [ ] Resolve the exact 180-record manifest from the named repositories and derive canonical UTC-second timestamps from Git history.
- [ ] For each clean repository, insert only `created_at` and `updated_at`, verify the diff contains no removal or other addition, validate complete timestamp coverage, and commit the exact changed paths.
- [ ] Stop without touching any repository that is dirty at its preflight; repeat only after it becomes clean under the existing authority.
- [ ] Once all 27 repositories are migrated, update the canonical Harness standard, rubric, process guidance, and fixtures to require the complete timestamp pair.
- [ ] Cut `tools-ki` validation over from optional compatibility to mandatory fields, update its contract tests and specification evidence, and run the full repository gates.
- [ ] Run the focused engineering audit, including comprehension-first modularity review, change-aware consistency review, contract coverage, type-checking, Biome, Knip, and build verification.

## Files touched

- The 180 existing roadmap Markdown records identified by the estate manifest, with timestamp-only frontmatter additions.
- Canonical `ki-work-roadmap` standard, rubric catalogue/publication, process guidance, and contract fixtures in `ki-agentic-harness`.
- Roadmap parser, reporting/help text, CLI contract tests, specifications, and this work record in `tools-ki`.

## Verify

- Recompute the physical manifest and prove every target record has exactly one canonical pair with `updated_at >= created_at`.
- Prove every migration diff contains only the two permitted added frontmatter lines before committing it.
- Run the selected roadmap audit for each migrated repository and compare remaining faults with the pre-migration baseline.
- Run Harness skill tests and repository audit after the contract change.
- Run `bun run test:coverage`, TypeScript, Biome, Knip, build, selected skill audits, and the full `ki repo audit --repo .` in `tools-ki`.

## Dependencies / blocks

The mandatory contract and parser cutover are blocked until every named repository is migrated. A dirty repository is an explicit stop for that repository, not permission to merge or discard concurrent work. Existing malformed-record faults are outside this migration unless they directly prevent timestamp validation.

## Documentation impact

### Decision Records

No decision record change is expected; this implements the already chosen mandatory timestamp policy.

### Specifications

Update the canonical Harness contract and `tools-ki` specification evidence to state that both timestamps are required.

### Guides

Update process guidance and CLI help where they describe the roadmap item contract. No compatibility guidance remains after the cutover.

### Roadmap

Keep this record current through migration, contract cutover, verification, and review handoff.

## Discussion

The migration is intentionally serial and timestamp-only. One executor preserves the per-repository cleanliness checks, exact commit boundaries, and stop conditions without introducing coordination risk.

### Cross-repository boundary

The registered estate spans independently owned Git repositories. Resolve and report the exact writable target set, dirty-tree exclusions, history fallbacks, verification commands, and per-repository commit boundaries before applying or committing the migration outside tools-ki.

Twenty-seven repositories require backfill. Twenty-three are currently clean. The KI Harness, KI Techne Principal, Kit Legal, and tools-ki have working-tree changes; the Harness and Techne changes overlap roadmap or governing-contract paths, so migration must not touch them until those concurrent units settle or their owners approve an exact coordinated change.
