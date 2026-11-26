---
id: KI-TOOL-KI-CLI-192
area: CLI
title: Configured roots, Paperclip removed
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

# KI-TOOL-KI-CLI-192: Configured roots, Paperclip removed

## Goal

tools-ki reads its checkout roots from configuration, more than one root allowed, instead of assuming `~/workspaces`, and carries no Paperclip code, keeping provider-neutral `task_links` support.

## Context

Two of Kris's own asks from ki.sop.tools' legacy, both still seen at tools-ki a678f82a:

- **PATHS-FROM-CONFIG** (31 October 2026, [legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L61)): tools-ki hard-codes `~/workspaces` as the checkout root; Kris wants the roots loaded from chezmoi-managed configuration, more than one root, and said it "desperately needs fixing". `src/core/estate/host.ts:134` still joins `~/workspaces`, though the estate now lives under `~/kis`.
- **PAPERCLIP-PURGE** (7 November 2026, [legacy line](https://github.com/krisb/ki-cairn-store/blob/b759e7b4506da8df0c4ca680f577bae82f7cfe57/work-legacy/batch-01-initial/ki/ki.sop.tools/folded/ki.prj.tools-burndown/messages.md?plain=1#L9)): Kris asked for everything to do with Paperclip to be purged. Remnants remain in `src/core/estate/sweep.ts` (`.paperclip/instances`), `src/core/estate/host.ts` (Paperclip worktrees) and `src/commands/repo/roadmap-links.ts` (the `paperclip` task-link provider), with their tests.

Both touch `src/core/estate/`, so they are one record. Captured as triage from the ki.tools reset map ([4.1](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#41-kisoptools-legacy-10), N7).

## Boundary

- **In:** checkout roots from configuration wherever tools-ki assumes `~/workspaces`; removal of the Paperclip sweep, worktree detection and task-link provider, with their tests.
- **Out:** `ki estate converge` and `ki vscode`, which are retiring (KI-TECHNE-OPS-018 moves converge to Rig; `ki vscode` went at 8d1a1190); where the roots are declared, which chezmoi owns.

## Dependencies / blocks

None.

## Discussion

Planning settles where the roots are read from, the registry, a chezmoi-written file or `.ki.toml`, and what happens when none is configured. Captured as triage for Kris to adopt or cancel.
