---
id: KI-TOOL-CLI-076
area: CLI
title: Standardise installer version pinning
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-17T21:05:39Z
updated_at: 2026-09-18T03:04:16Z
---

# KI-TOOL-CLI-076: Standardise installer version pinning

## Goal

Agree one interface by which any Knowledge Islands installer is told to install an exact version, so a caller can pin deliberately and the website can advertise a pinned invocation.

## Context

Every released Knowledge Islands tool already accepts an explicit version. None of them agree on how.

- **`ki`** — positional `vX.Y.Z`.
- **`git-almanac`** — positional `vX.Y.Z`, or `GIT_ALMANAC_VERSION`.
- **`mgit`** — `MGIT_VERSION` only.
- **`rig`** — `RIG_VERSION` only.

All four default to resolving the repository's latest release at run time when no version is given.

`ki-website` now publishes `/install/<tool>` for each of these. The endpoint redirects to an installer served from an immutable release tag, so the _script_ a caller receives is fixed — but what that script installs is still whatever is latest at the moment it runs. The website advertises a version it cannot actually guarantee.

A uniform interface would close that gap without moving any authority: the website could document `curl -fsSL https://knowledgeislands.info/install/<tool> | sh -s <version>` as the pinned form, and reproducible environments could pin the same way.

## Boundary

This is an interface agreement across the four tool repositories. It does not change what any installer verifies, where artifacts live, or who may publish a release.

Do not remove the latest-release default. An unpinned `curl | sh` should keep working; pinning is the explicit opt-in.

Do not make the website compute or choose a version. It only documents the invocation.

## Current state

`install.sh` already implements the proposed positional `vX.Y.Z` contract, rejects malformed or extra arguments before provider or filesystem work, retains the unpinned latest-release default, and has installer contract tests. README and the release guide already show exact positional installation. What is missing is a durable decision that makes this the shared interface and explicit release-handoff wording that the website and reciprocal tool items can follow.

## Steps

- [ ] Record the positional `vX.Y.Z` form as the canonical cross-tool installer pinning decision, with existing `<TOOL>_VERSION` variables retained as compatibility aliases where they already exist.
- [ ] Add the decision to the repository Decision Records index and link its practical consequence from the release guide without duplicating rationale there.
- [ ] Verify `tools-ki` already conforms through its installer help, exact-version parsing, malformed-input rejection, README example, and installer tests; change product code only if that evidence exposes a gap.
- [ ] State the exact pinned website invocation in the release handoff and preserve the unpinned latest-release form as the default convenience path.
- [ ] Run the Decision Record, guide, authoring, installer, and complete repository gates.

## Files touched

Expected scope is a new `PDR-KI-TOOLS-001` under `docs/decisions/`, `docs/decisions/README.md`, `README.md`, `docs/guides/developer/release-management.md`, any installer test changed only by an evidenced gap, and this work record.

## Verify

Run `bunx vitest run src/tests/install/install.test.ts`, `ki repo audit --skill ki-decision-records --repo .`, `ki repo audit --skill ki-guides --repo .`, `ki repo audit --skill ki-authoring --repo .`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run build`, `ki repo audit --repo .`, and `git diff --check`.

## Dependencies / blocks

None. The reciprocal `tools-mgit`, `tools-git-almanac`, and `tools-rig` records already point to this item and remain independently executable in their owning repositories. This delivery records the decision and proves local conformance; it does not write those sibling repositories.

## Documentation impact

### Decision Records

Create `PDR-KI-TOOLS-001` to own the canonical positional pinning interface, compatibility-alias rule, and unpinned default.

### Specifications

No new local Specification is required because `install.sh` already exposes and tests the accepted behaviour; the new Decision Record explains the shared cross-tool choice.

### Guides

Update the developer release guide with the canonical pinned invocation and website handoff evidence.

### Roadmap

Retain reciprocal repository items as their local implementation owners. Do not create a duplicate local follow-up unless verification finds a `tools-ki` contract gap.

## Discussion

### Proposed interface

Adopt a positional `vX.Y.Z` argument because `ki` and `git-almanac` already implement it and it survives a `curl | sh -s` pipe more legibly than an environment variable. Repositories with an existing `<TOOL>_VERSION` variable keep it as an accepted alias rather than breaking callers. Positional input takes precedence when both are present, matching the existing `git-almanac` shape.

### Coordination

This is the lead item. Reciprocal items exist in `tools-mgit`, `tools-git-almanac` and `tools-rig`, each covering that repository's adoption alongside its website registry handoff. None of them blocks the others; the website work that depends on the outcome is tracked in `ki-website` and is deliberately not a blocker here.

### Related

Originating repository and item: `knowledgeislands/ki-website` `KI-WEB-SITE-007`, which recorded this as an outstanding concern at delivery. The route contract is documented at `docs/guides/tool-routes.md` in that repository.
