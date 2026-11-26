---
id: KI-TOOL-KI-CLI-187
area: CLI
title: Audit lists judgement items
kind: deliver
purpose: capability
component: repo
priority: medium
size: s
assignee: work/ki.tools
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-26T02:47:03Z
updated_at: 2026-11-26T02:47:03Z
---

# KI-TOOL-KI-CLI-187: Audit lists judgement items

## Goal

`ki repo audit` lists the judgement items each skill's rubric leaves for review, by skill and criterion id, instead of only counting them, so a session can work through them without reading every rubric by hand.

## Context

At tools-ki a678f82a the audit's summary line ends `CRITERIA: EVALUATED=<n>/<m> JUDGMENT=<count>` and names none of the items. Eugene found on 23 November 2026 that an agent therefore runs the work of each skill's rubric itself (AUDIT-SUMMARY, relayed by Kitteth about 01:20 GMT), and the same ask came again in the estate round as AUDIT-JUDGE-LIST ([ki.tools at 4626cde0](https://github.com/krisb/ki-cairn-store/blob/4626cde01ce333c44e176ac6b4c90dbab77ccdc3/work/ki/ki.tools/_index.md)). Kris put it in stage 2 of the switch with the other tools-ki faults (24 November 2026, via Kitteth). Captured at `next` from the ki.tools reset map ([4.4](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#44-now-and-held), N2).

## Boundary

- **In:** the audit's text and JSON output naming each judgement item, its skill and its criterion id, and a quiet mode that keeps today's one-line summary.
- **Out:** judging the items, which stays with the session and the rubric's owner; the rubrics' content, which is each skill's.

## Current state

Captured as a draft on 26 November 2026 from the ki.tools reset map; not shaped or planned. At a678f82a the audit's summary ends `CRITERIA: EVALUATED=<n>/<m> JUDGMENT=<count>`.

## Steps

- [ ] Plan to Ready under `ki-work plan`.

## Files touched

Expected: the audit's report rendering under `src/commands/repo/` and `src/core/rubric/`, their tests, the README and manual where they describe the audit output, the changelog and this record.

## Verify

`bun run test:coverage` at the 100% thresholds and the repository's full checks; `ki repo audit --repo .` on a repository with judgement items names each with its skill and criterion id, in text and JSON.

## Dependencies / blocks

None. Lands only on Kris's yes, with a diff summary, under the switch.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

The README and manual's account of the audit output show the judgement list.

### Roadmap

This record only.

## Discussion

Planning settles whether the list is on by default or behind a flag, given how long it runs on a Knowledge Base.
