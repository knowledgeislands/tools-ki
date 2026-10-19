---
id: KI-TOOL-KI-CLI-157
area: CLI
title: Validator parity
kind: deliver
purpose: debt
project: tools-burndown
priority: medium
size: m
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T18:21:00Z
updated_at: 2026-10-19T22:49:04Z
---

# KI-TOOL-KI-CLI-157: Validator Parity

## Goal

`ki` and the harness roadmap checker read one shared field rule table, and a set of conformance cases proves that both give the same verdict, in the same words, on every work-record field rule, so that `ki work` and `ki repo audit` cannot drift apart again.

## Context

[KI-TOOL-KI-CLI-155 (pruned)](https://github.com/knowledgeislands/tools-ki/blob/a9d46d49/docs/roadmap/KI-TOOL-KI-CLI-155-priority-and-size-fields.md) brought `ki` level with the harness on `priority`, `size` and the migration-window gaps by copying the checker's vocabularies and wording into `src/core/work/items.ts`. Until then `ki` had rejected the two fields the harness already accepted, and dropped 18 records across three repositories. Copied rules drift again whenever the harness changes first.

Kris asked on 2026-10-19, in the cli155 brief, for one triage record: one shared field rule table, with conformance cases proving tools-ki and the harness checker agree. The harness stays the source of the wording.

Priority `medium` and size `m`, as intended at capture, entered the front matter at triage on 19 October 2026, now that `ki` accepts both fields.

## Boundary

The shared table covers work-record fields, their vocabularies, the migration-window gaps and their wording. It does not change the work-item format itself, the lifecycle or horizon model, or the Knowledge Base note fields owned by `ki-repo-kb`.

## Shaping

**Approach:** one field rule table in ki-agentic-harness beside the roadmap checker, consumed by tools-ki as a vendored copy under a drift check or a pinned reference, with one conformance fixture set run by both suites.

**Dependencies:** a linked ki-agentic-harness change for the table and its fixtures, which this record would hand off rather than make.

**Decisions still needed:** where the table lives, harness or KI Specifications, and how tools-ki takes it.

**Promotion to Next:** when the home is chosen and the harness side is captured.

## Discussion

### Where the table lives

The harness owns the wording, so the table most likely lives in ki-agentic-harness beside the roadmap checker, with tools-ki taking a vendored copy under a drift check or a pinned reference, as the cross-repository sharing preference sets. Planning should weigh that against a KI Specifications contract, which owns portable normative rules.

### Conformance cases

One fixture set, each case a record and its expected verdict and message, run by both the harness checker's tests and the tools-ki suite through `run(args, context)`. A case either side fails names the drift.
