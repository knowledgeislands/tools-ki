---
id: KI-TOOL-KI-CLI-177
area: CLI
title: Packaged subcommands
priority: low
size: l
status: triage
blocks: []
blocked_by: [KI-TOOL-KI-CLI-176]
baseline_ref: null
created_at: 2026-11-05T02:20:48Z
updated_at: 2026-11-05T02:20:48Z
---

# Packaged subcommands

## Goal

tools-ki becomes a monorepo whose subcommands ship as separate packages, such as `ki-work`, `ki-agent` and `ki-repo`, each with its own tests and release and installable on its own, with `ki` the front door that finds them.

## Context

Kris agreed this longer-term shape on 5 November 2026 through personal.reg.assistant-terra (ATER-018, 01:46 GMT) and asked for it on the tools-ki roadmap as forward work (ATER-022, 01:49 GMT). The lines sit in Principal `+/_WORK/ki.sop.main/messages.md`.

It builds on the extension veneer, KI-TOOL-KI-CLI-176: once `ki` can dispatch to a `ki-<name>` executable, its own core can split the same way an outside extension such as `ki-muninn` plugs in.

## Boundary

Capture only: no split is planned yet. Retiring `ki acquire` in favour of `ki-muninn` is tracked with the veneer, not here. Release, Homebrew formula and installer changes come with planning under `ki-repo-tools`.

## Dependencies / blocks

Blocked by KI-TOOL-KI-CLI-176. The Homebrew tap would need a formula, or formula option, per package when this is planned.

## Discussion

### Splitting

At `size: l` this is a placeholder; planning should split it, likely one record for the workspace layout and shared core, then one per extracted package. Open questions: which code stays in `ki` (bootstrap, Harness resolution, presentation), whether packages share a Bun workspace, and how versions across packages stay compatible.
