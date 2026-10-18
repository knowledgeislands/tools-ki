---
id: KI-TOOL-KI-CLI-146
area: CLI
title: KI_QUIET setting
project: tools-burndown
purpose: capability
kind: deliver
component: repo
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 7df8187f2011040725f9d07bf747db8e92a0c161
created_at: 2026-10-18T04:25:00Z
updated_at: 2026-10-18T06:40:00Z
---

# KI_QUIET Setting

## Goal

One setting, `KI_QUIET`, makes every `ki` command that renders operation output behave as if called with `--concise --progress never`. An agent harness or a person sets it once instead of adding both flags to every call, and failures, non-zero exits and failing findings stay fully visible.

## Context

Kris Brown answered QUIET-HOOK on 17 October 2026 at 22:50 BST in the ways-of-working thread: "Yes: capture an unadopted tools-ki record for a KI_QUIET setting implying --concise --progress never, and an unadopted ki-agentic-harness record for a PreToolUse quietening hook, first checking the current Claude Code hooks reference; decide whether to build them after a week of the source-level cuts." This record is the tools-ki half; the harness half is [KI-HARNESS-GOV-204](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-204-pretooluse-quietening-hook.md).

What `ki` does today:

- `ki repo audit` and `ki repo conform` accept `--concise` and `--progress auto|always|never`; [`operationProgress`](../../src/commands/repo/shared/progress/options.ts) already makes `--concise` imply `--progress never`.
- Other commands have no shared quiet switch, and no `KI_*` variable sets output shape; the existing variables name paths, sources, versions and rate limits.

## Boundary

- In: reading `KI_QUIET` through `KiContext`'s injected environment; which values count as set; which commands honour it and how an explicit flag such as `--progress always` overrides it; help, manual and guide text; contract tests through `run(args, context)`.
- Out: the PreToolUse hook, which KI-HARNESS-GOV-204 owns; setting the variable in any shell, harness or user environment; any change that hides a failure, a non-zero exit or a gate's failing findings.
- Captured as unadopted, for Kris to decide after a week of the source-level cuts. Adopted into Now on 18 October 2026 under fable-opinion-2: "KI-TOOL-KI-CLI-146... Adopt and plan provisionally, build to Awaiting review. Lower value than -131 and -136." The adoption comes before that week is out, and is provisional, for Kris to confirm.

## Current state

Read at `7df8187f` on 18 October 2026.

- Only `ki repo audit` (`src/commands/repo/audit.ts`) and `ki repo conform` (`src/commands/repo/conform.ts`) take `--concise`. Both build their output shape with `operationOptions` (`src/commands/repo/shared/progress/options.ts`), which reads no environment.
- `--concise` prints one summary line per repository and no findings, even for a failing repository: a failing audit shows its counts but not which findings failed. A quiet setting that only implied `--concise` would therefore hide failing findings, which this record's Goal rules out.
- No other command has a quiet switch. `ki agent` output already has its own shape, read mainly by coordinators.
- `KI_*` variables are read through `KiContext.environment`; none sets output shape.

## Decision

All four answers are provisional, for Kris to confirm.

1. **Scope.** `KI_QUIET` applies to `ki repo audit` and `ki repo conform`, the two commands that render operation output and take `--concise`. `ki agent` and every other command are unchanged.
2. **Set.** The variable is set when it is non-empty and not `0`; an empty value and `0` count as unset.
3. **Effect.** When set, a call behaves as `--concise --progress never`, except that a repository whose verdict fails renders its report frame with its FAIL findings, so a failure names what failed. A passing or warning repository prints its one summary line. Exit status is unchanged.
4. **Precedence.** Any explicit output flag (`--concise`, `--progress`, `--progress-style` or `--reporter-levels`) replaces the quiet defaults for that call, so the call behaves exactly as it would without the variable.

## Steps

- [x] Options: `operationOptions` takes the environment, returns `quiet` and applies Decision 2 to 4.
- [x] Audit and conform: under `quiet`, a failing repository renders its frame and FAIL findings; any other repository renders its concise summary.
- [x] Contract tests through `run(args, context)` and `sandbox()` (see Verify).
- [x] Documentation: `man/ki.1` (a new ENVIRONMENT section), `man/ki.commands.json` if it changes, `README.md`, `docs/guides/user/repository-operations.md` and `CHANGELOG.md`.

## Files touched

- `src/commands/repo/shared/progress/options.ts`, `src/commands/repo/shared/reporting/audit.ts`, `conform.ts` and `index.ts`
- `src/commands/repo/audit.ts`, `src/commands/repo/conform.ts`, `src/commands/repo/educate.ts`
- `src/tests/cli/repo/quiet.test.ts` (new)
- `man/ki.1`, `README.md`, `docs/guides/user/repository-operations.md`, `CHANGELOG.md`

## Verify

1. With `KI_QUIET=1`, a passing `ki repo audit` prints only its summary line, as `--concise --progress never` does, and exits 0.
2. With `KI_QUIET=1`, a failing audit prints its report frame with its FAIL findings and summary, and exits 1; a failing conform does the same.
3. `KI_QUIET=0` and an empty `KI_QUIET` leave the output as it is without the variable.
4. With `KI_QUIET=1` and any of `--concise`, `--progress`, `--progress-style` or `--reporter-levels`, the output equals the same call without the variable.
5. Gates: `bun run test:coverage` at 100%, `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, the command-inventory check and `ki repo audit --repo .`.

## Dependencies / blocks

None. The PreToolUse hook, [KI-HARNESS-GOV-204](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-204-pretooluse-quietening-hook.md), is the harness half and may set the variable; neither needs the other.

## Documentation impact

### Decision Records

None; output shape is `tools-ki`-owned presentation.

### Specifications

None.

### Guides

`man/ki.1`, `README.md`, `docs/guides/user/repository-operations.md` and `CHANGELOG.md`.

### Roadmap

None.

## Review

### Delivered

A set `KI_QUIET` gives `ki repo audit` and `ki repo conform` the output of `--concise --progress never`. A passing or warning repository prints its one summary line; a failing one renders its report frame with its FAIL findings and summary, so the failure names what failed, and the exit status is unchanged. An empty value and `0` count as unset, and any explicit `--concise`, `--progress`, `--progress-style` or `--reporter-levels` gives that call its ordinary output.

### Change Summary

- `src/commands/repo/shared/progress/options.ts`: `operationOptions` takes the environment and returns `quiet`; `quietSet` reads `KI_QUIET`.
- `src/commands/repo/shared/reporting/audit.ts` and `conform.ts`: `auditRepositoryFails` and `conformFails`, exported through `index.ts`.
- `src/commands/repo/audit.ts` and `conform.ts`: under `quiet`, a failing repository opens its frame late and renders its FAIL findings; `educate.ts` sets `quiet: false` in its fixed output shape.
- `src/tests/cli/repo/quiet.test.ts` (new).
- `man/ki.1` (new ENVIRONMENT section), `README.md`, `docs/guides/user/repository-operations.md`, `CHANGELOG.md`. `man/ki.commands.json` is unchanged, since no option changed.

### Verification

Verify 1 to 4 are covered through `run(args, context)` and `sandbox()` in `quiet.test.ts`: a passing audit and conform under `KI_QUIET=1` equal `--concise --progress never`; a warning-only audit prints one summary line; a failing audit and conform render the frame, the FAIL finding and not the WARN finding, and exit 1; `KI_QUIET=` and `KI_QUIET=0` equal no variable; and with each of the four output flags the output equals the same call without the variable.

On 18 October 2026, `bun run test:coverage` passed 1326 tests at 100% statements, branches, functions and lines; `bunx tsc --noEmit`, `bunx biome check .` (no errors; its warnings predate this record), `bunx knip`, `mandoc -T lint man/ki.1`, the command-inventory check and rumdl were clean; and `KI_QUIET=1 ki repo audit --repo .` passed with FAIL=0 and two warnings, as at the baseline, printing one summary line.

### Outstanding concerns

- All four Decision answers are provisional, for Kris to confirm: the scope of audit and conform only, `0` and empty as unset, failing findings kept under the quiet shape, and any explicit output flag replacing the quiet defaults.
- The record was captured for a decision after a week of the source-level cuts; fable-opinion-2 authorised building it sooner. Nothing sets the variable yet; KI-HARNESS-GOV-204 or a person would.
- Under the quiet shape a failing repository's WARN findings are counted in its summary but not listed.

### Post-change review

`--concise` itself is unchanged and still prints counts only. The quiet shape differs from it in one way, the frame on failure, which the Goal's "failing findings stay fully visible" required.

### Mini recap

`KI_QUIET=1` now quietens audit and conform in one setting, while a failure still shows what failed.

## Discussion

Origin: QUIET-HOOK in the ways-of-working thread, 17 October 2026, carried into the tools-burndown chain as KI-QUIET; captured on 18 October 2026 by the tools-burndown run.

Open questions for planning:

- Scope: only the commands with `--concise` today, or a shared output option every operation command reads.
- Precedence: whether an explicit flag always wins over the variable, and whether `KI_QUIET=0` or an empty value counts as unset.
- Whether `ki agent` output, read mainly by coordinators, follows the same switch.

ki-burndown-3 adopted and planned this on 18 October 2026, answering the three questions in Decision provisionally, for Kris to confirm, and built it to Awaiting review the same day.
