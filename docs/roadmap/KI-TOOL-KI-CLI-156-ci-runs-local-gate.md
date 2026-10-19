---
id: KI-TOOL-KI-CLI-156
area: CLI
title: CI runs local gate
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T08:04:00Z
updated_at: 2026-10-19T20:52:45Z
---

# KI-TOOL-KI-CLI-156: CI Runs Local Gate

## Goal

Every push and pull request to tools-ki runs the same gate a contributor runs locally, so that a Biome, type or test failure stops CI on the commit that introduces it rather than building up until a release. `biome check .` runs first, then `tsc` and `bun run test`.

## Context

Biome drift built up across the repository until [KI-TOOL-KI-CLI-153](KI-TOOL-KI-CLI-153-biome-schema-drift.md) cleared 41 findings and moved `biome.json` to the 2.5.15 schema. Only lint-staged runs Biome, and only on staged files, so a schema change or a finding in an unstaged file went unseen.

`.github/workflows/ci.yml` runs `ki repo audit --repo .` and `bun run ki:tools:lint-man`. The suite runs in CI only in `release.yml`, at release time.

Kris chose BIOME-CI a) on 2026-10-19, in the ways-of-working thread: capture one record that makes CI run the local gate, with `biome check .` first and `bun run test` and `tsc` in the same record.

Intended priority `medium` and size `s`. The installed `ki` rejects `priority` and `size` on a roadmap record until [KI-TOOL-KI-CLI-155](KI-TOOL-KI-CLI-155-priority-and-size-fields.md) ships, so under the harness migration tolerance they stay out of the front matter until then.

## Boundary

This record changes `.github/workflows/ci.yml` only, with any test that guards its shape. It does not change `release.yml`, the lint-staged or Husky hooks, the Biome configuration or the ki-engineering standard and checker.

## Discussion

### The audit already claims these checks

The ki-engineering standard's Minimal CI rule says CI does not repeat a check the audit runs. The audit runs Biome (BIO-1, at FAIL), TypeScript and, under a root `vitest.config.*`, `bun run test:coverage`. Rubric item CI-2 warns when `ci.yml` repeats the test run. Read literally, CI's audit step should already have failed on the drift.

Planning should first find out why it did not, for example the pinned `KI_VERSION`, the harness the CI audit resolves, or a red CI nobody watched. Two routes follow:

- Add explicit `biome check .`, `tsc` and `bun run test` steps before the audit, as Kris chose. CI then fails fast with readable output, but repeats the audit's checks, and CI-2 warns.
- Make the audit's existing gate effective in CI and leave `ci.yml` without repeated steps. This keeps CI-2 clean but may need a harness or pin change outside this record.

If the explicit steps win, the standard needs an exception or a change in ki-agentic-harness, which this record would hand off rather than make.

### Route chosen

On 2026-10-19 Kris answered the tools-burndown summary with "All recommended", which took BIOME-CI-STANDARD a): keep this record, and have planning check the latest CI runs first. If the audit gate turns out to be broken, fix it rather than repeat its checks in `ci.yml`. The explicit-steps route above therefore applies only if the audit gate proves sound and still let the drift through.
