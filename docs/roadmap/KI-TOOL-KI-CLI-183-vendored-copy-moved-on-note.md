---
id: KI-TOOL-KI-CLI-183
area: CLI
title: Vendored copy moved-on note
kind: deliver
purpose: capability
priority: low
size: s
assignee: work/ki.tools
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-11-20T12:50:00Z
updated_at: 2026-11-20T12:50:00Z
---

# KI-TOOL-KI-CLI-183: Vendored copy moved-on note

## Goal

When a repository vendors a skill and records its backpack `commit`, `ki repo audit` adds an information-level note where the backpack's current version of that skill differs from the one at `commit`, so the owner can see that the backpack has moved on past the copy and choose when to refresh it.

## Context

Kris took COPY-DETAILS on 17 November 2026, about 23:34 GMT, under GUARDIAN-LANDS a. Its second point is written into `ki-repo`'s [vendored skills rule](https://github.com/knowledgeislands/ki-agent-backpack/blob/5219ac3d3/skills/keystone/ki-repo/references/standard-configuration.md#434-vendored-skills) at backpack `5219ac3d3`: "Where the backpack's current version of the skill differs from the one at `commit`, the audit adds an information-level note that the backpack has moved on past the copy, so the owner can choose when to refresh it; the copy is not wrong for being behind." The decision leaves the note's code to `tools-ki`, built by ki.tools.

The cairn.summit's closed change 13 names it as an open piece of work with no other home, [gap 2](https://github.com/krisb/ki-cairn-store/blob/3fd8cee865304baf91d30708ac8c58df5b18270b/work/cairn/cairn.summit/13-runtimes-and-skill-copies.change.md#72-gaps): "`tools-ki`'s vendored-skill check, at `d185bda8`, has no such note, and no `tools-ki` record or ki.tools item carries it. To close: a `tools-ki` roadmap record, ki.tools'." This is that record, captured on Loreward's brief while ki.summit holds the `ki` command surface until Ferris, ki.tools' actor, is seated.

Today [`src/core/repository/vendored-skills.ts`](https://github.com/knowledgeislands/tools-ki/blob/d185bda8/src/core/repository/vendored-skills.ts) gives each vendored skill with a recorded `commit` one `VENDORED-COPY` finding: information when the copy matches the backpack at that commit or cannot be checked, and a warning when the copy has drifted or Git ignores it. It never looks at the backpack's current version of the skill.

## Boundary

In scope: the information-level moved-on note on the `ki-repo` report, comparing the skill's directory in the declared backpack checkout at `commit` with its current version there, and its tests and documentation. Out of scope: the drift warning and the uncheckable-copy information, which stand; any repair or conform action, since no action rewrites a vendored copy; fetching the backpack, so the note reflects the local checkout; and COPY-DETAILS's last part, the managed `.gitignore` block re-including vendored copies, `RUNTIMES-6` checking they are tracked and Git computing the hashes, which went to the Repository guild's review (change 13, gap 3).

## Current state

Captured as a draft on 20 November 2026 from change 13's gap 2, on Loreward's brief; not shaped or planned. Kris's COPY-DETAILS decision directs the work and leaves its code to ki.tools.

## Steps

- [ ] Plan to Ready under `ki-work plan`, settling the questions under Dependencies / blocks.

## Files touched

Expected: `src/core/repository/vendored-skills.ts`, its tests, the README and manual where they describe the vendored-copy check, the changelog and this record.

## Verify

`bun run test:coverage` at the 100% thresholds and the repository's full checks; `ki repo audit --repo .` on a repository whose vendored copy's `commit` is behind the backpack checkout shows the information-level note, and none where the skill is unchanged since `commit`.

## Dependencies / blocks

None. Shaping settles what "the backpack's current version" means for a checkout, its `HEAD` or the installed backpack's resolved release, and whether the note stands beside a drift warning or only beside a match.

## Documentation impact

### Decision Records

None; the decision is Kris's COPY-DETAILS, homed in `ki-repo`'s sources.

### Specifications

None; the rule is `ki-repo`'s vendored skills rule.

### Guides

The README and manual's account of the vendored-copy check gain the note.

### Roadmap

This record only.

## Discussion

None yet.
