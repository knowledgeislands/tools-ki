---
id: KI-TOOL-CLI-114
area: CLI
title: Territory selection pilot
kind: deliver
purpose: capability
initiative: knowledge-islands-model
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 72f64238841d790571de63d9f7be57ba23322449
created_at: 2026-10-07T20:17:07Z
updated_at: 2026-10-07T21:03:00Z
---

# Territory selection pilot

## Goal

KI selects registered territory or estate repositories with the agreed short handles and directory-name prefixes, without duplicated Agora governance.

## Context

Kris approved [ADR-KI-ARCADIA-002](https://github.com/knowledgeislands/ki-arcadia-principal/blob/5ad60e7/Admin/Governance/Decisions/ADR-KI-ARCADIA-002-territory-derived-repository-selection.md) and [the owner decisions](https://github.com/knowledgeislands/ki-arcadia-principal/blob/2724f2e/Admin/Governance/Decisions/references/territory-selection-decisions.md) with "all agreed". They authorise the rollout and its push, prune and release, without creating a Project. The harness contract is KI-HARNESS-GOV-156; mgit follows this verified pilot.

## Boundary

No legacy Agora flags, runtime memberships or filter globs; no new named groups, registry package, external writes, trade-policy changes or changes to unrelated work. Preserve existing committed territory/trade flattening. Stored historical identities remain provenance.

## Current state

KI uses Agora selection and qualified Capital registry keys; the new contract derives membership from territory_members and allows a Capital-only territory_prefix. Opening and observed projections still depend on the Agora domain. Existing default repository and mgit workspace selection must remain intact.

## Steps

- [x] Establish the territory resolver using canonical membership and complete registered identity-to-checkout mapping.
- [x] Add shared -t/--territory, --estate and -f/--filter selectors to supported KI operations, rejecting ignored or conflicting options.
- [x] Expose ki territory roots --null with atomic complete output and migrate opening, observation and discovery consumers.
- [x] Retire executable Agora command grammar, declarations and unused reference-selection machinery, preserving historic state without reading it as membership.
- [x] Prove the pilot and failure boundaries through the public in-process CLI seam, retaining 100% product coverage.
- [ ] Update help, completion, manual, inventory, guides, specifications and changelog, and prepare the next pre-1.0 minor release.

## Files touched

KI command selection, root grammar and territory family; core territory declarations/resolution, reusable local targets/projection, work registry lookup and repository selection; current Agora sources being retired; affected CLI fixtures/tests; documentation/manual and generated command inventory; package version and this record. Do not edit unrelated workflow or dependency configuration.

## Verify

Run focused CLI tests while iterating, then bun run test:coverage, bunx tsc --noEmit and bunx biome check sequentially. Verify CLI/manual inventory, mandoc lint and relevant ki-self/governance audits. Fixtures deliberately separate Capital registry key, territory prefix, repository registry key and directory name; cover spaces/newlines, nested roots, repeated/case-sensitive/literal/empty prefixes, selected and excluded unavailable roots, missing registrations, duplicates, invalid declarations, zero matches, conflicting scopes, exactly-one/rejected operation selectors and atomic stdout failure. No live network in tests.

## Dependencies / blocks

Begin the pilot after the coordinator verifies the shared contract checkpoint. Preserve the approved order: KI pilot, mgit caller and saved-location pilot, then real read-only Arcadia reconciliation and declaration retirement. The mgit endpoint is ki territory roots --null --territory HANDLE, or --estate, with repeatable --filter PREFIX arguments.

## Delegation

### Locked decisions

- Optional territory_prefix belongs only to the Capital's ki-repo table. When present it is the territory handle; when absent use the Capital's registry key. KI's handle is ki; Paperclip remains KIS.
- Prefix matching uses logical repository directory basenames, case-sensitive literal non-empty alternatives, before worktree expansion. Native defaults are retained.
- Validate scope/naming metadata, filter, then validate selected roots; complete output or failure, never a successful partial selection.
- No legacy Agora alias, glob option or automatic reinterpretation; no trade-policy changes.

### Escalate

- A required caller or parser contract cannot preserve the approved semantics, or baseline foreign changes overlap this lane.
- A required verification gate fails for an unrelated pre-existing reason; do not repair unrelated work speculatively.

### Worker: ki-pilot

- **Deliverable:** Verified KI territory-selection pilot and current consumer cut-over.
- **Inputs:** Accepted Arcadia ADR and decisions; the committed design brief/reviews/report; shared harness contract checkpoint; current KI architecture and test standards.
- **Scope:** Only the KI files listed above in the primary checkout; keep a touched-path set.
- **Authority:** Implement and verify the approved local change. Do not publish, release, prune, accept or commit without the coordinator's serialized Git write window.
- **Isolation:** Exclusive file ownership within tools-ki; no other repository writes. Preserve all unrelated working-tree state.
- **Verify:** Required focused tests, 100% coverage, TypeScript, Biome, manual/inventory and governance gates.
- **Return:** Concise outcome, exact touched paths, verified commands/outcomes and any unresolved concerns.
- **Checkpoint:** Return after the verified pilot, before mgit delivery and release publication.

## Documentation impact

### Decision Records

Cite the canonical Arcadia decision; no duplicate KI decision is needed.

### Specifications

Rewrite KI's executable selection, territory and registry contracts for the hard cut-over.

### Guides

Replace current Agora examples with territory and estate examples and explain literal-prefix filters and failure boundaries.

### Roadmap

Use this one bounded KI record; no speculative follow-on records or new Project.

## Discussion

### Authority

Kris says "push: allowed, prune: allowed, release: allowed" and "all agreed". The coordinator owns publication and review. Keep the delivery at awaiting-review until its evidence is accepted; prune only its own eligible terminal record.
