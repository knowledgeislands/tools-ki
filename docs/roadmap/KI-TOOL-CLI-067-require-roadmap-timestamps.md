---
id: KI-TOOL-CLI-067
area: CLI
title: Require roadmap timestamps
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-14T08:41:16Z
updated_at: 2026-09-14T08:51:14Z
---

# Require Roadmap Timestamps

## Goal

Make the canonical `created_at` and `updated_at` pair mandatory on every local roadmap item so age, inactivity, and staleness evidence is complete enough to inform prioritisation.

## Context

CLI-066 delivered optional timestamp parsing and statistics for the compatibility rollout. A 2026-09-14 registered-estate report found 195 readable roadmap items across 32 repositories with roadmap projections: 21 carried timestamps and 174 did not. Switching validation immediately would therefore invalidate almost 90% of readable estate records.

The desired final state is a mandatory complete pair. Existing records need a bounded, evidence-backed backfill before the Harness contract and CLI parser stop accepting absent timestamps.

## Boundary

Do not fabricate historical precision where repository history cannot support it, overwrite unrelated or concurrent changes in other repositories, conflate the 22 existing malformed-record faults with missing timestamp coverage, or make the mandatory gate effective before the selected migration set is clean.

## Discussion

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

### Cross-repository boundary

The registered estate spans independently owned Git repositories. Resolve and report the exact writable target set, dirty-tree exclusions, history fallbacks, verification commands, and per-repository commit boundaries before applying or committing the migration outside tools-ki.

Twenty-seven repositories require backfill. Twenty-three are currently clean. The KI Harness, KI Techne Principal, Kit Legal, and tools-ki have working-tree changes; the Harness and Techne changes overlap roadmap or governing-contract paths, so migration must not touch them until those concurrent units settle or their owners approve an exact coordinated change.
