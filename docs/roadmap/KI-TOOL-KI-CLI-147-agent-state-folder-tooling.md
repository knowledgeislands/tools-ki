---
id: KI-TOOL-KI-CLI-147
area: CLI
title: Agent state-folder tooling
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T05:30:00Z
updated_at: 2026-10-18T05:30:00Z
---

# Agent State-Folder Tooling

## Goal

`ki agent` keeps the run state folder tidy without hand work: a run report defaults to the run's state folder, briefs are not stored twice, `_archive/` keeps a bounded history and a sweep prunes what has outlived it.

## Context

At 22:50 BST on 17 October 2026, in the ways-of-working thread (TOOLS-PUSH), Kris Brown said: "the tools-ki state tooling joins KI-TOOL-KI-CLI-137." The ways-of-working restart design names that tooling as:

- the report path default (a run report written to the run's state folder);
- de-duplicated briefs;
- `_archive/` retention;
- sweep pruning.

[KI-TOOL-KI-CLI-137](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-137-agent-run-tmp-home.md) carried it unplanned. The tools-burndown run split it out on 18 October 2026, so that the temporary home could be delivered on its own. The split is provisional, for Kris to confirm.

## Boundary

- In: the four items above, in `src/core/agent/` and its commands, with tests through `run(args, context)` and the manual, guide and changelog.
- Out: the temporary folder, which KI-TOOL-KI-CLI-137 delivers; and the thread-folder closed list and run-packet wording, which the harness owns.
- Capture only; no adoption, priority or implementation is authorised.

## Discussion

Open questions for planning:

- Where the run report defaults to when a thread folder exists.
- Which brief copies count as duplicates: the brief, the draft and the composed prompt.
- The retention limit for `_archive/`.
- Whether the sweep is a separate verb or part of `close`.
