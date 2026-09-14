---
id: KI-TOOL-CLI-065
title: Review estate audit
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Resolve the current estate-audit failure by restoring evidence-backed specification conformance metadata.

## Context

The original 2026-09-04 record did not identify its criterion. The 2026-09-14 audit at `dd949e2eb01b440cd2b8590aa36c2d85196237df` reports 97 CONFORMANCE-1 failures across 12 specification files, all missing `_Conformance:_` lines; the other 17 declared skills pass. This is current evidence, not an attribution of the historical finding. The user authorised this repair before CLI-066.

## Boundary

Repair the specification corpus and its reader guidance against existing implementation and CLI test evidence. Do not invent conformance, change product behaviour, or suppress a failed criterion. Existing delivery acceptance and CLI-066 remain separately scoped records.

## Shaping

Restore the accepted conformance, verification, and current-evidence contract. Update the index so accepted pending or divergent requirements are distinguished from unaccepted candidates.

## Current state

All 97 requirements have verification references to existing CLI test files, but no declared conformance state. The index still describes the older verification-only shape. The working tree was clean at inspection.

## Steps

- [ ] Check the existing verification references and run the contract suite with coverage.
- [ ] Add truthful conformance and current evidence to every accepted requirement and align the index guidance.
- [ ] Run specification, authoring, and roadmap audits and retain review evidence.

## Files touched

- `docs/specs/*.md`
- This record

## Verify

- `bun run test:coverage --reporter=dot`
- `ki repo audit --skill ki-specs --repo .`
- `ki repo audit --skill ki-authoring --repo .`
- `ki repo audit --skill ki-work-roadmap --repo .`

## Dependencies / blocks

No external dependency. The user approved the known metadata repair as the prerequisite for CLI-066's clean implementation preflight.

## Delegation

One local lane; the evidence check and metadata edits form one coherent unit.

## Documentation impact

### Decision Records

No new decision is needed; restore the accepted specification governance contract.

### Specifications

Add conformance and current evidence throughout the corpus and align index guidance.

### Guides

No operating procedure changes; the corpus index explains how to read the metadata.

### Roadmap

Retain this record's review evidence and unblock the clean preflight for CLI-066.

## Discussion

The user approved this repair and autonomous delivery to awaiting-review on 2026-09-14. The intentional pre-V1 release-marker note is not the current failure: the current ki-repo-tools audit passes. Preserve the standing release policy without fabricating a release.
