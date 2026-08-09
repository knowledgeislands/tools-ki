---
id: KI-TOOL-CLI-037
area: CLI
title: Track install staging artifacts
theme: cli
horizon: future
status: draft
candidate: true
blocks: []
blocked-by: [KI-TOOL-CLI-010]
baseline-ref: null
---

## Goal

Record ownership of harness install staging directories so KI can report only its own interrupted staging artifacts without inferring intent from filenames.

## Context

CLI-010 defines a schema-one managed-artifact record and its conservative read-only report. Harness installation is the first bounded family: it creates one finite `.install-*` directory under a known harness owner, and the existing repair path already removes an unpromoted extraction after interruption.

## Boundary

Do not implement deletion, change the existing parked-replacement recovery, add ownership records to uninstall, trade, cache, or installer artifacts, or widen cleanup to unrecorded paths.

## Discussion

### Promotion condition

Promote after CLI-010 is accepted and the implementation can select a portable exclusive lock primitive with a CLI contract covering live locks, interruption, foreign paths, symlinks, malformed records, and deterministic reporting.
