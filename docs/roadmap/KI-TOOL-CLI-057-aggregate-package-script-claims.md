---
id: KI-TOOL-CLI-057
title: Aggregate package script claims
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Expose the exact package-script claims declared by resolved Harness skill catalogues so repository engineering audits can enforce complete and unique ownership without scanning arbitrary skill files.

## Context

`KI-HARNESS-GOV-007` has implemented the source-side `packageScripts` catalogue metadata and approved the host boundary. The `ki` executable already resolves and imports declared skill catalogues, but it does not aggregate their package-script claims or expose them to `ki-engineering`.

The user has authorised direct receiver-owned roadmap capture instead of an intermediate trade. This record owns only host aggregation and its observable audit contract; Harness skills retain ownership of the claims and their semantic checks.

## Boundary

Do not infer ownership from script prefixes, let repository configuration assign owners, scan unresolved or arbitrary skill paths, or retain a hard-coded owner-family map. Do not implement Website-specific script policy here. Exact repository exclusions remain data consumed by `ki-engineering`, not ownership declarations created by the host.

## Current state

The resolved-rubric host imports static catalogue definitions for repository operations. No current `tools-ki` source reads `packageScripts`, validates duplicate claims across resolved skills, or supplies a read-only claim inventory to the engineering rubric.

## Steps

- [ ] Extend the validated imported-catalogue representation with duplicate-free exact `packageScripts` claims from resolved skills only.
- [ ] Aggregate claims deterministically with canonical skill identity and reject duplicate ownership before an engineering audit runs.
- [ ] Expose the immutable inventory through the existing repository-operation capability boundary rather than through command-global state or filesystem scanning.
- [ ] Let `ki-engineering` consume the inventory while preserving the host's separation from owner-specific command judgment.
- [ ] Add CLI-driven fixtures for one claim, several owners, duplicate claims, absent claims, unresolved skills, and deterministic ordering.
- [ ] Add exclusion-path fixtures proving the host does not reinterpret exact repository-owned exclusions as claims.
- [ ] Run the full 100% coverage, type, format, package, and repository-operation gates.

## Files touched

- Resolved Harness catalogue and repository-operation core modules under `src/core/`
- The injected repository audit capability and its command adapter
- CLI contract fixtures under `src/tests/cli/`
- `docs/roadmap/KI-TOOL-CLI-057-aggregate-package-script-claims.md`

## Verify

- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bun run build`
- `ki repo audit --skill ki-engineering --repo .`
- A CLI fixture proves duplicate claims fail deterministically and unresolved skills never enter the inventory.

## Dependencies / blocks

The Harness source-side metadata contract already exists in commit `0e11c4a`. No local dependency blocks implementation. Website manifest policy and estate migrations remain independent receiver-owned work.

## Documentation impact

### Decision Records

No new Decision Record is required; `GOV-028` and `KI-HARNESS-GOV-007` already establish the ownership and host boundaries.

### Specifications

Update repository-operation specifications only if the observable audit input or failure contract requires a new normative statement.

### Guides

No user guide change is expected because aggregation is an internal host capability surfaced through existing audits.

### Roadmap

Return the verified host evidence to `KI-HARNESS-GOV-007`; estate migrations remain independently scheduled.

## Discussion

The host proves which resolved skill claimed a key; it does not decide whether the command is semantically appropriate. That judgment remains with the claiming skill, while `ki-engineering` owns only coverage, uniqueness, and exact exclusion validity.
