---
id: KI-TOOL-KI-CLI-152
area: CLI
title: Work folder housekeeping commands
kind: deliver
purpose: corrective
project: ways-of-working
component: agent
priority: high
size: m
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T19:40:00Z
updated_at: 2026-10-19T22:49:04Z
---

# KI-TOOL-KI-CLI-152: Work Folder Housekeeping Commands

## Goal

`ki` keeps the rest of the work folder to the entry points the `ki-work-folder` standard sets: the close gate reads the decisions log's timestamped headings, `ki agent decide` writes unnumbered timestamped entries that `reconcile` addresses by timestamp, and `ki work message` and `ki work prune` write a Messages line and tidy a work folder under that standard's rules.

## Context

Split out of [KI-TOOL-KI-CLI-150](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) on 18 October 2026, when its launch part was planned to Ready on Kris Brown's CLI-150-LAUNCH answer, recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) under "owner answers, re-bootstrap queries" (20:33 BST) as "planning run to Ready, common rules move first". That answer left these parts unplanned, so they leave the Ready record as this triage record. Their origin is the same WORK-FOLDER-CHECKS a) answer KI-TOOL-KI-CLI-150 records: "one new tools-ki record for the close-gate parse, unnumbered `decide`, launch refusal and `ki work message`/`prune`", which also settles DECIDE-NUMBERS a).

The code disagrees with the [work-folder standard](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-work-folder/references/standards-work-folder.md#the-work-folder) and the `ki-coordination` decisions log section in three places:

- **Close gate:** `src/core/agent/thread.ts` parses only `## Decision <n>` headings (`heading` at line 296), so a log written in the current `## <YYYY-MM-DD HH:MM zone> - <title>` form shows no entries to the gate in `src/core/agent/close.ts`.
- **`decide` and `reconcile`:** `appendDecision` writes `## Decision <n> (<instant>)` and `reconcileDecision` addresses an entry by its number, against the no-numbering rule.
- **Messages and tidy:** no command writes a Messages line or tidies a work folder; coordinators do both by hand.

## Boundary

- In: the close gate reading timestamped headings, with numbered headings still read in logs written before the work model; `decide` writing unnumbered timestamped headings and `reconcile` addressing an entry by its timestamp; `ki work message <receiver id>` adding one Messages line in the standard's shape and committing that path alone under `docs(work): <receiver id> message from <sender id>`; `ki work prune <id>` listing, and on confirmation deleting by explicit path, the reports and briefs the tidy rules let go, never deciding whether an outcome is homed; the manual, `man/ki.commands.json`, help text, specification and tests that follow.
- Out: the launch refusal and the state-folder report path in the run skeleton, which KI-TOOL-KI-CLI-150 carries; the rubric checks, which [KI-HARNESS-GOV-200](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md) owns; old checkpoints' `type: ki-checkpoint` reading in `ki work status`; a release.

## Shaping

**Approach:** the close-gate parse first, since today a log in the current heading form shows the gate no entries; then unnumbered `decide` with timestamp-addressed `reconcile`; then `ki work message` and `ki work prune`, each its own commit through `run(args, context)`.

**Dependencies:** none to build; [KI-TOOL-KI-CLI-150 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/fa31efee/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) delivered the launch part. The rubric side stays with KI-HARNESS-GOV-200.

**Decisions still needed:** the Messages line shape and commit message `ki work message` writes, and what `ki work prune` lists, both read from the current work-folder standard at planning.

**Promotion to Next:** at once, if the close-gate fix is wanted before the next work closes; it may be split so the gate parse goes first as its own `s` record.

## Dependencies / blocks

The heading form the close gate parses must match the decision-heading check KI-HARNESS-GOV-200 adds, so the two settle one form between them.

## Discussion

Capture only, as the split-out remainder of KI-TOOL-KI-CLI-150; adoption, priority and plan belong to this repository. Questions for planning, carried over: whether `ki work prune` deletes only on an explicit list or also offers the candidates interactively; and whether the close gate keeps reading numbered headings after the tolerance window closes.
