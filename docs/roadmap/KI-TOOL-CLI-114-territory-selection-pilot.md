---
id: KI-TOOL-CLI-114
area: CLI
title: Territory selection pilot
kind: deliver
purpose: capability
initiative: knowledge-islands-model
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 72f64238841d790571de63d9f7be57ba23322449
created_at: 2026-10-07T20:17:07Z
updated_at: 2026-10-07T22:03:41Z
---

# Territory selection pilot

## Goal

KI selects registered territory or estate repositories with the agreed short handles and directory-name prefixes, without duplicated Agora governance.

## Context

Kris approved [ADR-KI-ARCADIA-002](https://github.com/knowledgeislands/ki-arcadia-principal/blob/5ad60e7/Admin/Governance/Decisions/ADR-KI-ARCADIA-002-territory-derived-repository-selection.md) and [the owner decisions](https://github.com/knowledgeislands/ki-arcadia-principal/blob/2724f2e/Admin/Governance/Decisions/references/territory-selection-decisions.md) with "all agreed". They authorise the rollout and its push, prune and release, without creating a Project. The harness contract is KI-HARNESS-GOV-156; mgit follows this verified pilot.

## Boundary

No legacy Agora flags, runtime memberships or filter globs; no new named groups, registry package, external writes, trade-policy changes or changes to unrelated work. Preserve existing committed territory/trade flattening. Stored historical identities remain provenance.

## Current state

The integrated local candidate combines the territory-selection pilot with the published v0.8.4 native agent commands and tests. The package remains prepared as 0.9.0. Publication is held because the built-in clean-install harness pin predates this contract; updating its source path and obtaining its exact archive digest require the coordinator's narrow authority addition.

## Steps

- [x] Establish the territory resolver using canonical membership and complete registered identity-to-checkout mapping.
- [x] Add shared -t/--territory, --estate and -f/--filter selectors to supported KI operations, rejecting ignored or conflicting options.
- [x] Expose ki territory roots --null with atomic complete output and migrate opening, observation and discovery consumers.
- [x] Retire executable Agora command grammar, declarations and unused reference-selection machinery, preserving historic state without reading it as membership.
- [x] Prove the pilot and failure boundaries through the public in-process CLI seam, retaining 100% product coverage.
- [x] Update help, completion, manual, inventory, guides, specifications and changelog, and prepare the next pre-1.0 minor release.

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

## Review

### Delivered

The approved KI pilot from baseline `72f64238841d790571de63d9f7be57ba23322449`: territory selection derived from Capital `territory_members`, the Capital-only `territory_prefix` handle with registry-key fallback, shared `-t/--territory`, `--estate` and repeatable literal `-f/--filter` selectors, the atomic `ki territory roots --null` endpoint, and the opening, observation and discovery cut-over. Executable Agora grammar, declarations and reference-selection machinery are retired without aliases; historical local state is untouched. The package is prepared as `0.9.0` but not published, tagged or installed. No mgit, harness, trade-policy, Project or follow-on record changes are included.

### Change Summary

- Territory core: `src/core/territory/` owns declaration parsing, literal filters, resolution, projection and the local target adapters moved from the Agora domain. Trade configuration reuses the shared declaration parser and primitives without making selection depend on trade policy.
- Commands: `src/commands/territory/` provides `list`, `show`, `audit`, `roots`, `open` and `inspect`; repository, registry and trade selection accept the shared scopes and filters. Filters narrow logical directory names before validation, including `--repo` paths and patterns and the native current-repository or mGit default.
- Retired: `src/commands/agora/`, `src/core/agora/` and their fixtures. The unused configuration type re-export was removed so Knip stays clean.
- Fixtures: `src/tests/cli/territory/` covers prefix and key renames, prefix/key handle collisions, key/basename differences, spaces and line feeds, nested roots, selected and excluded unavailable roots, missing registration, malformed declarations, ambiguous identities, zero matches, ignored and conflicting selectors and no partial stdout.
- Documentation: territory specification and guide, updated repository-operations, registry and audit specifications, guides, README, manual, generated command inventory, changelog, ki-self rubric sources and `.ki.toml` components. The Agora specification is retained as deprecated provenance.
- Release preparation: `package.json` and the changelog baseline name `v0.9.0`; the CI governance pin stays on the released `v0.8.3`.
- Approved deviation: none. The Zed fix keeps a filtered-out Capital out of the launched roots.

### Verification

- Focused `bunx vitest run src/tests/cli/territory src/tests/cli/trade`: 72 tests passed.
- `bun run test:coverage`: 63 files and 1,062 tests passed at the enforced 100% statement, branch, function and line threshold.
- `bunx tsc --noEmit`, `bunx @biomejs/biome check .` (no errors; 27 baseline warnings in untouched files), `bunx rumdl check .`, `mandoc -T lint man/ki.1` and `bunx knip`: passed.
- Command inventory regenerated from the manual and reconciled by the inventory contract test.
- `ki repo audit --repo .` with installed `ki` 0.8.3: all 22 skills passed, including ki-self, ki-engineering, ki-authoring, ki-specs, ki-work and ki-work-roadmap. The isolated worktree used a run-local registry copy pointing `tools-ki` at the worktree, because the user registry names the primary checkout.
- Compiled binary reports `0.9.0`; `ki agora` is rejected as an unknown command.

The final combined candidate passed the full coverage suite at all four 100% thresholds, TypeScript, Biome, Knip, Markdown, manual lint, compilation and the whole native audit against the final harness in an isolated registered context. The source agent implementation and its tests are byte-identical to the published prerequisite. Command inventory was regenerated after resolving the root and manual overlap. Initial audit registration/link findings were corrected solely in run-owned state. Dependency freshness remains unknown under the explicit network restriction.

### Outstanding concerns

- The v0.8.4 prerequisite is published immutably, installed and verified; the widened delegation skill matches its published canonical source. GOV-144 functionality and tests remain unchanged.
- Clean installation would acquire a pre-cut-over harness from the built-in pin. The coordinator has requested authority to update `src/core/storage/registry.ts` and download the exact published canonical harness archive for its digest. Neither action is included in the immutable pilot packet or named remote calls.
- Publication, release, immutable installation and downstream proof remain outstanding; no acceptance is inferred.

### Post-change review

The goal is met within the approved boundary: selection follows canonical Capital membership, filters are literal and applied before worktree expansion, and failures are complete and atomic. Regression risk is concentrated in the hard Agora cut-over, which is intentional and covered by public CLI fixtures; native defaults are preserved. Ready for review.

### Mini recap

Delivered the KI territory-selection pilot and prepared `0.9.0`, verified by 100% coverage, static gates and a passing whole-repository audit. No learning promotion is proposed beyond this record.

## Discussion

### Authority

Kris says "push: allowed, prune: allowed, release: allowed" and "all agreed". The coordinator owns publication and review. Keep the delivery at awaiting-review until its evidence is accepted; prune only its own eligible terminal record.
