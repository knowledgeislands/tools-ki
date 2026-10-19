---
id: KI-TOOL-KI-CLI-160
area: CLI
title: Work status routing view
kind: deliver
purpose: capability
project: ways-of-working
component: agent
priority: medium
size: s
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T21:10:00Z
updated_at: 2026-10-19T22:49:04Z
transferred_from: ki-principal ki.ways-of-working work-package design, point 35, 2026-10-19
---

# KI-TOOL-KI-CLI-160: Work Status Routing View

## Goal

`ki work status` offers a routing view: one line per work in a repository's `+/_WORK/`, giving its id, state, pending-message count and routing description, so that State of play, the single dispatch coordinator, can choose which work takes a new unit of work by reading one listing rather than every work folder.

## Context

Point 35 of the ki.ways-of-working [work-package design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/design/work-package.md) asks tools-ki for two things: the both-shapes reader with three additive fields, and "a routing view listing each work's id, state, pending-message count and description, the register State of play reads". [KI-TOOL-KI-CLI-158](KI-TOOL-KI-CLI-158-work-status-reads-packages.md) delivered the first and named the routing view as out of its boundary and outstanding.

Kris decided on 19 October, ROUTING-VIEW a) in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md), to capture this record now and plan it straight after KI-TOOL-KI-CLI-158.

The data already exists. Since KI-TOOL-KI-CLI-158 each `ki/work-status/v1` entry carries `id`, `state`, `description` and `messages`, so the view is a projection of the report, not a new reader. The JSON consumer can already route from `--format json`; what is missing is the human listing.

## Boundary

- In: a human routing view in `ki work status`, every live work in one listing with its id, state, pending count and description, drawn from the existing report; its help text, manual, command inventory, README and REPO-OPS-028 lines; tests through `run(args, context)`.
- Out: any change to how work folders are read, which KI-TOOL-KI-CLI-158 owns; any new field in `ki/work-status/v1`; the five derived views and the `v2` contract, [KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md); routing itself, which State of play does under `ki-coordination`; any write to a work folder.

## Shaping

**Approach:** a human routing listing in `ki work status`, one line per live work, drawn from the report KI-TOOL-KI-CLI-158 already builds.

**Dependencies:** none to build; it may sit beside [KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md)'s views if that is planned first.

**Decisions still needed:** the four open planning questions in Discussion: flag, subcommand or section; which folders appear; how a long description is cut; and filtering.

**Promotion to Next:** when State of play confirms the form it wants to read.

## Dependencies / blocks

Predecessor: [KI-TOOL-KI-CLI-158](KI-TOOL-KI-CLI-158-work-status-reads-packages.md), whose `description` and `messages` fields this view reads. Its work has landed, so it is sequence rather than build order and `blocked_by` stays empty. If KI-TOOL-KI-CLI-149 is planned first, the routing view may sit beside its views in the same text form; neither waits on the other.

## Discussion

Open for planning: whether the view is a flag on `ki work status` (such as `--view routing`), a subcommand, or a section of the default text form; whether checkpoints and `+/_WORK_REVIEW/` folders appear; how a long description is cut on one line; and whether finished or on-hold works list or are filtered. tools-ki owns priority and design.
