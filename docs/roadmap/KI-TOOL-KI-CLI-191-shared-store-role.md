---
id: KI-TOOL-KI-CLI-191
area: CLI
title: Shared store role
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

# KI-TOOL-KI-CLI-191: Shared store role

## Goal

A Knowledge Base principal may declare a `shared` store role in its `.ki.toml`, `store_roles = ["notes", "shared", "sources"]` under `[skills.ki-repo]`, naming a partial knowledge base it hosts.

## Context

Kris decided on 26 November 2026 that hnr-shared is declared only in hnr-principal, as its shared store, with nothing KI in hnr-shared itself (PART-HOME, in ki.guilds' [Partial knowledge base (60)](https://github.com/krisb/ki-cairn-store/blob/4f796b395adf179ecb547738760cacd859de4705/work/ki/ki.guilds/60-partial-knowledge-base.change.md), step 2). That change sets tools-ki's whole part: `declaredKnowledgeBaseStoreRoles` in `src/core/configuration/declaration.ts` accepts `shared`, and nothing else in `ki` changes. At tools-ki a678f82a it accepts only `notes`, `sources` and `legacy`. Loreward relayed the ask on 26 November 2026 (PART-HOME-SHARED, [ki.tools at f776febe](https://github.com/krisb/ki-cairn-store/blob/f776febe4b3dd61ee3730748dc3d9767614e0ab3/work/ki/ki.tools/_index.md)). Captured at `next` from the ki.tools reset map ([4.4](https://github.com/krisb/ki-cairn-store/blob/d28c5faeca6ddcf069354dea49e8a645a37d7efb/work/ki/ki.tools/13-reset-map.change.md#44-now-and-held), N6).

## Boundary

- **In:** `shared` accepted as a store role, its type and its error message, with tests.
- **Out:** following links into the shared store, which the backpack's `ki-repo-kb` walkers do, read only and capped at WARN; the skills' text, which Gilder writes once Kris approves ki.guilds' model.

## Current state

Captured as a draft on 26 November 2026 from the ki.tools reset map; not shaped or planned. At a678f82a `KnowledgeBaseStoreRole` is `'notes' | 'sources' | 'legacy'`, and `declaredKnowledgeBaseStoreRoles` rejects any other role.

## Steps

- [ ] Plan to Ready under `ki-work plan`.

## Files touched

Expected: `src/core/configuration/declaration.ts`, its tests, the changelog and this record.

## Verify

`bun run test:coverage` at the 100% thresholds and the repository's full checks; a Knowledge Base declaration with `store_roles = ["notes", "shared", "sources"]` is accepted, and `shared` on a project repository is still refused.

## Dependencies / blocks

The backpack's `ki-repo` configuration standard defines the `shared` role when ki.guilds' change 60 lands; this record follows the same definition. hnr-principal declares the role only once both have landed.

## Documentation impact

### Decision Records

None; the decision is Kris's PART-HOME, homed in the backpack's `ki-repo` standard when ki.guilds' change 60 lands.

### Specifications

None.

### Guides

None in tools-ki; the configuration standard is the backpack's.

### Roadmap

This record only.

## Discussion

None.
