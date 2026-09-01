---
id: KI-TOOL-BATCH-003
repository: https://github.com/knowledgeislands/tools-ki
approved: true
approved_at: 2026-09-01T13:32:10Z
authority_mode: outcome
authority_evidence: User explicitly approved CLI-058 and CLI-059 for implementation and acceptance, directed CLI-060 and CLI-061 through readiness and implementation, requested delegation and parallel execution where safe, and asked to get the selected work done and moved off.
approved_payload_sha256: 8937da038cff8cac1c20bec8b52691ef27a525693aeecc98814ffa009b321cf9
run_id: KI-TOOL-BATCH-003-RUN-001
timebox_ends_at: 2026-09-01T21:32:10Z
item_ids: [KI-TOOL-CLI-058, KI-TOOL-CLI-060, KI-TOOL-CLI-061, KI-TOOL-CLI-059]
completion_target: done
mandatory_stops: [public-contract-change-outside-selected-plan, material-scope-expansion, destructive-or-irreversible-work, external-coordination, verification-failure, unapproved-decision, push-or-release]
closure_item_ids: [KI-TOOL-CLI-058, KI-TOOL-CLI-060, KI-TOOL-CLI-061, KI-TOOL-CLI-059]
---

# KI-TOOL-BATCH-003 — Complete Agora inspection and core modularization

## Outcome authority

Deliver the four explicitly named local roadmap items through their governed lifecycle. Preserve the locked Agora command contracts and the behavior-preserving trade and runtime refactor boundaries. Keep repository-external writes, editor mutation, public-contract expansion, pushes, releases, pruning, and destructive work outside the run.

## Selected plans

1. `KI-TOOL-CLI-058` — add the focused read-only Agora health audit contract.
2. `KI-TOOL-CLI-060` — modularize the trade lifecycle core behind its unchanged facade.
3. `KI-TOOL-CLI-061` — modularize the runtime operation core behind its unchanged facade.
4. `KI-TOOL-CLI-059` — add explicit read-only editor projection inspection after CLI-058 settles their shared Agora command, documentation, completion, and test surfaces.

CLI-060 and CLI-061 may execute in parallel with the Agora lane because their source ownership is disjoint. CLI-059 follows CLI-058 for shared-surface integration even though it has no product dependency.

## Scope

- Repository: `https://github.com/knowledgeislands/tools-ki`
- Files: the four canonical roadmap records; their approved source, CLI contract-test, specification, guide, README, manual, completion, and decision-record surfaces; this authorisation.
- Delegation: permitted for one cohesive worker lane per item, with CLI-058 and CLI-059 sequenced and the orchestrator retaining lifecycle transitions, integration, final verification, and acceptance evidence.
- Decisions: apply only the locked record contracts and fail-closed observation behavior; any new public contract, storage policy, runtime dependency, or cross-repository decision is a mandatory stop.

## Required verification

- Each record's exact targeted CLI contract checks.
- `bun run test:coverage`
- `bun run build`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bunx knip --reporter compact`
- `ki repo audit --repo .`

## Completion and remedial policy

Each admitted record must independently reach `awaiting-review` with the canonical six-heading packet, pass a current evidence recheck, and close through `ki-accept` under this exact closure authority. Non-blocking improvement opportunities become separately scoped local roadmap records rather than holding a viable verified delivery open. No record is pruned, pushed, or released.

## Mandatory stops

- Any public-contract change outside a selected Ready plan.
- Material scope expansion, destructive or irreversible work, or repository-external mutation.
- External coordination, unavailable verification, or a failed required gate.
- Any decision not resolved by the selected records and current user authority.
- Any push or release.

## Run ledger

<!-- ki-batch-run: KI-TOOL-BATCH-003-RUN-001 8937da038cff8cac1c20bec8b52691ef27a525693aeecc98814ffa009b321cf9 -->
