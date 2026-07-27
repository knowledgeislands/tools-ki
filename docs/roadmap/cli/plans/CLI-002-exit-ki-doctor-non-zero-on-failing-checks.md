---
id: 'CLI-002'
title: Exit ki doctor non-zero on failing checks
status: ready
roadmap: cli/exit-ki-doctor-non-zero-on-failing-checks
blocks: —
blocked-by: —
baseline-ref: —
---

## Context

`ki doctor` already renders configuration, harness, agent, and user-skill failures, but returns success after reporting them. A script or CI job therefore cannot rely on its exit status to gate an invalid KI installation.

## Current state

- `createDoctorCommand` accumulates PASS, FAIL, and SKIP checks, renders every result, and returns normally on all report paths.
- `run(args, context)` maps a normal Commander completion to exit code 0, so every failing doctor report currently exits successfully.
- Existing CLI-contract tests assert failure text while retaining exit code 0.

## Steps

1. Settle the doctor exit contract: return non-zero when one or more checks are FAIL, retain 0 for PASS and SKIP-only reports, and preserve the complete human-readable report before exit.
2. Implement the aggregation at the command boundary without reclassifying operational errors, bypassing injected streams, or changing the meaning of individual checks.
3. Update CLI-contract tests for clean, failing, skipped, invalid-configuration, missing-harness, unavailable-agent, and missing-user-skill reports.
4. Update `ki(1)` and any user-facing command guidance that states or implies doctor success semantics.
5. Run the complete quality gate and verify the command in a representative valid and failing sandbox.

## Files touched

- `src/commands/doctor.ts`
- `src/tests/cli/doctor.test.ts`
- `man/ki.1` and any affected command guidance

## Verify

1. `ki doctor` exits 0 when all applicable checks pass or skip, and exits non-zero after rendering any FAIL check.
2. `src/tests/cli/doctor.test.ts` drives every contract through `run(args, context)` and asserts stdout plus exit code.
3. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` pass.

## Dependencies / blocks

This is a self-contained CLI exit-contract change. It has no plan dependency and can execute independently of CLI-001.
