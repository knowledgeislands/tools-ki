---
id: KI-TOOL-CLI-079
area: CLI
title: Restore machine-readable contracts
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: 48a45861f153816efba5dbc66fda088fa99364cf
created_at: 2026-09-21T16:23:59Z
updated_at: 2026-09-24T23:41:21Z
---

## Goal

Publish versioned, path-free JSON projections of governed work items and registered repositories, so that a consumer can depend on roadmap and registry evidence without parsing output shaped for a terminal reader.

## Context

JSON output existed previously and was removed because nothing consumed it. That was the right call at the time; carrying an unconsumed public surface is a maintenance cost with no beneficiary.

A consumer now exists. `apps-observatory` renders Knowledge Islands evidence in a local web application and has established the pattern with `ki/trade-routes/v1`: a versioned payload carrying validated facts without filesystem paths or presentation decisions. Its roadmap instrument needs the same treatment for work items, and its scope selection benefits from it for the registry.

The data is already computed. `ki repo roadmap list --aggregate --agora ki-all` resolves one hundred and seven work items across twenty-two repositories with horizon, status, and identity, and `ki registry list` resolves thirty-eight registered roots. Both currently exist only as text: the roadmap as a decorated tree with badge icons, the registry as bare newline-separated absolute paths.

## Boundary

This item does not change roadmap semantics, horizon or status vocabulary, dependency rules, selection behaviour, or the registry's contents. It does not alter existing human-readable output, remove any current grammar, or add a mutation surface. It publishes a projection of facts this CLI already resolves.

## Current state

`ki repo roadmap list` accepts `--aggregate`, `--horizon`, `--status`, and `--no-icons`, and renders a decorated tree. `ki registry list` renders newline-separated absolute paths. Neither accepts `--format`. `ki trade routes list` is the only command publishing a versioned machine contract.

## Steps

- [x] Define `ki/roadmap/v1` covering item identity, repository identity, area, theme, title, horizon, status, dependency arrays, and timestamps, carrying no filesystem path and no presentation state.
- [x] Decide and document how a consumer links to a canonical record without receiving a local path, following the precedent `ki/trade-routes/v1` set.
- [x] Add `--format json` to `ki repo roadmap list`, honouring existing selection and filter options including `--aggregate`.
- [x] Define `ki/registry/v1` covering registered repository identity and declared metadata, and add `--format json` to `ki registry list`.
- [x] Emit the schema identity in every payload so a consumer can reject an unrecognised version rather than guess.
- [x] Cover both contracts with tests over empty, single-repository, and multi-repository selections, including repositories with no roadmap and unresolved dependencies.
- [x] Document both contracts as stable integration surfaces in the manual and changelog.

## Files touched

The roadmap and registry command modules, their formatting and contract layers, contract schema definitions, CLI tests, completion tests where grammar changes, and the manual, help, and changelog.

## Verify

Run the repository's declared test, type-check, build, and lint gates, plus `ki repo audit --repo .`. Confirm both contracts validate against their schemas across empty, single, and multi-repository selections, that no payload contains a filesystem path, that existing human-readable output is unchanged, and that the emitted schema identity is present and checked.

## Dependencies / blocks

No blocker. The consuming work is [KI-OBS-VIS-003](../../../apps-observatory/docs/roadmap/KI-OBS-VIS-003-build-roadmap-instrument.md) in `apps-observatory`, which cannot reach Ready until this contract is specified. Both repositories remain independently reviewed and committed, and neither commit implies authority over the other.

## Documentation impact

### Decision Records

None expected. The versioned-contract pattern is already established by the trade-route projection.

### Specifications

Specify `ki/roadmap/v1` and `ki/registry/v1` and their privacy boundaries, particularly the exclusion of filesystem paths, before treating either as stable.

### Guides

Note both contracts wherever machine consumption of `ki` output is documented.

### Roadmap

Further machine projections should be captured individually as consumers appear, rather than adding `--format json` everywhere speculatively.

## Review

### Delivered

Versioned, path-free roadmap and registry JSON projections with stable canonical identities and record URLs.

### Change Summary

Added typed report builders, CLI format selection, declared repository metadata projection, specifications, manual entries, guide coverage, and focused tests.

### Verification

Focused roadmap, registry, completion, and inventory tests pass; TypeScript compilation passes.

### Outstanding concerns

None.

### Post-change review

Both JSON payloads carry explicit schema identities and omit local paths and renderer state.

### Mini recap

Integrations can consume roadmap and registry state without scraping text or inheriting machine-local topology.

## Done

Accepted on 2026-09-25 under the approval-bound `KI-TOOL-BATCH-001` outcome authority after review of the delivery packet and verification evidence. The completed record is retained pending separate pruning authority.

## Discussion

### Why restore it now

The original removal was correct: an unconsumed public surface is a liability. What changed is not the principle but the fact — there is a consumer, and it is a consumer that must not parse decorated text. Restoring the surface with a declared consumer and a versioned schema is a different proposition from carrying one speculatively.

### Paths are the privacy boundary

The trade-route contract deliberately omits filesystem paths, because local layout is private to the machine and irrelevant to meaning. The roadmap and registry contracts should hold the same line, which makes linking to a canonical record a deliberate design question rather than an incidental field.

### Why a schema identity

A consumer that cannot tell which version it received will eventually render stale assumptions as current facts. Emitting the identity lets a consumer refuse rather than guess, which is the behaviour `apps-observatory` already implements for trade routes.
