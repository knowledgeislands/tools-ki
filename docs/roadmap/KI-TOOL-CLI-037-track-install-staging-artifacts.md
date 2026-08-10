---
id: KI-TOOL-CLI-037
area: CLI
title: Track install staging artifacts
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Record ownership of harness install staging directories so KI can report only its own interrupted staging artifacts without inferring intent from filenames.

## Context

CLI-010 defines a schema-one managed-artifact record and its conservative read-only report. Harness installation is the first bounded family: it creates one finite `.install-*` directory under a known harness owner, and the existing repair path already removes an unpromoted extraction after interruption.

## Boundary

Do not implement deletion, change the existing parked-replacement recovery, add ownership records to uninstall, trade, cache, or installer artifacts, or widen cleanup to unrecorded paths.

## Current state

Harness installation creates `.install-*` directories, and existing cleanup and repair commands inspect that known layout conservatively. They do not own an artifact record, and concurrent reporting would need an exclusive portable coordination primitive before it can distinguish a live staging directory from interrupted residue.

## Steps

- [ ] Confirm the completed CLI-010 managed-artifact contract and select a portable exclusive lock primitive with failure and recovery semantics.
- [ ] Define the install-staging artifact record, its owner scope, atomic publication point, and read-only reporting behaviour.
- [ ] Integrate recording and inspection without changing existing repair or cleanup decisions.
- [ ] Exercise live locks, interruption, foreign paths, symlinks, malformed records, and deterministic reporting through CLI contracts.

## Files touched

To be determined after the lock primitive is selected. Expected surfaces are harness installation, managed-artifact state, the reporting command, and their CLI contract tests.

## Verify

- Focused CLI contracts for live locks, interrupted installation, foreign and unsafe paths, malformed records, and deterministic reports.
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check <selected files>`

## Dependencies / blocks

The historical CLI-010 record is no longer present, but its implemented conservative reporting boundary must be re-confirmed. Lock selection remains an explicit design decision; this item stays `draft` until it is made.

## Discussion

### Promotion condition

It is now positioned for planning. Readiness requires confirmation of the existing managed-artifact boundary and a portable exclusive lock primitive with a CLI contract covering live locks, interruption, foreign paths, symlinks, malformed records, and deterministic reporting.
