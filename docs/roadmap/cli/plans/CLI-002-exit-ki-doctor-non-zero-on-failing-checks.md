---
id: 'CLI-002'
title: Exit ki doctor non-zero on failing checks
status: done
roadmap: cli/exit-ki-doctor-non-zero-on-failing-checks
blocks: —
blocked-by: —
baseline-ref: 912f422defbfa9abd908edf7293f601a18b951e2
---

## Context

`ki doctor` already renders configuration, harness, agent, and user-skill failures, but returns success after reporting them. A script or CI job therefore cannot rely on its exit status to gate an invalid KI installation.

## Current state

- `createDoctorCommand` accumulates PASS, FAIL, and SKIP checks, renders every result, and returns normally on all report paths.
- `run(args, context)` maps a normal Commander completion to exit code 0, so every failing doctor report currently exits successfully.
- Existing CLI-contract tests assert failure text while retaining exit code 0.

## Steps

1. ✓ Settle the doctor exit contract: return non-zero when one or more checks are FAIL, retain 0 for PASS and SKIP-only reports, and preserve the complete human-readable report before exit.
2. ✓ Implement the aggregation at the command boundary without reclassifying operational errors, bypassing injected streams, or changing the meaning of individual checks.
3. ✓ Update CLI-contract tests for clean, failing, skipped, invalid-configuration, missing-harness, unavailable-agent, and missing-user-skill reports.
4. ✓ Update `ki(1)` and any user-facing command guidance that states or implies doctor success semantics.
5. ✓ Run the complete quality gate and verify the command in a representative valid and failing sandbox.

## Files touched

- `src/commands/doctor.ts`
- `src/cli.ts`
- `src/core/errors.ts`
- `src/tests/cli/doctor.test.ts`
- `man/ki.1` and any affected command guidance

## Verify

1. `ki doctor` exits 0 when all applicable checks pass or skip, and exits non-zero after rendering any FAIL check.
2. `src/tests/cli/doctor.test.ts` drives every contract through `run(args, context)` and asserts stdout plus exit code.
3. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` pass.

## Dependencies / blocks

This is a self-contained CLI exit-contract change. It has no plan dependency and can execute independently of CLI-001.

## Acceptance

### Delivered

`ki doctor` now returns a non-zero exit status after rendering any failing check, making the command suitable as a script and CI gate while preserving its complete human-readable report.

### Summary of changes

- Added a silent `KiExit` outcome at the root CLI boundary so an already-rendered report can return a status without a duplicate error line.
- Centralised doctor report emission and return status in `src/commands/doctor.ts`.
- Expanded `src/tests/cli/doctor.test.ts` to assert failing and clean-report exit contracts, and documented the contract in `man/ki.1`.

### Verification

- `bun run test -- src/tests/cli/doctor.test.ts` — 10 passing CLI-contract tests.
- `bun run test` — 320 passing tests.
- `bun run test:coverage` — 100% statements, branches, functions, and lines.
- `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` — passed.
- Checked implementation revision: `02f2bd6` (`fix(doctor): fail on unhealthy checks`).

### Outstanding concerns

None.

### Mini recap

Returning an explicit silent outcome from the command boundary keeps fully rendered diagnostic reports distinct from operational errors while preserving the CLI's injected stream contract.

## Done

Completed the `ki doctor` exit-status contract and retained its verified acceptance record.

Residual concerns: None.

Intended follow-up: Prune this retained record with its canonical roadmap item when the completed CLI tranche is ready for cleanup.
