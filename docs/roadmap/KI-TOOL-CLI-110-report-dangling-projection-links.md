---
id: KI-TOOL-CLI-110
area: CLI
title: Report dangling projection links
kind: deliver
purpose: corrective
project: estate-factorisation
component: repo
horizon: now
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T23:27:45Z
updated_at: 2026-10-07T20:39:59Z
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

## Current state

Adopted into Now on 2026-10-07 under decision 17 of the state-of-play design; not yet planned. `inspectRepositoryHealth` in `src/agents/repository-health.ts` inspects one projection per declared installed-harness skill and compatible agent, so an entry for a skill that is no longer declared, such as a retired capability, is never inspected and the repository can report healthy. `ki repo diag` and `ki repo repair` share `src/commands/repo/shared/repository-health.ts`. The two open questions under Discussion are unanswered.

## Steps

- [ ] Settle the two open questions: the detection scope within a projection directory, and whether the harness supplies a retired-capability list.
- [ ] Extend repository health to enumerate entries in each compatible agent's projection directory and report dangling KI-managed symlinks that no declared skill accounts for.
- [ ] Have `ki repo repair` remove those symlinks, previewed by its existing dry-run, without touching non-symlink or non-KI entries.
- [ ] Add regression tests for diagnosis and repair, including a foreign entry that must be left alone.

## Files touched

`src/agents/repository-health.ts`, `src/commands/repo/shared/repository-health.ts`, and the repository `diag` and `repair` tests under `src/tests/cli/repo/`.

## Verify

1. A fixture repository with a dangling `ki-` projection symlink for an undeclared skill makes `ki repo diag` report it and not report healthy.
2. `ki repo repair --dry-run` lists that removal and changes nothing; `ki repo repair` removes it and leaves non-symlink and non-KI entries in place.
3. The repository's test, type-check and `ki repo audit` gates pass.

## Dependencies / blocks

None blocking. If the second open question is answered with a harness-supplied retired-capability list, that list becomes a handoff to `knowledgeislands/ki-agentic-harness`.

## Documentation impact

### Decision Records

None expected unless the detection scope warrants one.

### Specifications

None; this changes diagnosis and repair behaviour within the CLI only.

### Guides

Update any repository-health guidance that describes what `ki repo diag` reports and what `ki repo repair` removes.

### Roadmap

A harness handoff only if the retired-capability list is chosen.

## Discussion

### Acceptance conditions from the trade

The trade was a finding only: the receiver decides whether and how to act. It asked that `ki repo diag` report the dangling entries and `ki repo repair` remove them, so stale projections are visible and reconcilable.

### Open questions

- Should detection cover every dangling symlink in a projection directory, or only `ki-` prefixed names, given that other tools may own entries there?
- Should a retired-capability list come from the harness, so a renamed skill is recognised by name as well as by a broken target?
