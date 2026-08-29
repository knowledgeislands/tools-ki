---
id: KI-TOOL-BATCH-002
repository: https://github.com/knowledgeislands/tools-ki
approved: true
approved_at: 2026-08-29T23:04:17Z
authority_mode: outcome
authority_evidence: User instructed the agent to prepare and progress more roadmap work under the established autonomous batch and consolidated-acceptance contract.
approved_payload_sha256: ff8414289c9e4098aa4f12a8a370436f652922d09f5210dec8fe0c8ee8ec4669
run_id: KI-TOOL-BATCH-002-RUN-001
timebox_ends_at: 2026-08-30T02:04:17Z
item_ids: [KI-TOOL-CLI-057]
completion_target: done
mandatory_stops: [contract-expansion-beyond-selected-plan, material-scope-expansion, destructive-or-irreversible-work, external-coordination, verification-failure, unapproved-decision, push-or-release]
closure_item_ids: [KI-TOOL-CLI-057]
---

# KI-TOOL-BATCH-002 — Aggregate package-script claims

## Outcome authority

Deliver `KI-TOOL-CLI-057` to a stable, evidence-backed host aggregation contract while keeping estate migrations, Website policy, unrelated CLI behaviour, external coordination, pushes, and releases outside the run.

## Selected plan

1. `KI-TOOL-CLI-057` — validate `packageScripts` on resolved skill catalogues, aggregate a deterministic read-only claim inventory, reject duplicate resolved claims, expose the inventory through the existing repository-operation audit seam, and prove unresolved skills and repository exclusions are not reinterpreted as claims.

The mutable scope is limited to:

- resolved-catalogue and repository-operation modules under `src/core/`
- the injected repository command adapter only where required to carry the inventory
- CLI contract fixtures under `src/tests/cli/`
- `docs/roadmap/KI-TOOL-CLI-057-aggregate-package-script-claims.md`
- `+/_AUTHORISATIONS/KI-TOOL-BATCH-002.md`

Verification is the record's exact coverage, TypeScript, Biome, build, and engineering-audit gate. Tests remain CLI-driven and network-free.

## Excluded work

- Prefix inference, arbitrary or unresolved skill scanning, repository-owned ownership declarations, or a compatibility owner-family map.
- Website-specific policy, estate migrations, or edits to another repository.
- Any push, release, prune, destructive action, or external coordination.

## Completion and remedial policy

The admitted record must independently reach `awaiting-review`, pass its review-packet recheck, and close through `ki-accept`. Non-blocking improvements become separately prioritised follow-up records; they do not prevent a viable verified host contract from closing.

## Run ledger

<!-- ki-batch-run: KI-TOOL-BATCH-002-RUN-001 ff8414289c9e4098aa4f12a8a370436f652922d09f5210dec8fe0c8ee8ec4669 -->

### `KI-TOOL-CLI-057`

- **Admitted state and baseline:** `ready`; `tools-ki` baseline `317d0ccaf8f9b013ec2381d88fc69f4c92f3d0b9`.
- **Result:** `done`; started by `6d5d8b9`, delivered for review by `e58ff49`, and accepted by `cba86e1`.
- **Delivery evidence:** The imported catalogue validates exact `packageScripts`; repository operations aggregate a deterministic `{ script, skill }` inventory from every declared resolved skill, even under filtered execution, and pass it through the rubric session boundary. Duplicate claims fail before audit or conform execution.
- **Verification:** All 696 tests passed with 100% statements, branches, functions, and lines. TypeScript, Biome, build, roadmap, authoring, and both built and installed engineering-audit gates passed. CLI fixtures cover malformed and absent claims, several owners, duplicate ownership, filtered selection, undeclared providers, and `script_exclusions` non-ownership.
- **Decision and stops:** Implemented only host aggregation and observable failure/input contract. No owner-specific command judgment, Website policy, estate migration, arbitrary skill scan, compatibility map, sibling-repository write, push, release, or prune occurred. No delegation was used.

## Batch recap

The single admitted record reached `done` under the exact consolidated-acceptance grant. `tools-ki` now supplies the receiver dependency required by `KI-HARNESS-GOV-007`; the Harness remains responsible for consuming the inventory and completing its own script-ownership contract. The run made no destructive or irreversible change, external coordination, push, release, or prune.
