---
id: KI-TOOL-CLI-013
title: Report unknown subcommands before help
theme: cli
horizon: blocking
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Make invalid nested command syntax fail explicitly even when a help flag is present. `ki skill repo` currently reaches Commander’s unknown-command path, but `ki skill repo -h` prints successful `ki skill` help without identifying `repo` as invalid. This conceals the command-order error; the repository-scoped form is `ki repo skill`, not `ki skill repo`.

## Boundary

This item does not add `ki skill repo` as an alias, alter valid command help, or change repository-skill semantics. It addresses parser diagnostics and exit behaviour for invalid command tokens.

## Current state

The root CLI assembles independent `skill` and `repo skill` command trees through Commander. At a nested user-skill command, Commander recognises `-h` before its unknown-subcommand error path, so help takes precedence over the invalid `repo` token. The normal unknown-command path also bypasses KI's `ki: error:` presentation used by typed command failures.

## Steps

1. Define a shared CLI parser-error boundary that detects an unknown subcommand before emitting help, renders it through KI's normal error presentation with a non-zero usage exit code, and then prints the affected command's help.
2. Apply the boundary to nested command groups, beginning with `ki skill repo -h`, without swallowing valid help requests or changing valid command dispatch.
3. Where useful, provide a deterministic corrective hint for a known reversed command order, such as `ki repo skill`.
4. Add CLI-contract tests for unknown nested subcommands with and without `-h`, asserting explicit error text and correction hint before the affected command's help, a non-zero exit code, and unchanged valid help output.

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

This is a Blocking CLI correctness issue with no work-item dependency. It does not block `KI-TOOL-CLI-011` or `KI-TOOL-CLI-012`, whose workspace and bootstrap behaviours are independent.

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
