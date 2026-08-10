---
id: KI-TOOL-CLI-037
area: CLI
title: Track install staging artifacts
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: e4dc56fb0c421d3c8d485f304dd248d1bb76158f
---

## Goal

Record ownership of harness install staging directories so KI can report only its own interrupted staging artifacts without inferring intent from filenames.

## Context

CLI-010 defines a schema-one managed-artifact record and its conservative read-only report. Harness installation is the first bounded family: it creates one finite `.install-*` directory under a known harness owner, and the existing repair path already removes an unpromoted extraction after interruption.

## Boundary

Do not implement deletion, change the existing parked-replacement recovery, add ownership records to uninstall, trade, cache, or installer artifacts, or widen cleanup to unrecorded paths.

## Current state

Harness installation creates `.install-*` directories, and existing cleanup and repair commands inspect that known layout conservatively. They do not own an artifact record. The recovered CLI-010 design supplies the schema-one record and refusal model; this item selects the missing portable lock mechanism.

## Steps

- [x] Create schema-one manifest records at `$XDG_STATE_HOME/ki/managed-artifacts/<uuid>.toml` for the finite harness-install `.install-*` family only. A record names its operation, lifecycle state, exact absolute staging path, and lock path.
- [x] Acquire a per-record `mkdir` lock directory before atomically publishing the `creating` manifest and before creating the staging directory. Atomically replace the manifest as the installation advances; remove it only after the successful artifact cleanup.
- [x] Have `ki manage cleanup` acquire each lock non-blockingly before reasoning about its manifest. An existing, unsafe, malformed, or otherwise unverifiable lock is a `live` refusal; it is never broken automatically.
- [x] Treat a lock-free `creating` or `recoverable` record as interrupted-recoverable and retain `ki manage repair` as its recovery owner. Do not add a delete command or change its existing recovery decisions.
- [x] Scan only managed-artifact manifests in lexical identifier order for the new report. Refuse foreign paths, symlinks, malformed or future-versioned records, and paths outside the approved harness-install roots.
- [x] Exercise live locks, interruption, lock-free recovery records, foreign paths, symlinks, malformed records, and deterministic reporting through CLI contracts.

## Files touched

Expected surfaces are `src/core/registry.ts`, a focused managed-artifact state module, `src/commands/manage/cleanup.ts`, existing repair integration, and their CLI contract tests.

## Verify

- Focused CLI contracts for atomic manifest lifecycle, live and unsafe locks, interrupted installation, lock-free recovery records, foreign and unsafe paths, malformed records, and deterministic reports.
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

The historical CLI-010 record was recovered from commit `359b0d1`; its schema-one ownership and conservative report boundary are confirmed. The user approved `mkdir` locking with no automatic stale-lock break on 10 August 2026.

## Delegation

- One worker may implement the managed-artifact schema, atomic manifest publication, and installation integration.
- A second worker may add the read-only cleanup reporting and CLI contract coverage after the schema is settled; it must not edit the producer module concurrently.
- The orchestrator integrates the repair boundary, runs the complete verification gate, and reviews every CLI contract.

## Review

### Delivered

Harness-install staging now has schema-one ownership manifests, portable `mkdir` locks, conservative cleanup reporting, and lock-aware repair.

### Summary of changes

Added atomic manifest lifecycle handling, refusal-only cleanup states, physical-path validation, legacy-report preservation, and repair reconciliation for lock-free recoverable records.

### Verification

104 focused harness, cleanup, repair, and local-command CLI contracts passed; `bunx tsc --noEmit`, `bun run test:coverage`, and Biome passed.

### Outstanding concerns

No delete command or automatic stale-lock break was introduced. Other artifact families remain excluded.

### Post-change review

Sol found lifecycle ordering, lock-bypass repair, unsafe lock-directory, and symlink-refusal gaps. Each now has a CLI contract and conservative refusal or recovery behaviour.

### Mini recap

Persisted ownership is useful only when its lifecycle, locks, recovery, and path checks form one safety boundary.

## Discussion

### Lock and recovery model

`mkdir` is the exclusive portable lock primitive: directory creation is atomic and available through Node without a platform-specific advisory-lock dependency. Cleanup readers attempt to acquire it without waiting. A pre-existing, unsafe, malformed, or otherwise unverifiable lock remains a `live` refusal; no timestamp, process identifier, or heuristic establishes that it is safe to break.

An interrupted producer may leave a lock-free `creating` or `recoverable` manifest. That is reported as interrupted-recoverable and remains the existing `ki manage repair` owner's decision. This item introduces no deletion authority and does not infer ownership from names for its manifest-backed report.

### Promotion condition

The schema-one record and conservative report boundary are confirmed, and the user approved `mkdir` locking with refusal-only stale-lock handling. This item is ready for implementation.
