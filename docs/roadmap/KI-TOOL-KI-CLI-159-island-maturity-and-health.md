---
id: KI-TOOL-KI-CLI-159
area: CLI
title: Island maturity and health
kind: deliver
purpose: capability
project: observatory
component: territory
priority: medium
size: m
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T18:53:00Z
updated_at: 2026-10-19T22:49:04Z
transferred_from: ki-principal ki.observatory CONDITION-TOML, 2026-10-19
---

# KI-TOOL-KI-CLI-159: Island Maturity and Health

## Goal

`ki` exposes, for each island in a territory or estate, its declared maturity read from its `.ki.toml` and its audit-derived health, sound, in decline or in ruin, read from `ki repo audit`, in a versioned machine-readable form, so that the Observatory reads both through `ki` rather than parsing configuration or inventing either signal.

## Context

Kris Brown decided under CONDITION-TOML on 19 October 2026, logged in the [Observatory decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.observatory/decisions.md), that each island declares its maturity in `.ki.toml` from a fixed scale the `ki-repo` standard defines, and that decline or ruin comes from `ki repo audit` health. The Observatory reads both through `ki`.

Two existing surfaces could carry them, and planning chooses:

- `ki territory show`, which already lists a selected territory's or estate's repositories and is the natural per-island view;
- `ki work status` and its `ki/work-status/v1` contract, which the Observatory already reads.

Health is derived, not declared, so it needs a rule and a cost bound: running every island's audit on each read may be too slow, so a cached or last-recorded audit outcome with its observed time may be the reading.

## Boundary

- In: reading the declared maturity key and validating it against the scale; deriving health from the island's `ki repo audit` outcome under the mapping the `ki-repo` standard states; a versioned JSON shape carrying both, with the observed time of the health reading; human output; tests.
- In: reporting an undeclared maturity or an audit that cannot run as unknown, never as a level.
- Out: defining the scale, the key or the health mapping, which the harness's `ki-repo` standard owns; declaring a level in any repository; the Observatory views that draw the signals, which apps-observatory.local owns.

## Shaping

**Approach:** read the declared maturity key, derive health from `ki repo audit` under the `ki-repo` mapping, and publish both in a versioned JSON form, reporting unknown rather than guessing.

**Dependencies:** KI-HARNESS-GOV-223, still at triage, defines the scale, key and health mapping; this record cannot be planned before it.

**Decisions still needed:** the open planning questions in Discussion: the surface, live or cached health, and the contract name and version.

**Promotion to Next:** when KI-HARNESS-GOV-223 is Ready or done.

## Dependencies / blocks

Depends on ki-agentic-harness work that defines the scale, the `.ki.toml` key and the audit criterion, [KI-HARNESS-GOV-223](https://github.com/knowledgeislands/ki-agentic-harness/blob/d100fb4dddf505693730db1cc6f8fb6f8a5daa92/docs/roadmap/KI-HARNESS-GOV-223-island-maturity-declaration.md), linked at a fixed revision so the link survives pruning. That is build order: the reader needs the key and scale to exist first.

Serves the Observatory in apps-observatory.local, [KI-OBSERVA-BCN-008](https://github.com/knowledgeislands/apps-observatory.local/blob/80c1a1b0faaf05e025ed37a8c8fdd6c9e62d9fbf/docs/roadmap/KI-OBSERVA-BCN-008-beacon-signal-anatomy.md) for the Beacon's condition chips and [KI-OBSERVA-VIS-030](https://github.com/knowledgeislands/apps-observatory.local/blob/934da9c9d3659fcccb3f0b07577363cc819761b7/docs/roadmap/KI-OBSERVA-VIS-030-known-lands-chart.md) for the Known Lands chart, each at a fixed revision. Both draw condition as unknown until this lands, so neither is blocked by build order.

## Discussion

Open for planning: which surface carries the signals, or both; whether health is read live, from a cached last audit, or from a recorded audit run; and the contract name and version. tools-ki owns priority and design.
