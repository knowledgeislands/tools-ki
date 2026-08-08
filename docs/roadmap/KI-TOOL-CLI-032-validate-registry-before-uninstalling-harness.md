---
id: KI-TOOL-CLI-032
title: Validate registry before uninstalling
theme: cli
horizon: now
status: ready
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make `ki harness uninstall` validate the user configuration it must rewrite before it removes anything from disk, so a hand-edited configuration cannot leave a half-completed uninstall, and cover the two guards that failure currently reaches.

## Context

An audit of the remaining `/* v8 ignore */` justifications, prompted by the one `KI-TOOL-CLI-031` corrected, found two more in `src/core/registry.ts` resting on a claim that does not hold.

Both sit in `configuredHarnessIds` and justify themselves by asserting that `installHarness` has already read the configuration as a regular file and already validated its `[harnesses]` section. That is true of the install and reinstall paths, which reach `recordInstalledHarness` through `installHarness`. It is not true of uninstall, which never calls `installHarness` at all:

- `discoverInstalledHarnesses` and `uninstallHarness` touch only the data directory.
- `requireInactive` reads the same `config.toml` through `inspectUserConfiguration`, but that reader is deliberately tolerant — a symlink yields `state: 'invalid'` with no skills, and a non-table `harnesses` is collected into `errors` rather than thrown. Neither aborts the command.

So `recordInstalledHarness` performs the first and only strict read of `config.toml` in an uninstall, and its guards are ordinary input validation over a user-editable file rather than the concurrent-replacement race the pragma claims. A configuration carrying `harnesses = 5`, or a `config.toml` replaced by a symlink, reaches them from a plain second invocation.

The coverage gap is the smaller half. Because the strict read happens in `recordInstalledHarness`, and that call comes *after* `uninstallHarness`, the harness is already deleted from the data directory when validation fails. A user whose configuration is malformed asks to uninstall one harness and gets the files removed, the registry unchanged, and a non-zero exit — the worst of the three outcomes, and the one hardest to recover from because the evidence of what was installed is gone.

This is inconsistent with what the command already promises elsewhere. `src/tests/cli/harness/harness.test.ts` pins that an uninstall refusing on unrecognised state preserves the payload it declined to remove. Refusing on a malformed configuration should preserve it too.

## Boundary

This item owns the ordering of validation against removal in `ki harness uninstall`, and the two justifications that ordering falsified. It does not change the configuration schema, the tolerance of `inspectUserConfiguration` — which is tolerant for good reason, since `ki repo doctor` must describe a broken configuration rather than die on it — the install or reinstall paths, or any other ignore site. The wider justification sweep across the remaining modules is separate.

## Current state

`src/commands/harness/index.ts` uninstall action runs, in order: identifier check, discovery, canonical-harness refusal, `requireInactive`, `uninstallHarness` (destructive), `recordInstalledHarness` (first strict configuration read, may throw).

`src/core/registry.ts:147` and `:160` carry `/* v8 ignore next */` with justifications naming `installHarness`. `:176` carries a third whose justification says "Both CLI callers" where there are three call sites, and names a validation the install site does not perform; that guard is genuinely unreachable but for a different reason than the one stated.

## Steps

- [ ] Validate the harness registry before the destructive step, so a malformed configuration fails the uninstall with nothing removed.
- [ ] Remove the two `/* v8 ignore */` pragmas at `src/core/registry.ts:147` and `:160`, whose justifications the uninstall path falsifies.
- [ ] Cover both guards through the CLI: a `config.toml` replaced by a symlink, and one whose top-level `harnesses` key is a scalar.
- [ ] Assert in both tests that the harness survives, so the ordering is pinned rather than merely the message.
- [ ] Correct the justification at `src/core/registry.ts:176` to state the actual reason it is unreachable and the true caller count.

## Files touched

- `src/commands/harness/index.ts` — the uninstall ordering.
- `src/core/registry.ts` — the two false justifications and the stale one.
- `src/tests/cli/harness/harness.test.ts` — the two reachable guards and the preservation assertions.

## Verify

`bun run test:coverage` passes with 100% on all four metrics and two fewer exempted lines. Each new test asserts the exit code, the diagnostic, and that the installed payload is still present — the last of these fails if the ordering regresses, which the message alone would not catch.

## Dependencies / blocks

Nothing blocks this item. It shares a cause with `KI-TOOL-CLI-031` and the convention recorded in `AGENTS.md`, but touches different code.

## Discussion

### Why the fix is ordering rather than tolerance

Making `configuredHarnessIds` tolerant of a malformed configuration would remove the failure and the coverage gap together, and would be wrong. A command that must rewrite `config.toml` cannot proceed against a file it cannot parse, because the rewrite is a regex substitution over the existing text and would produce a worse file than it found. Failing is correct; failing before removing anything is what was missing.

### Why not simply record before removing

Swapping the two calls would validate early, but it would leave the configuration claiming the harness is gone while its files remain whenever the removal then failed — and the removal has a real failure mode already pinned by the unrecognised-state test. Validating first, removing second, and recording third keeps every failure ordered before the step it would otherwise contradict.
