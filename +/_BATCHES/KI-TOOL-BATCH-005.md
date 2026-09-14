---
id: KI-TOOL-BATCH-005
repository: https://github.com/knowledgeislands/tools-ki
approved: true
approved_at: 2026-09-14T17:39:26Z
authority_mode: outcome
authority_evidence: User instructed the agent to get the two remaining roadmap items completed; CLI-068 is independently executable while CLI-067 remains subject to the existing dirty-repository stop.
approved_payload_sha256: 67a4b895331ddb56ba72f87bec5c19f6e745d459bf1bab18e2649cc521c11c82
run_id: KI-TOOL-BATCH-005-RUN-001
timebox_ends_at: 2026-09-14T21:39:26Z
item_ids: [KI-TOOL-CLI-068]
completion_target: done
mandatory_stops: [public-contract-change, material-scope-expansion, destructive-or-irreversible-work, external-coordination, verification-failure, contested-path, push-or-release]
closure_item_ids: [KI-TOOL-CLI-068]
---

# KI-TOOL-BATCH-005 — Complete Remaining Local Modularity Work

## Outcome authority

Deliver and consolidate acceptance of CLI-068 without changing public CLI behaviour. Preserve the existing external-repository stop governing CLI-067 and re-evaluate it after the independent local work completes.

## Selected plan

1. `KI-TOOL-CLI-068` — split Harness storage registry configuration, installation, recovery, and development projection into cohesive modules behind the existing storage barrel, preserving every observable CLI contract.

## Excluded candidates

- `KI-TOOL-CLI-067` — already `in-progress` under earlier authority and currently blocked by dirty `ki-techne-principal` and `kit-legal` repositories; do not reset its lifecycle or bypass its migration gate.

## Completion and remedial policy

CLI-068 must reach `awaiting-review` with its own review packet, pass current-evidence recheck, and close through `ki-accept`. Any behavioural change or uncovered defect becomes a named stop or separately scoped remedial record rather than being hidden inside the refactor.

## Run ledger

<!-- ki-batch-run: KI-TOOL-BATCH-005-RUN-001 67a4b895331ddb56ba72f87bec5c19f6e745d459bf1bab18e2649cc521c11c82 -->

### CLI-068 — Harness storage lifecycle split

- **Admitted state and baseline:** `ready` at `5628ddbf0b9f6ce9ac30889761f7528c0a86f9cd`.
- **Result:** `awaiting-review` with a complete six-part review packet.
- **Verification:** 162 focused CLI contracts passed; full coverage remained 100% on all four metrics; TypeScript, Biome, Knip, build, `ki-self`, `ki-engineering`, and the complete 18-skill repository audit passed.
- **Decisions:** Preserved the storage barrel and public behaviour. Split only by stable lifecycle ownership. Applied the current canonical working-area README scaffold when the full audit exposed unrelated mechanical drift.
- **Delegation:** None; the shared-working-tree refactor was completed serially.

### CLI-067 — parked exclusion

CLI-067 remained `in-progress` under its earlier baseline and was not modified. Six Techne records and 19 Legal records remain behind the explicit dirty-repository stop; the mandatory Harness and `tools-ki` timestamp cutovers remain gated on their migration.

### CLI-068 — accepted

Committed implementation `a92cb99a282401d0b4e3cca49f8db67955240eb0` passed the current six-part review-packet check and complete 18-skill repository audit. The item closed through `ki-accept` under this authorisation's exact `done` completion target.

## Batch recap

CLI-068 completed and closed without public-contract change, delegation, external coordination, push, release, or remedial follow-up. CLI-067 remains the sole roadmap item and was parked without mutation because its 25 remaining estate records are in dirty repositories.
