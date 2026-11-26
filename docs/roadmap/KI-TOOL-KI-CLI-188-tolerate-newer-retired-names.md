---
id: KI-TOOL-KI-CLI-188
area: CLI
title: Tolerate newer retired names
kind: deliver
purpose: corrective
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

# KI-TOOL-KI-CLI-188: Tolerate newer retired names

## Goal

A repository still declaring `ki-agentic-radar`, `ki-model-radar` or `ki-delegation-orca` is read the way other retired skills are, tolerated while repositories catch up, rather than failing as an unknown skill.

## Context

The backpack retired three skill names at 93b0bfb1b: `ki-agentic-radar` and `ki-model-radar` became `ki-radar` (RADAR-MERGE a), and `ki-delegation-orca` retired with no successor (ORCA-WORKERS b). At tools-ki a678f82a, `RETIRED_SKILLS` in `src/core/configuration/declaration.ts` lists eight older names but none of these three. The ask reached ki.tools as RETIRED-NAMES in the estate round's fifth item on 23 November 2026 ([ki.tools at 4626cde0](https://github.com/krisb/ki-cairn-store/blob/4626cde01ce333c44e176ac6b4c90dbab77ccdc3/work/ki/ki.tools/_index.md)), and Kris put it in stage 2 of the switch with the other tools-ki faults (24 November 2026, via Kitteth). Captured at `next` from the ki.tools reset map ([4.4](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#44-now-and-held), N3).

## Boundary

- **In:** the three names in `RETIRED_SKILLS`, with a test for each.
- **Out:** renaming declarations in repositories, which `ki repo conform` and each repository's owner do.

## Current state

Captured as a draft on 26 November 2026 from the ki.tools reset map; not shaped or planned. At a678f82a `RETIRED_SKILLS` lists eight names, none of these three.

## Steps

- [ ] Plan to Ready under `ki-work plan`.

## Files touched

Expected: `src/core/configuration/declaration.ts`, its tests, the changelog and this record.

## Verify

`bun run test:coverage` at the 100% thresholds and the repository's full checks; a declaration naming each of the three retired skills is read without an unknown-skill failure.

## Dependencies / blocks

None. Lands only on Kris's yes, with a diff summary, under the switch.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

None.

### Roadmap

This record only.

## Discussion

None.
