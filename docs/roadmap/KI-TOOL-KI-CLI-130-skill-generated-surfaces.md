---
id: KI-TOOL-KI-CLI-130
area: CLI
title: Generated skill surfaces
project: ways-of-working
component: dev
purpose: capability
kind: deliver
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 41e11c949b746be916b554cf9b66859fdcd2fc8b
created_at: 2026-10-14T20:46:12Z
updated_at: 2026-10-14T20:46:12Z
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

## Discussion

### The shared guard

The write guard was the rubric command's private helper. Generation needs the same rule, that `--write` publishes only within the caller's working tree and only from a dev-linked Harness, so it now lives in `write-tree.ts` with the subject named per command; the rubric command's messages are unchanged apart from that subject.
