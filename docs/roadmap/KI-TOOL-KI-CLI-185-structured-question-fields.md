---
id: KI-TOOL-KI-CLI-185
area: CLI
title: Structured question fields
priority: medium
size: m
assignee: work/ki.summit
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-22T18:39:52Z
updated_at: 2026-11-22T18:39:52Z
---

# KI-TOOL-KI-CLI-185: Structured question fields

## Goal

`ki work banner` reads each open question's raised time and state, open, parked or answered, from explicit fields on the question, instead of inferring them: the time from the change document's `ki-revised` and the state from the wording of its heading and bold leads.

## Context

Kris accepted KI-TOOL-KI-CLI-182, the package banner command, under ACCEPT-BANNER a by voice through Natter on 22 November 2026, about 18:37 GMT: "Yes, accept." The option he took was to accept it "and have ki.summit capture one follow-up record for a raised time and a structured state on each question". This is that record, captured on Loreward's brief while ki.summit holds the `ki` command surface until Ferris, ki.tools' actor, is seated.

KI-TOOL-KI-CLI-182's first outstanding concern sets out what the banner infers today. A question is answered when a line under it leads with `**Done`, `**Taken`, `**Answered`, `**Agreed` or `**Settled`, and parked when its heading says `(parked)`; its time is its change document's `ki-revised`, so every question in a document shares the time of the document's last edit, and an edit to anything in the document makes its questions look newer. The weights line, `Benefit · Cascade · Confidence · Waits on`, carries no raised time or state.

## Boundary

In scope: reading an explicit raised time and state for each question in `ki work banner`, ordering the items with Kris by that time, and keeping the current inference as the fallback for questions that lack the fields until every package carries them. Out of scope: the question form itself, where the fields sit and how they are written, which is the `ki-coordination` standard's in the backpack, and teaching `ki work status` the Cairn store, which is 11's in ki.summit.

## Dependencies / blocks

The backpack's `ki-coordination` standard has to set where a question's raised time and state are written before this can be shaped; the banner reads what the standard sets.

## Discussion

### Open decisions

Where the fields sit, on the heading, in the weights line or as a line of their own; whether a question's state carries more than open, parked and answered; and when the inference fallback can be removed.
