---
id: KI-TOOL-CLI-020
title: Render rubric remedies
theme: cli
horizon: next
status: done
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

## Steps

- [x] Preserve `contract: 1` and validate mandatory remediation metadata for every mechanical aspect: `automatic` has a callback; `diagnostic` and `guarded` have non-empty guidance and no callback; `guarded` has a judgment aspect.
- [x] Validate complete judgment review metadata: evidence scope, prompt, unique outcome vocabulary, and conforming guidance.
- [x] Render mechanical remediation and judgment-review guidance in generated rubric publications without creating synthetic findings.
- [x] Restrict rubric execution to `automatic` mechanical callbacks, retaining audit evidence for every remediation class.
- [x] Rename the unrelated command-publication option to `--allow-commands`, so it cannot be confused with rubric remediation classification.
- [x] Migrate all host fixtures atomically and run 189 focused CLI tests plus the TypeScript gate.

## Files touched

- `src/core/rubric.ts`, `src/core/runtime-loader.ts`, `src/core/runtime.ts`, and `src/core/rubric-render.ts`
- Repository conform option wording and affected report/publication paths
- Rubric-host CLI fixtures and this record

## Verify

- Invalid v1 metadata fixtures fail with actionable validation errors while `contract: 2` remains unsupported.
- Generated publication fixtures show remediation and complete reviewer guidance.
- Dry-run and apply fixtures prove only `automatic` callbacks create proposals or writes.
- Focused CLI tests and `bunx tsc --noEmit` pass.

## Review

### Delivered

The rubric host now enforces complete v1 remediation and judgment-review metadata, publishes that metadata, and executes only automatic mechanical remediation callbacks.

### Summary of changes

The runtime loader validates the remediation class, callback or guidance, and guarded-review relationship for every mechanical aspect. It also validates reviewer evidence, prompts, outcome vocabulary, and guidance. Generated publications render the new material, while the command-publication option is now named `--allow-commands`.

### Verification

```bash
bunx vitest run \
  src/tests/cli/repo/conform-execution.test.ts \
  src/tests/cli/repo/conform-writes.test.ts \
  src/tests/cli/repo/repo.test.ts \
  src/tests/cli/repo/targets.test.ts \
  src/tests/cli/repo/validation.test.ts \
  src/tests/cli/root/user.test.ts \
  src/tests/cli/skill/rubric-publication.test.ts \
  src/tests/cli/skill/rubric.test.ts \
  src/tests/cli/transaction/transaction.test.ts
bunx tsc --noEmit
```

The focused run passed 189 tests, and the TypeScript gate passed.

### Outstanding concerns

`ki repo audit --skill ki-roadmap --repo .` currently refuses the active Harness `ki-roadmap` rubric because its existing mechanical item lacks the newly mandatory remediation metadata. The corresponding Harness changes are being rolled out; this is outside the delivered host boundary and remains a known integration concern.

### Post-change review

The host preserves `contract: 1`, rejects contract 2, and does not introduce a compatibility path for incomplete metadata. Only automatic callbacks can publish remediation, so diagnostic and guarded guidance remains non-executing.

### Mini recap

The scope and its verification are complete. The remaining audit failure is an external rollout dependency, not an unrecorded implementation change.

## Done

Accepted by the user on 2026-08-06 with the known Harness rubric rollout concern retained above. Keep this record until explicitly selected for pruning.

## Discussion

### Contract coordination

The host-side validation and the corresponding Harness metadata must become available together. The temporary audit refusal correctly prevents a partial runtime contract from being treated as compatible while the rollout completes.
