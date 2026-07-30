---
id: KI-TOOL-CLI-013
title: Report unrecognised CLI syntax before help
theme: cli
horizon: blocking
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 3bc6dabdc9be4a420f0f33a415ff6a63deb0f4ec
---

## Context

Make invalid command syntax fail explicitly even when a help flag is present. `ki skill repo` currently reaches Commander’s unknown-command path, but `ki skill repo -h` prints successful `ki skill` help without identifying `repo` as invalid. This conceals the command-order error; the repository-scoped form is `ki repo skill`, not `ki skill repo`. Every unrecognised option must likewise be a usage error rather than be ignored, misinterpreted, or converted to a successful help response.

## Boundary

This item does not add `ki skill repo` as an alias, alter valid command help, accept undocumented options, or change repository-skill semantics. It addresses parser diagnostics and exit behaviour for invalid command tokens and options.

## Current state

The root CLI assembles independent `skill` and `repo skill` command trees through Commander. At a nested user-skill command, Commander recognises `-h` before its unknown-subcommand error path, so help takes precedence over the invalid `repo` token. The normal unknown-command and unknown-option paths also bypass KI's `ki: error:` presentation used by typed command failures, and must be made consistent across root and nested command groups.

## Steps

1. Define a shared CLI parser-error boundary that detects an unknown subcommand or option before emitting help, renders it through KI's normal error presentation with a non-zero usage exit code, and then prints the affected command's help.
2. Apply the boundary at the root and nested command groups, beginning with `ki skill repo -h`, without swallowing valid help requests or changing valid command dispatch.
3. Reject every unrecognised short or long option at the command level where it appears, including an unknown option preceding or following `-h`; do not treat an adjacent value as a positional argument or silently pass it to a child command.
4. Where useful, provide a deterministic corrective hint for a known reversed command order, such as `ki repo skill`. Do not guess a correction for an unknown option unless it is unambiguous and stable.
5. Add CLI-contract tests for unknown nested subcommands and options with and without `-h`, asserting explicit error text before the affected command's help, a non-zero exit code, and unchanged valid help output.

## Files touched

- `src/cli.ts`
- `src/commands/skill.ts`
- `src/tests/cli/skill.test.ts`
- `src/tests/cli/unknown.test.ts`

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --skill ki-roadmap --repo .`

## Dependencies / blocks

This is a Blocking CLI correctness issue with no work-item dependency. It does not block `KI-TOOL-CLI-011` or `KI-TOOL-CLI-012`, whose workspace and bootstrap behaviours are independent. `KI-TOOL-CLI-015` relies on this common parser boundary to reject its deliberately unsupported `ki diag --repo` and `ki repair --workspace` forms.

## Delegation

One fresh serial mechanical worker (`gpt-5.6-terra`, medium reasoning) owns the parser boundary and its CLI tests. Locked: invalid subcommands and options fail non-zero before the affected help; valid help and command dispatch remain unchanged; only the documented reversed-order hint is permitted. Escalate any Commander limitation that would require accepting an invalid spelling or alter valid grammar. Done means root and nested unknown token/option cases pass with and without `-h`, then the full suite, typecheck, style check, and roadmap audit pass. The worker stops before commit for review.

## Discussion

### Reproduced input

`ki skill repo -h` renders the parent `ki skill` usage and command list without an error. Removing `-h` renders Commander’s unknown-command text, confirming that help-option precedence rather than command discovery makes the invalid form appear valid.

### Diagnostic contract

An unrecognised command token is a usage error even if subsequent options request help. The command should name the invalid token and its parent command, retain a stable non-zero exit code, then print the affected command's help so the valid forms remain visible. For the reproduced input, the error prefix is:

```text
ki: error: unknown subcommand 'repo' for 'ki skill'
Did you mean: ki repo skill …?

Usage: ki skill [options] [command]
…
```

A correction hint is helpful only where it is unambiguous and must not turn the invalid spelling into a supported compatibility path.

### Unrecognised options

An option absent from the current command’s declared grammar is invalid at every command level, whether it is a short option, a long option, or appears beside a help option. The report must identify the unknown option and its command, return a non-zero usage exit code, then show that command’s help. For example, a future direct-CWD-only diagnostic must reject rather than silently select a repository:

```text
ki: error: unknown option '--repo' for 'ki diag'

Usage: ki diag [options]
…
```
