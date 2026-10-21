---
id: KI-TOOL-KI-CLI-169
area: CLI
title: Explicit acquisition failure outcomes
priority: medium
size: m
status: triage
theme: model
component: acquire
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-21T04:52:19Z
updated_at: 2026-10-21T04:52:19Z
---

# KI-TOOL-KI-CLI-169: Explicit acquisition failure outcomes

## Goal

Acquisition exposes unmapped projects, overlapping receiver mappings, missing sessions, changed sessions and failed reads as explicit outcomes, so no content is silently dropped or routed by guesswork.

## Context

Kris approved this tools-ki-owned OPS009-SPLIT capture on 20 October 2026 at 23:16 BST. The 21 October 01:40 and 01:55 BST grants, and the designated capture run, authorise recording this intake only. The executable importer belongs to tools-ki; reusable acquisition semantics and the incremental-source evaluation remain with the KI Agentic Harness.

The approved split separates failure visibility from the readable-source importer. A source may be readable while its project mapping is absent or conflicting, or while individual sessions disappear, change or fail to read. A superficially successful import must not conceal those cases.

Authority and provenance: [OPS009-SPLIT source requests](https://github.com/knowledgeislands/ki-principal/blob/20b5fce0bb34c213b3bfcec9c7e437eef5e45e1e/+/_WORK/ki.tools-burndown/messages.md).

## Boundary

This record covers explicit mapping, read and change-failure outcomes in the tools-ki importer. It excludes inventing receiver mappings, choosing relevance, the separate source connector, receiver-local triage, retirement or deletion, and the companion complete-move/no-op proof. Capture does not authorise implementation, provider calls, source changes or publication.

## Discussion

### Distinct outcomes

Preserve unmapped-project and overlapping-receiver cases without choosing an arbitrary destination. Distinguish a missing session from a failed read and a changed session from a verified unchanged retry. Report affected source scope and evidence honestly, leaving uncertainty visible rather than calling partial coverage complete.

### Planning decisions

Later planning must settle the observable result shape and retry behaviour for each case against the accepted acquisition contract. Fixtures should make every named case observable, including partial reads and changes during acquisition. This capture does not prescribe a new command, ledger or provider policy; its independent outcome is explicit failure reporting.
