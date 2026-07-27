---
id: 'CLI-007'
title: Restore repository-operation output controls
status: open
roadmap: cli/restore-repository-operation-output-controls
blocks: —
blocked-by: —
baseline-ref: —
---

## Context

The native `ki repo audit` and `ki repo conform` cutover retained the richer bounded progress indicator and aggregate recap, but dropped the caller-controlled output surface supplied by the retired repository runner.

The missing controls are a current CLI regression, not a compatibility requirement. They let interactive users, logs, and CI select useful presentation without changing which rubric items execute or how their outcomes affect the exit code.

## Current state

- `ki repo audit --help` exposes only `--repo` and `--skill`; conform additionally exposes `--dry-run`.
- Progress appears only when stderr is a TTY. A caller cannot force it on, suppress it, or select the former per-skill multi-row presentation.
- Every FAIL, WARN, and INFO finding is rendered. A caller cannot select finding levels, and audit no longer defaults to FAIL and WARN.
- The native runtime converts violations and informational outcomes into findings but discards PASS and NOT_APPLICABLE outcomes before presentation, so an `all` reporter cannot faithfully reproduce the complete result set.
- The per-skill reports and final aggregate recap are both desired and remain part of the output contract.
- The pre-cutover contract is recoverable from `ki-agentic-harness` ref `pre-native-cli-cutover`, especially `.ki/bin/aggregate.ts`.

## Steps

1. Restore `--progress <auto|always|never>` on `ki repo audit` and `ki repo conform`; default to `auto`, retain the current bounded three-column layout, and make forced non-TTY output deterministic.
2. Restore `--progress-style <single|multi>` on both commands; default to `single` and render one stable per-skill row in `multi` mode without weakening the aggregate item count.
3. Restore case-insensitive `--reporter-levels <levels|all>` with the complete FAIL, WARN, FIXED, INFO, NOT_APPLICABLE, and PASS vocabulary. Default audit to FAIL,WARN and conform to FAIL,WARN,FIXED.
4. Carry structured PASS and NOT_APPLICABLE outcomes through the host presentation boundary when requested, without treating them as failures, changing totals, or exposing rubric-owned formatting.
5. Apply the selected reporter levels consistently to the per-skill sections and the desired aggregate recap while retaining unfiltered totals and exit semantics.
6. Add CLI-contract coverage for defaults, every progress mode and style, level parsing and rejection, `all`, non-TTY output, filtered per-skill sections, the recap, and unchanged failure exit codes.
7. Update command help, `ki(1)`, and relevant user guidance with the restored options and defaults.

## Files touched

- `src/commands/repo.ts`
- Native runtime result types where needed to retain renderable structured outcomes
- `src/tests/cli/repo.test.ts`
- `man/ki.1` and relevant CLI guidance

## Verify

1. `ki repo audit --help` and `ki repo conform --help` describe all three controls and their accepted values.
2. Default audit renders FAIL and WARN only; default conform additionally renders FIXED.
3. `--reporter-levels all` renders PASS, NOT_APPLICABLE, INFO, WARN, FAIL, and FIXED outcomes that exist for the operation.
4. Filtering changes presentation only: totals and exit codes still reflect the complete operation.
5. `--progress never` is quiet, `auto` follows TTY state, `always` is observable in non-interactive logs, and both progress styles remain bounded by the terminal-width contract.
6. The per-skill sections and aggregate recap remain present and correctly filtered.
7. `bun run test`, `bunx tsc --noEmit`, and the repository's formatting and lint gates pass.

## Dependencies / blocks

This is a local `tools-ki` regression with no recipient handoff or external dependency. It is placed in Blocking because the native replacement removed an established operational capability used to control interactive and CI output.
