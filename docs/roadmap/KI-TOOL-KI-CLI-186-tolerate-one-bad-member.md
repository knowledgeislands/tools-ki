---
id: KI-TOOL-KI-CLI-186
area: CLI
title: Tolerate one bad member
kind: deliver
purpose: corrective
component: territory
priority: high
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

# KI-TOOL-KI-CLI-186: Tolerate one bad member

## Goal

One bad territory declaration or member configuration fails only the territory or member it belongs to: `ki territory list` and `ki territory roots` still answer for every other territory and member, and name the bad one with its reason.

## Context

Two faults, seen failing, show the same shape:

- **TERRITORY-SORT.** On 23 November 2026 at 00:12 GMT one out-of-order `territory_members` entry in tc-principal's `.ki.toml` made `ki territory list` fail for every territory, which emptied the Cairn Wayfinder's territories and hung its captures. The data was fixed in tc-principal (507a0e7); the code still throws for the whole list. At tools-ki a678f82a, `src/core/territory/declaration.ts` raises `territory_members must be sorted ascending` as an error for the whole read.
- **TERRITORY-ROOTS.** `ki territory roots` fails outright on a member whose `.ki.toml` carries `[skills] ki-repo = 1`, where one bad member should fail alone.

Both reached ki.tools on 23 November 2026, the first from a ki.cairn run and the second in the estate round's fifth item from Loreward ([ki.tools at 4626cde0](https://github.com/krisb/ki-cairn-store/blob/4626cde01ce333c44e176ac6b4c90dbab77ccdc3/work/ki/ki.tools/_index.md)). Kris put them first in stage 2 of the switch, the `ki` tools coming back on in stages (24 November 2026, 11:16 GMT, via Kitteth): the held tool updates start with tools-ki's faults, each landing only on his yes with a diff summary. Captured at `next` from the ki.tools reset map ([4.4](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#44-now-and-held), N1).

## Boundary

- **In:** reading territory declarations and member configurations one at a time, so that a failure is reported against its own territory or member with a non-zero exit, while every good one is still listed; the same for `ki territory list` and `ki territory roots`; tests for an out-of-order member list and a malformed member table.
- **Out:** relaxing the sorted-members rule itself, which stays a declaration error; the Wayfinder's own handling, which is ki.cairn's.

## Current state

Captured as a draft on 26 November 2026 from the ki.tools reset map; not shaped or planned. At a678f82a the declaration reader in `src/core/territory/declaration.ts` throws for the whole read, and `ki territory roots` is registered in `src/commands/territory/index.ts`.

## Steps

- [ ] Plan to Ready under `ki-work plan`.

## Files touched

Expected: `src/core/territory/declaration.ts`, `src/commands/territory/`, their tests, the README and manual where they describe the territory commands, the changelog and this record.

## Verify

`bun run test:coverage` at the 100% thresholds and the repository's full checks; `ki territory list` and `ki territory roots` against a fixture estate with one out-of-order member list and one malformed member table list every other territory and member and name the bad ones.

## Dependencies / blocks

None. Lands only on Kris's yes, with a diff summary, under the switch.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

The README and manual's account of `ki territory list` and `roots` say how a bad territory or member is reported.

### Roadmap

This record only.

## Discussion

Planning settles the exit status when some territories fail and others succeed, and whether `--json` carries the failures beside the results.
