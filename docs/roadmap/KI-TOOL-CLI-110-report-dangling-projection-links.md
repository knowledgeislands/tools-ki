---
id: KI-TOOL-CLI-110
area: CLI
title: Report dangling projection links
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T23:27:45Z
updated_at: 2026-10-06T23:27:45Z
---

# Report dangling projection links

## Goal

`ki repo diag` reports dangling symlinks inside KI-managed skill projection directories, and `ki repo repair` removes them, so stale projections of retired skills are visible and reconcilable rather than reported as healthy.

## Context

Source: knowledge trade [TRD-8004751b](https://github.com/knowledgeislands/ki-agentic-harness/blob/78e6551f91fe3afb29ca96c9a47ecd63bf9b02b7/-/_TRADES/knowledgeislands/tools-ki/TRD-8004751b.md) ("Report dangling retired-skill links in repository projections"), sent by `knowledgeislands/ki-agentic-harness` from its record `KI-HARNESS-GOV-118` on 2026-10-04 (harness commit `bb3dee6df5bb9a2ca578c5bccfa9e109a37c7231`), with observation policy `receipt`. GOV-118 has since been accepted and pruned in the harness (`0b7bbcc4`), so no live harness record links here.

On 2026-10-07 Kris decided that this trade, still awaiting receipt, is to be removed and its content carried directly in this roadmap as Triage. The decision and the leftover-state review that prompted it are tracked in the `ki-arcadia-principal` checkpoint `+/_CHECKPOINTS/state-of-play.md` (last committed at `7a5f33c341f4e4179ffaee992a8d054f64e79291`). This record carries the trade's full content; it is captured, not adopted.

The trade reported that on 2026-10-04 the `ki-agentic-harness` `.claude/skills` and `.agents/skills` projections each held seven dangling symlinks to retired skill names (`ki-change-management`, `ki-change-management-housekeeping`, `ki-change-management-roadmap`, `ki-feature-definitions`, `ki-harness`, `ki-housekeeping-granola`, `ki-roadmap`), and `ki-arcadia-principal` `.claude/skills` held five (`ki-change-management`, `ki-kb`, `ki-kb-activities`, `ki-kb-live-artifacts`, `ki-kb-streams`). While they were present `ki repo diag` reported `HEALTHY=1` and `ki repo repair --dry-run` reported `would result: healthy`. Dangling entries in a runtime skill directory can surface to agents as unresolvable skills. The harness links were removed locally; Arcadia's were left for its owner.

At capture the gap remains: `src/agents/repository-health.ts` classifies only the projection of each declared skill (`linked`, `missing`, `dangling`, `stale`, `foreign`), so an undeclared entry left behind by a retired skill is never inspected. On 2026-10-07 `ki repo diag` for `ki-arcadia-principal` listed no finding for its `ki-kb*` and `ki-change-management` entries.

No existing record duplicates this. KI-TOOL-CLI-108 (roadmap list structural validity) and KI-TOOL-CLI-109 (rubric publication root) are unrelated.

## Boundary

In scope: detecting and reporting dangling symlinks in KI-managed projection directories (at least entries whose names carry the `ki-` prefix or match a known retired capability), and removing them through `ki repo repair` with its existing dry-run preview.

Out of scope: removing non-symlink or non-KI entries; changing harness skill retirement policy.

## Discussion

### Acceptance conditions from the trade

The trade was a finding only: the receiver decides whether and how to act. It asked that `ki repo diag` report the dangling entries and `ki repo repair` remove them, so stale projections are visible and reconcilable.

### Open questions

- Should detection cover every dangling symlink in a projection directory, or only `ki-` prefixed names, given that other tools may own entries there?
- Should a retired-capability list come from the harness, so a renamed skill is recognised by name as well as by a broken target?
