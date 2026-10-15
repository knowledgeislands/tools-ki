---
id: KI-TOOL-KI-CLI-138
area: CLI
title: Warn unknown record fields
purpose: corrective
component: repo
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-15T21:48:02Z
updated_at: 2026-10-15T21:48:02Z
---

# Warn Unknown Record Fields

## Goal

`ki` warns, naming the file and field, whenever a KB Streams record's front matter carries a field outside the shared record model, so that an ad hoc signal such as `priority` is caught at once and horizon stays the only priority signal.

## Context

Kris Brown, in the ways-of-working thread on 15 October 2026 (PRIORITY-FIELD): "Remove priority from KI-PRINCIPAL-MOD-006 and KI-PRINCIPAL-MOD-008, and have the Streams checker and tools-ki warn on unknown record fields; horizon stays the only priority signal." This record carries the tools-ki half; the Streams checker in ki-agentic-harness and the two ki-principal records are separate.

What `ki` does today, observed at `86adda02`:

- **Roadmap adapter.** `parseWorkItem` already rejects any field outside `allowedFields` with "has unsupported or repeated field" ([items.ts:292](../../src/core/work/items.ts)).
- **KB Streams adapter.** The same loop keeps the first uncommon key as `adapterField` and skips the rest with `continue` ([items.ts:296](../../src/core/work/items.ts)), so a `priority:` line on a Streams record is read without any sign.
- **Warnings.** The work listing already reports an unavailable registry and unknown Project slugs as warnings, never failures ([registry.ts:194](../../src/core/work/registry.ts)), which gives the channel to reuse.

## Boundary

- In: collecting every field a KB Streams record carries outside the shared record model and any declared adapter field; surfacing each as a warning naming file and field wherever `ki` reads work records for listing, selection or audit; the warning text saying that horizon is the only priority signal when the field is `priority`; contract tests through `run(args, context)`; `CHANGELOG.md` and the help or manual lines that list warnings.
- Out: turning the warning into a failure; changing the roadmap adapter's existing rejection; editing any record, including KI-PRINCIPAL-MOD-006 and KI-PRINCIPAL-MOD-008; the ki-repo-kb-streams checker in ki-agentic-harness.

## Dependencies / blocks

Not blocked for planning. The ki-repo-kb-streams checker warning in ki-agentic-harness should use the same field list, so the two agree on what counts as unknown.

## Discussion

Capture only, on Kris Brown's explicit request in PRIORITY-FIELD; adoption, priority and plan belong to this repository. Question for planning: whether the shared field list should be exported once from `ki` for the harness checker to read, or kept in step by a contract test on each side.
