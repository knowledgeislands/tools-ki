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
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 708a3b3266eaed05cda82a355c13ab03d0fc1640
created_at: 2026-10-18T19:40:00Z
updated_at: 2026-10-20T00:50:25Z
---

# KI-TOOL-KI-CLI-152: Work Folder Housekeeping Commands

## Goal

`ki` reads and writes the decisions log as the `ki-coordination` standard sets it. The close gate sees every entry, whatever its heading. `ki agent decide` writes unnumbered, timestamped entries, and `reconcile` finds an entry by its heading.

## Context

Split out of [KI-TOOL-KI-CLI-150](/Users/krisbrown/workspaces/knowledge-islands/tools-ki/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) on 18 October 2026, when its launch part was planned to Ready on Kris Brown's CLI-150-LAUNCH answer, recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) under "owner answers, re-bootstrap queries" (20:33 BST) as "planning run to Ready, common rules move first". That answer left these parts unplanned, so they leave the Ready record as this triage record. Their origin is the same WORK-FOLDER-CHECKS a) answer KI-TOOL-KI-CLI-150 records: "one new tools-ki record for the close-gate parse, unnumbered `decide`, launch refusal and `ki work message`/`prune`", which also settles DECIDE-NUMBERS a).

The code disagrees with the [work-folder standard](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-work-folder/references/standards-work-folder.md#the-work-folder) and the `ki-coordination` decisions log section in three places:

- **Close gate:** `src/core/agent/thread.ts` parses only `## Decision <n>` headings (`heading` at line 296), so a log written in the current `## <YYYY-MM-DD HH:MM zone> - <title>` form shows no entries to the gate in `src/core/agent/close.ts`.
- **`decide` and `reconcile`:** `appendDecision` writes `## Decision <n> (<instant>)` and `reconcileDecision` addresses an entry by its number, against the no-numbering rule.
- **Messages and tidy:** no command writes a Messages line or tidies a work folder; coordinators do both by hand.

## Boundary

- In:
  - the close gate reading every entry of a decisions log, with numbered headings still read as history;
  - `decide` writing `## <YYYY-MM-DD HH:MM zone> - <title>` entries without numbers;
  - `reconcile` addressing an entry by its heading or its leading timestamp, and still by number in a numbered log;
  - the manual, help text, command inventory, changelog and tests that follow.
- Out:
  - `ki work message` and `ki work prune`, set out under Discussion and left for a record of their own;
  - the launch refusal, which [KI-TOOL-KI-CLI-150 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/fa31efee/docs/roadmap/KI-TOOL-KI-CLI-150-work-folder-entry-points.md) delivered;
  - the rubric checks, which [KI-HARNESS-GOV-200](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-200-thread-folder-closed-list.md) owns;
  - a release.

## Current state

`parseDecisions` in `src/core/agent/thread.ts` matches only `## Decision <n>`. Knowledge Islands Principal's work logs head their entries in several ways: `## 2026-10-20 00:31 BST - WOW-RESUME a) and NO-GATE disposition`, `## 2026-10-19 - WAVE-1`, `## Pointer - SPECIFICATIONS-PROJECT` and `## One tools-ki writer (16 October)`. The close gate sees none of these entries, so a log in the current form passes the decision check unread. `appendDecision` numbers each entry, and `reconcileDecision` finds an entry only by its number.

## Design

Decided under HIGH-APPLY, 20 October:

- **Every H2 is an entry.** The `ki-coordination` decisions log holds nothing but entries, so the gate reads each H2 section as one. The alternative was a strict timestamp pattern, which would hide the date-only and pointer headings already in use: a close gate that skips what it cannot parse is the defect this record fixes. A numbered heading keeps its number as history. The gate names an entry by that number where it has one, and otherwise by its heading text.
- **Unnumbered `decide`.** `decide` appends `## <YYYY-MM-DD HH:MM zone> - <title>` in the owner's time zone. `TZ` sets the zone, as the launcher's status stamps already do. The title comes from `--title`; for a `<TAG> - <letter>` answer it defaults to `<TAG> <letter>)`, and otherwise to `owner decision`, the wording the live logs use. The output names the heading.
- **Reconcile by heading.** `reconcile <run> <entry>` matches an entry whose heading equals `<entry>` or begins with it followed by a space, so `2026-10-20 00:31` finds a timestamped entry. A whole number also matches `Decision <n>` in a numbered log. When more than one entry matches, the command refuses and names how many did.
- The local-time formatter moves from `runs.ts` to `context.ts` so that `thread.ts` can share it without a dependency cycle.

The heading form settled here is the one the decision-heading check in KI-HARNESS-GOV-200 must match: any H2 heading is an entry.

## Requirements

1. `ki agent close` reports each entry of a log whose headings are timestamped, date-only or free text, and blocks one without a home exactly as it blocks a numbered entry.
2. A numbered log still reads, and its entries are still named by number.
3. `ki agent decide` writes an unnumbered timestamped heading with the title rules above and prints it.
4. `ki agent reconcile` finds an entry by its full heading, its leading timestamp or, in a numbered log, its number; it refuses an entry that is absent or ambiguous.

## Steps

- [x] Move the local clock helper to `src/core/agent/context.ts`.
- [x] Make `parseDecisions` read every H2 with an optional number, and name entries by number or heading in `close.ts`.
- [x] Make `appendDecision` unnumbered with `--title`, and `reconcileDecision` heading-addressed, in `thread.ts` and `src/commands/agent/index.ts`.
- [x] Update the agent tests, the manual, the command inventory and the changelog.
- [x] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/agent/{context,runs,thread,close}.ts`, `src/commands/agent/index.ts`
- `src/tests/cli/agent.test.ts`, `src/tests/cli/agent-threads.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and `ki repo audit` pass.

## Dependencies / blocks

None to build. KI-HARNESS-GOV-200's decision-heading check should adopt the rule settled here.

## Documentation impact

### Decision Records

None.

### Specifications

None: no specification covers `ki agent`.

### Guides

None beyond the manual.

### Roadmap

KI-HARNESS-GOV-200 can take its heading form from this record.

## Review

### Delivered

The close gate reads every H2 of a decisions log as an entry, `ki agent decide` writes unnumbered `## <YYYY-MM-DD HH:MM zone> - <title>` entries with a `--title` option, and `ki agent reconcile` finds an entry by heading, leading timestamp or, in a numbered log, number.

### Change Summary

- `src/core/agent/context.ts` holds the shared `localTime` formatter; `runs.ts` imports it in place of its own clock.
- `src/core/agent/thread.ts` parses every H2 with an optional number, names entries through `decisionName`, appends unnumbered entries with the title rules, and refuses an absent or ambiguous `reconcile` entry.
- `src/core/agent/close.ts` names gate entries by number or heading.
- `src/commands/agent/index.ts` adds `decide --title` and the `reconcile <entry>` argument, and prints the heading.
- The test sandbox defaults `TZ` to `UTC` so stamps do not depend on the host; the agent tests cover timestamped, free-text and numbered logs.
- The manual, command inventory and changelog follow.

### Verification

| Check | Outcome |
| --- | --- |
| `bun run test:coverage` | 1454 passed, 100% coverage |
| `bunx tsc --noEmit` | pass |
| `bunx biome check .` | pass |
| `bunx rumdl check .` | pass |
| `bunx knip` | pass |
| `mandoc -T lint man/ki.1` | no new findings |
| command inventory `--check` | pass |
| `ki repo audit --concise` | FAIL=0 |

### Outstanding concerns

- KI-HARNESS-GOV-200's decision-heading check should take "any H2 is an entry" from this record.
- `ki work message` and `ki work prune` remain unrecorded; the run's CANCEL-MERGE query offers them for a record of their own.

### Post-change review

Requirements 1 to 4 are met and tested: the close gate reports timestamped, free-text and numbered entries and blocks an unhomed one; `decide` defaults the title to `<TAG> <letter>)` or `owner decision`; `reconcile` refuses absent and ambiguous entries. No legacy alias was added; numbered logs read as history.

### Mini recap

The decisions-log tooling now follows the unnumbered `ki-coordination` form, and the close gate no longer passes a current-form log unread.

## Discussion

Adopted to Now and planned on 20 October 2026 under TRIAGE-NEXT a), which asked for the close-gate repair to come first and be split out if it could be. The run's brief allows no new record, so this record keeps the decisions-log repair. `ki work message` and `ki work prune` are offered for a record of their own in the run's CANCEL-MERGE query, with these findings:

- **`ki work message`:** the `ki-work-package` standard sets the line, `- [IMPORTANT · ]<YYYY-MM-DD> · <TAG> · <sender title>: <text>`, the important-first order and the commit `docs(work): <receiver id> message from <sender id>`. It leaves open where the sender's title comes from: the sender's `work.md` `title`, which may be in another repository, or an argument.
- **`ki work prune`:** the standard names briefs as `briefs/<run>.md`, but live folders keep `<name>.brief.md` beside the reports. Whether an outcome is homed is the steward's judgement, so the command can list only briefs mechanically and must take reports from an explicit list.

The close gate keeps reading numbered headings indefinitely, as history.

### Independent acceptance review, 20 October 2026

Acceptance failed on the work-item-format standard's Awaiting review rule: Outstanding concerns names `ki work message` and `ki work prune` as unrecorded follow-up work. Required follow-up must have its own work identifier before acceptance. The implementation and full gate pass, but this review packet cannot be accepted until the coordinator authorises and captures that follow-up (or explicitly disposes of the requirement) and the packet cites the resulting durable record. CANCEL-MERGE-BURNKI is already with the coordinator; this pass creates no record or scope decision.

Independent acceptki2 verification on 20 October 2026: the full coverage run passed all 1,454 tests in 84 files with 100% statements, branches, functions and lines; TypeScript, Biome, rumdl, Knip, manual lint and the command-inventory check passed. The complete declared repository audit passed with FAIL=0 and three pre-existing warnings. GitHub checks were unavailable under the brief's prohibition on remote calls; the audit used its normal unavailable-GitHub path. The public CLI tests and the changed implementation were reviewed independently of the delivery reports.
