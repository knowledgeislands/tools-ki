---
id: KI-TOOL-CLI-020
title: Render rubric remedies
theme: cli
horizon: next
status: in-progress
blocks: []
blocked-by: []
baseline-ref: b80ef17092abbdb8226a375b4921f4ac63c09358
transferred-from: knowledgeislands/ki-agentic-harness:KI-HARNESS-GOV-012
---

## Goal

Render the compatible Harness rubric remediation model faithfully, so users can distinguish automatic repair from diagnostic or guarded follow-up and can review unevaluated judgment guidance without the CLI acting on it.

## Context

Harness work `KI-HARNESS-GOV-012` requested a bounded host-contract delivery through received work trade [`TRD-9eb558c6`](../../+/_TRADES/knowledgeislands/ki-agentic-harness/TRD-9eb558c6.md). The confirmed receiver contract retains `contract: 1`: it adds mandatory mechanical remediation metadata and complete judgment-review metadata without a contract-version bump or a contract-2 compatibility path.

## Boundary

This item does not define remediation classes, choose guarded actions, execute judgment guidance, or add a compatibility path for unclassified mechanical criteria. Those policy decisions remain Harness-owned. The host validates the published v1 schema, renders it faithfully, and executes only `automatic` mechanical actions.

## Discussion

## Steps

- [ ] Preserve `contract: 1` and validate mandatory remediation metadata for every mechanical aspect: `automatic` has a callback; `diagnostic` and `guarded` have non-empty guidance and no callback; `guarded` has a judgment aspect.
- [ ] Validate complete judgment review metadata: evidence scope, prompt, unique outcome vocabulary, and conforming guidance.
- [ ] Render mechanical remediation and judgment-review guidance in generated rubric publications without creating synthetic findings.
- [ ] Restrict rubric execution to `automatic` mechanical callbacks, retaining audit evidence for every remediation class.
- [ ] Rename or clarify the unrelated command-publication `--allow-guarded` option so it cannot be confused with rubric remediation classification.
- [ ] Migrate all host fixtures atomically, run focused CLI tests and the type gate, then return status and trade evidence to GOV-012.

## Files touched

- `src/core/rubric.ts`, `src/core/runtime-loader.ts`, `src/core/runtime.ts`, and `src/core/rubric-render.ts`
- Repository conform option wording and affected report/publication paths
- Rubric-host CLI fixtures and this record

## Verify

- Invalid v1 metadata fixtures fail with actionable validation errors while `contract: 2` remains unsupported.
- Generated publication fixtures show remediation and complete reviewer guidance.
- Dry-run and apply fixtures prove only `automatic` callbacks create proposals or writes.
- Focused CLI tests and `bunx tsc --noEmit` pass.
