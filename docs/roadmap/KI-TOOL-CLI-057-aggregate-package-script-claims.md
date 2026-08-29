---
id: KI-TOOL-CLI-057
title: Aggregate package script claims
area: CLI
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 317d0ccaf8f9b013ec2381d88fc69f4c92f3d0b9
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

- [x] Extend the validated imported-catalogue representation with duplicate-free exact `packageScripts` claims from resolved skills only.
- [x] Aggregate claims deterministically with canonical skill identity and reject duplicate ownership before an engineering audit runs.
- [x] Expose the immutable inventory through the existing repository-operation capability boundary rather than through command-global state or filesystem scanning.
- [x] Let `ki-engineering` consume the inventory while preserving the host's separation from owner-specific command judgment.
- [x] Add CLI-driven fixtures for one claim, several owners, duplicate claims, absent claims, unresolved skills, and deterministic ordering.
- [x] Add exclusion-path fixtures proving the host does not reinterpret exact repository-owned exclusions as claims.
- [x] Run the full 100% coverage, type, format, package, and repository-operation gates.

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

## Implementation outcome

The imported catalogue contract now accepts an optional duplicate-free `packageScripts` array containing exact `ki:` keys. Repository resolution retains both the execution selection and the complete declared resolved-skill inventory, so `--skill ki-engineering` receives claims from every resolved owner without executing every rubric.

Before evidence gathering or conform execution, the host loads the resolved catalogues, sorts claims by script and canonical skill identity, and rejects a duplicate with both canonical owners in the error. It passes the resulting read-only `packageScriptClaims` array through `RubricContextOptions`; owner-specific command judgment remains inside the consuming skill.

CLI fixtures prove a filtered audit receives several owners and absent-claim catalogues in deterministic order, an installed but undeclared skill never enters the inventory, `script_exclusions` never become claims, malformed source metadata fails validation, and duplicate ownership fails before an audit item runs. No Website policy, estate migration, arbitrary skill scan, or prefix inference was added.

## Documentation impact

### Decision Records

No new Decision Record is required; `GOV-028` and `KI-HARNESS-GOV-007` already establish the ownership and host boundaries.

### Specifications

Update repository-operation specifications only if the observable audit input or failure contract requires a new normative statement.

### Guides

No user guide change is expected because aggregation is an internal host capability surfaced through existing audits.

### Roadmap

Return the verified host evidence to `KI-HARNESS-GOV-007`; estate migrations remain independently scheduled.

## Review

### Delivered

Against immutable baseline `317d0ccaf8f9b013ec2381d88fc69f4c92f3d0b9`, implemented the resolved-catalogue package-script inventory and exposed it to repository rubric sessions for audit, conform, and re-audit. The implementation preserves filtered rubric execution while aggregating claims from the complete declared resolved set.

### Summary of changes

The catalogue loader validates exact, duplicate-free `packageScripts`; the runtime defines canonical `{ script, skill }` claims, deterministic ordering, and duplicate rejection; repository selection carries the full resolved inventory beside the execution subset; and repository progress loads that inventory before any audit or conform item runs. CLI fixtures cover valid, absent, malformed, duplicate, unselected, and exclusion evidence.

### Verification

`bun run test:coverage` passed all 696 tests with 100% statements, branches, functions, and lines. `bunx tsc --noEmit`, `bunx biome check`, and `bun run build` passed. Both the freshly built `./dist/ki` and installed `ki` passed `repo audit --skill ki-engineering --repo .`.

### Outstanding concerns

Biome reports the pre-existing informational schema-URL drift (`2.5.7` in `biome.json` versus CLI `2.5.10`); it does not fail formatting or this delivery. The Harness must now replace its temporary hard-coded script-owner map with this inventory under `KI-HARNESS-GOV-007`. Website and estate migrations remain separately owned.

### Post-change review

The host neither interprets package commands nor trusts repository configuration as ownership. Canonical identities remain attached to claims, duplicate errors are deterministic, unresolved or undeclared providers cannot contribute inventory, filtered audits still see every resolved declaration, and progress cleanup remains correct when catalogue loading fails. No compatibility path or command-global state was introduced.

### Mini recap

`KI-TOOL-CLI-057` is ready to close under `KI-TOOL-BATCH-002`: the receiver dependency for `KI-HARNESS-GOV-007` is delivered, fully covered, locally built, and audited. Closure recheck must confirm the six-part packet, exact batch grant, green gates, and absence of push, release, prune, or sibling-repository write.

## Discussion

The host proves which resolved skill claimed a key; it does not decide whether the command is semantically appropriate. That judgment remains with the claiming skill, while `ki-engineering` owns only coverage, uniqueness, and exact exclusion validity.
