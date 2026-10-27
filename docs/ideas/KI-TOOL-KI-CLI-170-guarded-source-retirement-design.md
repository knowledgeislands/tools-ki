---
id: KI-TOOL-KI-CLI-170
area: CLI
title: Guarded source retirement design
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

> **Idea, not on the roadmap.** Design a guarded way to delete an acquired source only after every safety gate passes; nothing deletes sources today, so there is nothing to guard. Moved out of `docs/roadmap/` on 27 October 2026 under the roadmap sweep, with its record kept in full here so that it can return when Kris brings it back; it was `KI-TOOL-KI-CLI-170`.

# KI-TOOL-KI-CLI-170: Guarded source retirement design

## Goal

Define a separately invoked source-retirement manifest and a provider-supported guarded deletion design that keeps deletion unavailable until every safety gate is satisfied.

## Context

Kris approved this tools-ki-owned OPS009-SPLIT capture on 20 October 2026 at 23:16 BST. The 21 October 01:40 and 01:55 BST grants, and the designated capture run, authorise recording this intake only. The executable importer belongs to tools-ki; reusable acquisition semantics and the incremental-source evaluation remain with the KI Agentic Harness.

The approved split requests retirement design separately from acquisition. A successful capture is not authority to retire a source. The source request requires fail-closed handling of incomplete, changed, uncommitted or unverifiable acquisitions, with human approval bound to the exact current manifest.

Authority and provenance: [OPS009-SPLIT source requests](https://github.com/knowledgeislands/ki-principal/blob/20b5fce0bb34c213b3bfcec9c7e437eef5e45e1e/+/_WORK/ki.tools-burndown/messages.md).

## Boundary

This record captures the tools-ki retirement manifest and guarded deletion design only. It grants no deletion capability, provider invocation, live apply, source retirement, source deletion or publication. Acquisition and retirement remain separate invocations; the complete-project-move and completed-agent-session-no-op proof is a separate prerequisite owned by its companion capture.

## Discussion

### Mandatory gates

Deletion stays unavailable until every manifest entry has a recoverable acquired copy, the source still matches the manifest and the human approves that exact current manifest. All three gates are mandatory together. Fail closed on incomplete, changed, uncommitted or unverifiable acquisitions. Changed source or a changed manifest cannot inherit approval for an earlier manifest; recoverability must hold for every entry rather than a sample.

### Provider-supported path

The design must establish a provider-supported deletion path and the evidence needed to enforce the gates, without treating an unsupported route as permission to bypass them. Source retirement is separately invoked and separately authorised. Planning must retain the current acquisition standard's verified named Git revision and immediate human approval requirements, and must not enable deletion before the companion proof requirement is met. This intake is design work, not permission to implement or activate that path.
