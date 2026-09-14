---
id: KI-TOOL-CLI-070
area: CLI
title: Automate Canonical Batch Records
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-14T22:08:09Z
updated_at: 2026-09-14T22:08:09Z
---

# Automate Canonical Batch Records

## Goal

Provide a native `ki` command that scaffolds, hashes, and validates canonical batch records so agents do not have to reproduce the storage format and integrity mechanics by hand.

Keep every authority-bearing choice explicitly human- or caller-supplied: the command must never infer approval, scope, mandatory stops, completion targets, or closure authority.

## Context

The September 2026 estate audit found 42 commits touching batch storage within one month. The repeated work includes creating the same record structure, calculating the approved-payload digest, inserting the run marker, and resolving the stored authorisation before execution.

The Harness already carries deterministic `approvedPayloadSha256` and `resolveBatchAuthorisation` mechanics, but they are implementation helpers inside a skill rather than a stable native operation. Reimplementing those steps in each agent session adds friction and creates avoidable risk that a plausible-looking record has the wrong digest or does not bind the exact approved payload.

## Boundary

Do not move batch semantics or lifecycle authority out of the compatible Harness, manufacture an approval from conversational context, select roadmap work, decide a batch boundary, supply default mandatory stops, close work, execute a batch, push, or release.

Do not treat successful structural or digest validation as evidence that the human approved the batch. The command may prove that a record is internally coherent; it cannot prove the legitimacy or sufficiency of the authority expressed by its inputs.

## Discussion

### Native operation

Planning should define one cohesive command surface for three deterministic operations: scaffold a canonical record from explicit inputs, calculate or refresh its approved-payload digest and run marker, and validate that the stored record resolves to the same immutable payload.

The scaffold should require authority-bearing fields from the caller or leave them visibly incomplete and invalid. In particular, it must not invent `approved`, `approved_at`, `authority_mode`, `authority_evidence`, `item_ids`, `completion_target`, `mandatory_stops`, or `closure_item_ids` values.

### Contract ownership

The compatible Harness remains the owner of the batch contract and process meaning. `ki` should expose its deterministic storage mechanics through a CLI boundary, with fixtures derived from the published contract, rather than create a second batch schema or interpret whether a proposed scope is safe.

Plan the versioning and failure behaviour for an installed CLI whose Harness publishes a newer batch shape. Fail closed on unsupported or ambiguous records and report the owning contract instead of silently accepting a partial projection.

### Verification

CLI-driven tests should cover a valid scaffold supplied with exact values, stable digest generation, run-marker binding, altered-payload rejection, missing authority fields, unsupported fields, malformed identities and timestamps, and an explicit demonstration that no command path can infer or upgrade approval.
