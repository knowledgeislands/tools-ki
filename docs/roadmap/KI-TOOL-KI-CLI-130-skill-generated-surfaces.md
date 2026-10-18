---
id: KI-TOOL-KI-CLI-130
area: CLI
title: Generated skill surfaces
project: ways-of-working
component: dev
purpose: capability
kind: deliver
status: done
blocks: []
blocked_by: []
baseline_ref: 41e11c949b746be916b554cf9b66859fdcd2fc8b
created_at: 2026-10-14T20:46:12Z
updated_at: 2026-10-18T08:53:02Z
---

# Generated Skill Surfaces

## Goal

`ki dev skill generate <skill> [--write]` renders the surfaces a skill's `scripts/generate/index.ts` module produces from the skill's own standard, names every one that is missing or stale on disk, and with `--write` publishes only those, so a standard can be the one source of runtime files other skills and hooks carry.

## Context

Kris decided on 2026-10-14, in the `ways-of-working` thread: "REPORT-SOURCE - generate the hook line, output style and prompt skeleton from the ki-pmo standard with a ki dev command, make ki-delegation link to it, and have the existing test check the generated files". The `pmo-simplify` background run delivers the harness side in `ki-agentic-harness`: the `ki-pmo` standard marks its source blocks, and `skills/change-management/ki-pmo/scripts/generate/index.ts` renders the coordinator hook's lines, the `ki-coordinator` output style, the run-prompt Report paragraph and the authority footers' report rule. This record is the `ki dev` command that verifies and writes them.

## Boundary

- In scope: the `generate` subcommand under `ki dev skill`; the generator module contract (`contract: 1`, the skill's `name`, a `generate(harnessRoot)` returning `{ path, content }` surfaces); drift reporting and `--write`; the development-link and working-tree guard, shared with `ki dev skill rubric`; tests, `man/ki.1`, the command inventory, the completions list, `docs/specs/skills.md` and `CHANGELOG.md`.
- Out of scope: the harness generator module and the surfaces it renders, which `ki-agentic-harness` owns; a conform or audit hook that runs generators; deleting surfaces a generator no longer names.

## Requirements

- The command resolves the skill from installed Harnesses, as `ki dev skill rubric` does, and imports `<skill source>/scripts/generate/index.ts` under the provider's real root.
- It refuses, naming the cause, when the module is missing, fails to import, or breaks the contract: no default table, a contract other than `1`, a name that is not the skill's, no `generate` function, a throw, a non-array result, a surface with a non-string path or content, a path that is absolute or leaves the Harness root, or a duplicated path.
- Without `--write`, it reports the count when every surface is in sync, and otherwise names each missing or stale surface and exits non-zero.
- With `--write`, it publishes only drifted surfaces, keeping an existing file's permission bits, and only from a dev-linked Harness whose Git working tree is the caller's.

## Current state

`ki dev skill rubric` resolves a skill from installed Harnesses and publishes its rubric catalogue behind a private write guard in `src/core/harness/development/rubric.ts`. Nothing renders or checks other files a skill's standard is the source of, so `ki-agentic-harness` kept the owner-report shape by hand in its hook, output style, run prompt and authority footers.

## Steps

- [x] Move the rubric write interlock into `src/core/harness/development/write-tree.ts` so both commands share it.
- [x] Add `src/core/harness/development/generation.ts` with module loading, contract validation, disk comparison and publication.
- [x] Register `generate <skill> [--write]` in `src/commands/dev/skill/index.ts` and its port in `src/commands/dev/ports.ts`.
- [x] Tests in `src/tests/cli/skill/generate.test.ts` for drift reporting, writing with the mode kept, both refusals and every contract refusal.
- [x] Document the command in `man/ki.1`, regenerate `man/ki.commands.json`, and add it to the completions test, `docs/specs/skills.md` as SKILL-006 and `CHANGELOG.md`.

## Files touched

- `src/core/harness/development/write-tree.ts`, `generation.ts`, `rubric.ts`, `types.ts`, `index.ts`
- `src/commands/dev/ports.ts`, `src/commands/dev/skill/index.ts`
- `src/tests/cli/skill/generate.test.ts`, `src/tests/cli/manage/completions.test.ts`
- `man/ki.1`, `man/ki.commands.json`
- `docs/specs/skills.md`, `CHANGELOG.md`

## Verify

- `bun run test:coverage` passes at the 100% thresholds; `bunx tsc --noEmit` is clean.
- `ki dev skill generate ki-pmo` reports every surface in sync in the harness; after a deliberate edit to `hooks/coordinator-reminder.sh` it names the hook stale and fails, and `--write` from the harness restores it byte for byte with its executable mode; `--write` from another working tree is refused with exit 2.

## Dependencies / blocks

- The harness generator and the `ki-pmo` source blocks are delivered by the `pmo-simplify` run in `ki-agentic-harness`; the command works with any skill that ships a conforming module.

## Documentation impact

### Decision Records

None.

### Specifications

`docs/specs/skills.md` gains SKILL-006, Generated skill surfaces.

### Guides

None.

### Roadmap

None.

## Review

### Delivered

`ki dev skill generate <skill> [--write]`, within the approved boundary: the subcommand, the generator module contract, drift reporting, `--write` behind the shared development-link and working-tree guard, tests, manual, command inventory, completions, SKILL-006 and the changelog. The harness generator and its surfaces, a conform or audit hook and the deletion of surfaces a generator no longer names stay out of scope. Baseline `41e11c949b746be916b554cf9b66859fdcd2fc8b`; delivered in `9c4c0c0ef55feac893e869b886e87639ece9d791`, `feat(dev): add ki dev skill generate for generated skill surfaces`, which `v0.10.5` already contains.

### Change Summary

- `src/core/harness/development/write-tree.ts` now holds the write guard the rubric command kept privately, with the subject named per command; `rubric.ts` uses it and its messages are otherwise unchanged.
- `src/core/harness/development/generation.ts` imports `<skill source>/scripts/generate/index.ts` under the provider's real root, validates the contract, compares each surface with disk and publishes only drifted surfaces, keeping an existing file's mode; `types.ts` and `index.ts` carry its types and exports.
- `src/commands/dev/ports.ts` and `src/commands/dev/skill/index.ts` register `generate <skill> [--write]`.
- `src/tests/cli/skill/generate.test.ts` covers drift reporting, writing with the mode kept, both guard refusals and every contract refusal; `completions.test.ts` lists the command.
- `man/ki.1`, `man/ki.commands.json`, `docs/specs/skills.md` (SKILL-006) and `CHANGELOG.md` document it.
- Deviation, within scope: `src/tests/cli/manage/inventory.test.ts` gained `generate` in its `dev skill` command list, a consequence of registering the command that the Files touched list did not name.

### Verification

Run on 16 October 2026 at `HEAD` `d64ed454`, whose `src/` contains the delivery unchanged; the installed `ki` runs the tools-ki primary checkout.

- `bun run test:coverage`: 71 files, 1189 tests pass; statements, branches, functions and lines all at 100%. `bunx tsc --noEmit` is clean. Additionally, `bunx biome check .` exits 0 with warnings and infos only, `bunx knip` exits 0 with configuration hints only, and `mandoc -T lint man/ki.1` is clean.
- `ki dev skill generate ki-pmo` in `ki-agentic-harness` reports "7 generated surface(s) are in sync" and exits 0.
- The `ki-pmo` generator splices only the hook's `line=` and `pointer=` values, so the deliberate edit went into the generated `line=` value: the check names `hooks/coordinator-reminder.sh` stale and exits 1. `--write` from the tools-ki working tree is refused with exit 2, naming the owning tree. `--write` from the harness rewrites the hook, its SHA-256 matches the original and its mode stays `-rwxr-xr-x`; the harness working tree is clean afterwards and a recheck exits 0.
- A first attempt appended a line at the end of the hook instead; the command rightly reported it in sync, because that line is outside the generated values. The original was restored from a copy, and the harness was left clean.

### Outstanding concerns

None.

### Post-change review

The goal holds: a skill's standard can be the one source of the files its generator names, and the command both detects and repairs drift without reaching outside the caller's working tree. Scope held apart from the one inventory-test line above. Regression risk is low: the rubric command's behaviour is covered unchanged through the shared guard, and the full suite is at 100% coverage. Ready for acceptance.

### Mini recap

`ki dev skill generate` shipped in `9c4c0c0e` and is in `v0.10.5`; Verify passed in full on 16 October 2026 against the live `ki-pmo` generator. No concerns. Learning route, not promoted: Verify steps that edit a generated file should name the generated region when a generator splices lines into a hand-kept file, as the `ki-pmo` hook generator does.

## Done

Accepted 2026-10-18 by Kris Brown on the review packet above and the independent review of 18 October, which found it ready for acceptance. In the ways-of-working walk-through Kris answered "Tools-sitting, yes, accepted", recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, batch 5") as TOOLS-SITTING a): accept the ten reviewed tools-ki records, then cut v0.11.1 and install it on this Mac. Kris accepted what is there, so any provisional call named under Outstanding concerns stands as delivered.

## Discussion

### The shared guard

The write guard was the rubric command's private helper. Generation needs the same rule, that `--write` publishes only within the caller's working tree and only from a dev-linked Harness, so it now lives in `write-tree.ts` with the subject named per command; the rubric command's messages are unchanged apart from that subject.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against its four Requirements and two Verify steps. No code was changed and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Requirements:** `src/core/harness/development/generation.ts` resolves the skill as the rubric command does, and `src/tests/cli/skill/generate.test.ts` covers drift reporting, writing only drifted surfaces with the mode kept, both write-guard refusals and, through one `test.each`, every contract refusal the Requirements list. SKILL-006 is in `docs/specs/skills.md`, and the command is in `man/ki.1` and `CHANGELOG.md`; delivery `9c4c0c0e` is in `v0.10.5` and `v0.11.0`.
- **Verify 1:** on the reviewed head, `bunx vitest run --coverage` passed 78 files and 1326 tests at 100%, and `bunx tsc --noEmit` was clean.
- **Verify 2:** `ki dev skill generate ki-pmo` in the `ki-agentic-harness` checkout reported 7 surfaces in sync and exited 0. The stale-edit and `--write` steps were not repeated, because they write to the harness; the delivery evidence above records them.
- **Observation, not blocking:** Verify 2's deliberate edit must fall in the generated `line=` or `pointer=` value, as the Mini recap says; an edit elsewhere in the hook is rightly reported in sync.
