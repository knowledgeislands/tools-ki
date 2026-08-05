---
id: KI-TOOL-CLI-017
title: Report Knowledge Base streams
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make `ki repo roadmap` report the native Streams and Focus structure of a KI Knowledge Base instead of diagnosing its intentional lack of `docs/roadmap/`.

## Context

`ki repo roadmap list` currently reads non-KB repository work-item files exclusively from `docs/roadmap/`.

A Knowledge Base such as `ki-techne-principal` keeps governed work in native Streams and proposal Checklists, so the current output incorrectly reports that its roadmap directory is missing.

The command should identify a declared KI Knowledge Base and render its native planning structure under the same read-only roadmap command surface.

## Boundary

This item does not replace the Knowledge Base Streams lifecycle, invent flat Markdown work items for a Knowledge Base, mutate Focus or proposal Checklists, or alter the non-KB `docs/roadmap/` contract.

## Discussion

### Repository type determines the planning source

`ki repo roadmap` should select its planning source from the repository's declared type: canonical work items for a non-KB repository, and Streams/Focus material for a Knowledge Base.

The rendered result should make that source explicit, preserve the selected-repository framing and diagnostics, and remain read-only.

### Native lifecycle authority remains intact

Knowledge Base streams, proposals, and Checklists remain authoritative for their own state and transitions.

This work is an inventory and rendering integration only; any lifecycle operation belongs to the appropriate Knowledge Base skill and requires separately defined authority.
