---
id: KI-TOOL-KI-CLI-193
area: CLI
title: Doctor checks hooks
priority: medium
size: m
assignee: work/ki.tools
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-26T02:47:03Z
updated_at: 2026-11-26T02:47:03Z
---

# KI-TOOL-KI-CLI-193: Doctor checks hooks

## Goal

For each registered harness, `ki doctor` reports a shipped hook that is missing, unregistered in Claude Code or Codex, or lacking its current Codex trusted hash, and `ki repair` registers a missing one, or says "managed by chezmoi, run chezmoi apply" where chezmoi owns the settings.

## Context

Four legacy asks from ki.sop.tools come to one capture:

- **TOOLING-AUDIT** (6 November 2026, [legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L18)): Kris's tooling audit carried household-terra's gap, `ki doctor` checking user skills but not hooks and `ki repair` repairing only skill links, with the wanted behaviour in the Goal above; Kris settled the split (Q2 a).
- **HOOK-PAYLOAD** (24 October 2026, [legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L33)): on sol the harness hook payload was absent and the install did not publish it.
- **HOOKS-CHECK-ONLY** (26 October 2026, [legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L42)): every canonical pre-commit is check-only (COMMIT-VS-CI a), so tools-ki's hook tests and lint-staged rendering in `conform.ts` align with it.
- **HOOK-ROLLOUT** (22 October 2026, [legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L31)): the commit-gate hooks rolled out under HOOKS-STANDARD.

The hook standard has since landed in `ki-repo`'s rubric, but at tools-ki a678f82a `ki doctor` and `ki repair` still say nothing about hooks. Captured as triage from the ki.tools reset map ([4.1](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#41-kisoptools-legacy-10), N8).

## Boundary

- **In:** hook findings in `ki doctor` and hook registration in `ki repair`, per harness, against the payload table the backpack ships; recheck of HOOK-PAYLOAD and HOOKS-CHECK-ONLY against the current hooks, dropping what has landed.
- **Out:** the hooks themselves and the payload contract, which the backpack owns; chezmoi-owned settings, which `ki repair` only points at.

## Dependencies / blocks

None.

## Discussion

Planning rechecks HOOK-PAYLOAD and HOOKS-CHECK-ONLY first; each may already have landed with the hook standard. Captured as triage for Kris to adopt or cancel.
