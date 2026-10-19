---
id: KI-TOOL-KI-CLI-151
area: CLI
title: CLI conventions departures
kind: deliver
purpose: debt
project: tools-burndown
priority: medium
size: m
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T19:23:40Z
updated_at: 2026-10-19T22:49:04Z
---

# KI-TOOL-KI-CLI-151: CLI Conventions Departures

## Goal

`ki` follows the `ki-repo-tools` command-line conventions where it departs from them today: `ki --version` prints `ki <version>`, `ki repo audit` and `ki repo conform` write their progress display to standard error, machine output is chosen in the conventions' form rather than `--format <text|json>`, and `--dry-run` has the short form `-n`.

## Context

[KI-HARNESS-GOV-218](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/docs/roadmap/KI-HARNESS-GOV-218-cli-conventions.md) added the command-line conventions reference to `ki-repo-tools`. Its `cli-conventions` run compared `tools-ki` with it read-only and reported four departures, in the [run report](https://github.com/knowledgeislands/ki-principal/blob/06acbc19def494109edcf74fae37aab592f4f3a2/+/_WORK/ki.ways-of-working/cli-conventions.report.md):

- `ki --version` prints only the version, such as `0.11.2`; GNU and the house standard expect `ki 0.11.2`. It is set in `src/cli.ts`.
- `ki repo audit` and `ki repo conform` write their progress display to standard output, not standard error.
- Machine output uses `--format <text|json>`, as in `registry list`, `manage mcp`, `repo roadmap` and `repo store`.
- `--dry-run` has no `-n`, across the commands that offer it.

Kris Brown answered CLI-DEPARTURES a) on 18 October 2026, recorded in the [tools-burndown decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md) ("Messages acted on at the mark"): add the departures to each tool's existing records and fix them at its next change. No open tools-ki record owns these commands' option grammar, so this one record carries them. `-f, --filter` is excluded under CLI-F-FILTER; v0.11.3 already keeps only the long `--filter`.

## Boundary

- In: the four departures above, with help, completion, manual, `man/ki.commands.json`, guides, CHANGELOG and contract tests through `run(args, context)`.
- Out: `-f, --filter` (CLI-F-FILTER); the conventions themselves, which `ki-repo-tools` owns; other tools' departures, which `tools-mgit` and `tools-rig` carry; a release.

## Shaping

**Approach:** the four departures as separate commits behind contract tests through `run(args, context)`: `ki --version` in `src/cli.ts`, audit and conform progress to standard error, the machine-output option, and `-n` for `--dry-run`, each with help, completion, manual, command inventory, guide and changelog lines.

**Dependencies:** none. CLI-DEPARTURES a) fixes each at `ki`'s next change to the commands concerned.

**Decisions still needed:** whether `--format` gives way to `--json` or `--json` is added beside it; and whether moving progress to standard error breaks any consumer that reads audit output, such as the commit hooks and CI.

**Promotion to Next:** when the output-option form is chosen and the consumers of audit standard output are listed.

## Dependencies / blocks

Not blocked. Fixed at `ki`'s next change to the commands concerned, per CLI-DEPARTURES a).

## Discussion

Captured by the tools-burndown `tki` run on 18 October 2026. Open for planning: whether `--format` gives way to `--json` or stays as a documented house form with `--json` added beside it, and whether moving progress to standard error changes any consumer that reads audit output.
