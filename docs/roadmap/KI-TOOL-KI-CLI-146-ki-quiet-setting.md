---
id: KI-TOOL-KI-CLI-146
area: CLI
title: KI_QUIET setting
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T04:25:00Z
updated_at: 2026-10-18T04:25:00Z
---

# KI_QUIET Setting

## Goal

One setting, `KI_QUIET`, makes every `ki` command that renders operation output behave as if called with `--concise --progress never`. An agent harness or a person sets it once instead of adding both flags to every call, and failures, non-zero exits and failing findings stay fully visible.

## Context

Kris Brown answered QUIET-HOOK on 17 October 2026 at 22:50 BST in the ways-of-working thread: "Yes: capture an unadopted tools-ki record for a KI_QUIET setting implying --concise --progress never, and an unadopted ki-agentic-harness record for a PreToolUse quietening hook, first checking the current Claude Code hooks reference; decide whether to build them after a week of the source-level cuts." This record is the tools-ki half; the harness half is [KI-HARNESS-GOV-204](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-204-pretooluse-quietening-hook.md).

What `ki` does today:

- `ki repo audit` and `ki repo conform` accept `--concise` and `--progress auto|always|never`; [`operationProgress`](../../src/commands/repo/shared/progress/options.ts) already makes `--concise` imply `--progress never`.
- Other commands have no shared quiet switch, and no `KI_*` variable sets output shape; the existing variables name paths, sources, versions and rate limits.

## Boundary

- In: reading `KI_QUIET` through `KiContext`'s injected environment; which values count as set; which commands honour it and how an explicit flag such as `--progress always` overrides it; help, manual and guide text; contract tests through `run(args, context)`.
- Out: the PreToolUse hook, which KI-HARNESS-GOV-204 owns; setting the variable in any shell, harness or user environment; any change that hides a failure, a non-zero exit or a gate's failing findings.
- Capture only; no adoption, priority or implementation is authorised. Kris decides whether to build it after a week of the source-level cuts.

## Discussion

Origin: QUIET-HOOK in the ways-of-working thread, 17 October 2026, carried into the tools-burndown chain as KI-QUIET; captured on 18 October 2026 by the tools-burndown run.

Open questions for planning:

- Scope: only the commands with `--concise` today, or a shared output option every operation command reads.
- Precedence: whether an explicit flag always wins over the variable, and whether `KI_QUIET=0` or an empty value counts as unset.
- Whether `ki agent` output, read mainly by coordinators, follows the same switch.
