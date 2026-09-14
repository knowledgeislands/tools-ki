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
