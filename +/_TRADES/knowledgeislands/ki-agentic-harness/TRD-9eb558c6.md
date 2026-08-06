---
id: TRD-9eb558c6
title: 'Render rubric remediation model'
created_at: 2026-08-06T01:53:05Z
sender: knowledgeislands/ki-agentic-harness
receiver: knowledgeislands/tools-ki
kind: work
source_ref: KI-HARNESS-GOV-012
observation: decision
decision_status: adopted
received_from_ref: 323ed367ad526d1583802bd59eeb1466adea34c0
rationale: 'Captured as waiting local host work until the Harness publishes its compatible remediation metadata contract.'
adopted_as: KI-TOOL-CLI-020
---

# TRD-9eb558c6: Render rubric remediation model

## Context

The Harness is defining a rubric contract in which each mechanical aspect explicitly declares whether its remediation is automatic, diagnostic, or guarded, while judgment aspects carry a bounded review and guided-conforming procedure.

The shared rubric types, catalogue validation, and generated publication belong in the Harness. The `ki` host owns validation of loaded catalogues, mechanical AUDIT and CONFORM execution, and human-facing rendering.

## Submission

Accept a bounded host-contract item that validates the new remediation and judgment-review metadata, renders mechanical audit and conform results separately from unevaluated judgment review and guidance, and executes CONFORM callbacks only for `automatic` mechanical aspects.

Preserve the canonical finding transport and the existing boundary: the host must not execute judgment guidance, invent a synthetic judgment result, or choose a guarded remediation. Add CLI fixtures for valid metadata, invalid metadata, automatic idempotent repair, diagnostic and guarded no-write outcomes, and a hybrid criterion.

## Constraints

Do not change rubric policy, classifications, or skill-owned safe writers in `tools-ki`; those remain Harness-owned and must arrive through an accepted compatible-harness contract.

Do not add remote transport, cross-repository writes, or a compatibility path for unclassified mechanical items. Preserve the host's transaction, dry-run, and post-conform verification boundaries.
