---
id: KI-TOOL-KI-CLI-157
area: CLI
title: Validator parity
status: triage
blocks: []
blocked_by: [KI-TOOL-KI-CLI-155]
baseline_ref: null
created_at: 2026-10-19T18:21:00Z
updated_at: 2026-10-19T18:21:00Z
---

# KI-TOOL-KI-CLI-157: Validator Parity

## Goal

`ki` and the harness roadmap checker read one shared field rule table, and a set of conformance cases proves that both give the same verdict, in the same words, on every work-record field rule, so that `ki work` and `ki repo audit` cannot drift apart again.

## Context

[KI-TOOL-KI-CLI-155](KI-TOOL-KI-CLI-155-priority-and-size-fields.md) brought `ki` level with the harness on `priority`, `size` and the migration-window gaps by copying the checker's vocabularies and wording into `src/core/work/items.ts`. Until then `ki` had rejected the two fields the harness already accepted, and dropped 18 records across three repositories. Copied rules drift again whenever the harness changes first.

Kris asked on 2026-10-19, in the cli155 brief, for one triage record: one shared field rule table, with conformance cases proving tools-ki and the harness checker agree. The harness stays the source of the wording.

Intended priority `medium` and size `m`. They stay out of the front matter until a `ki` release carrying KI-TOOL-KI-CLI-155 accepts them.

## Boundary

The shared table covers work-record fields, their vocabularies, the migration-window gaps and their wording. It does not change the work-item format itself, the lifecycle or horizon model, or the Knowledge Base note fields owned by `ki-repo-kb`.

## Discussion

### Where the table lives

The harness owns the wording, so the table most likely lives in ki-agentic-harness beside the roadmap checker, with tools-ki taking a vendored copy under a drift check or a pinned reference, as the cross-repository sharing preference sets. Planning should weigh that against a KI Specifications contract, which owns portable normative rules.

### Conformance cases

One fixture set, each case a record and its expected verdict and message, run by both the harness checker's tests and the tools-ki suite through `run(args, context)`. A case either side fails names the drift.
