---
id: KI-TOOL-VENDOR-001
title: Enforce Harness prefix ownership
area: VENDOR
theme: cross-repository-vendoring
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Keep capability ownership obvious by allowing only one installed Harness to own a declared capability prefix. A repository should name `ki-*` or `hnr-*` skills directly because the local estate already determines their sole provider; users should not need qualified capability selectors or a second provenance model.

## Context

`tools-ki` already installs immutable Harness releases with verified archive digests and records each Harness by owner/repository identity. CLI-050 made the existing singular local-development override work for any installed Harness.

Repository skill resolution still permits two declared Harnesses to publish the same skill name and introduces `[skills."<harness-id>:<skill-name>"]` to disambiguate them. That solves a configuration state which the intended operating model does not support: competing Harnesses in the same namespace are alternatives, not collaborators.

The source Harness already declares `[skills.ki-repo-harness]` in `.ki-config.toml`. That owning skill is the natural place for an explicit provider-authored `prefix` value and for the rubric that checks it.

## Boundary

Define `[skills.ki-repo-harness].prefix` as the explicit capability namespace for a compatible Harness. Require every published skill name to begin with `<prefix>-`, reject an installed estate containing two Harnesses with the same prefix, and resolve repository skills by their bare names.

Update the canonical KI Harness source and `ki-repo-harness` standard and rubric under the user's explicit cross-repository authorization. Exercise a second `hnr` Harness through `tools-ki` fixtures without changing the HNR repository.

Do not add release receipts, dependency provenance, qualified capability identities, concurrent local overrides, remote discovery, signatures, or a new metadata file.

## Current state

- Compatible Harness inspection derives skill capabilities but does not read a Harness prefix from `.ki-config.toml`.
- Installation and discovery allow different Harness identities to expose the same capability namespace.
- Repository declarations accept both bare and Harness-qualified skill table names.
- `ki-repo-harness` checks for a keyless marker but does not require or validate a prefix.

## Steps

- [ ] Extend the `ki-repo-harness` standard, structured rubric, generated publication, exemplars, and canonical declaration with a required valid `prefix` and a mechanical check that published skill names use it.
- [ ] Parse and expose the declared prefix during compatible Harness inspection, refusing missing, malformed, unsafe, or capability-inconsistent declarations.
- [ ] Reject acquisition, replacement, local-development activation, and installed-estate discovery when two different Harness identities claim the same prefix, without disturbing an existing valid installation.
- [ ] Remove Harness-qualified repository skill declarations and resolution; bare skill names resolve uniquely across the prefix-safe declared estate.
- [ ] Update CLI fixtures and boundary tests for canonical `ki`, external `hnr`, malformed metadata, capability-prefix mismatch, collision refusal, safe replacement, and direct repository resolution.
- [ ] Update the Harness lifecycle specification, architecture decision, README, manual, and relevant developer guidance to explain the prefix authority and its practical goal.

## Files touched

- `src/core/harness/`, `src/core/storage/`, `src/core/configuration/`, and their command-facing callers.
- CLI sandbox helpers and Harness, repository, management, bootstrap, and development tests.
- `docs/specs/harnesses.md`, ADR-KI-TOOLS-002, README, manual, and local-development guidance where affected.
- In `ki-agentic-harness`: `.ki-config.toml` and `skills/repo-structure/ki-repo-harness/` standard, rubric catalogue, tests, generated publication, and exemplars.

## Verify

- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bunx knip`
- `ki repo audit --skill ki-work-roadmap --repo .`
- In `ki-agentic-harness`, run the focused `ki-repo-harness` rubric tests, regenerate its rubric, and run its declared repository gates.

## Dependencies / blocks

CLI-050 is complete. This item has no remaining dependency and does not require an HNR repository change to prove the generic contract.

## Documentation impact

### Decision Records

Revise ADR-KI-TOOLS-002 to replace qualified capability disambiguation with explicit prefix ownership and estate-level collision refusal.

### Specifications

Add behaviour-level requirements for prefix metadata, prefix-consistent capabilities, unique installed prefixes, and bare-name resolution.

### Guides

Explain how Harness authors select a stable prefix and how a prefix collision is resolved by choosing one competing Harness.

### Roadmap

Replace the earlier provenance-heavy intent with the explicit goal and bounded prefix contract above; no follow-on provenance item is implied.

## Discussion

The immutable archive URL and SHA-256 already provide reproducible installation evidence. Prefix ownership addresses a different problem: it prevents an incoherent local estate from creating ambiguous capability providers. Keeping those concerns separate avoids making ordinary repository declarations carry provider-resolution machinery they do not need.
