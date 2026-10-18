---
id: KI-TOOL-KI-CLI-138
area: CLI
title: Warn unknown record fields
project: tools-burndown
purpose: corrective
kind: deliver
component: repo
status: done
blocks: []
blocked_by: []
baseline_ref: 7eeeb54e1ab551eefed5345dcfaf3c454efc74c0
created_at: 2026-10-15T21:48:02Z
updated_at: 2026-10-18T08:53:02Z
---

# Warn Unknown Record Fields

## Goal

`ki` warns, naming the file and field, whenever a KB Streams record's front matter carries a field outside the shared record model, so that an ad hoc signal such as `priority` is caught at once and horizon stays the only priority signal.

## Context

Kris Brown, in the ways-of-working thread on 15 October 2026 (PRIORITY-FIELD): "Remove priority from KI-PRINCIPAL-MOD-006 and KI-PRINCIPAL-MOD-008, and have the Streams checker and tools-ki warn on unknown record fields; horizon stays the only priority signal." This record carries the tools-ki half; the Streams checker in ki-agentic-harness and the two ki-principal records are separate.

What `ki` does today, observed at `86adda02`:

- **Roadmap adapter.** `parseWorkItem` already rejects any field outside `allowedFields` with "has unsupported or repeated field" ([items.ts:292](../../src/core/work/items.ts)).
- **KB Streams adapter.** The same loop keeps the first uncommon key as `adapterField` and skips the rest with `continue` ([items.ts:296](../../src/core/work/items.ts)), so a `priority:` line on a Streams record is read without any sign.
- **Warnings.** The work listing already reports an unavailable registry and unknown Project slugs as warnings, never failures ([registry.ts:194](../../src/core/work/registry.ts)), which gives the channel to reuse.

## Boundary

- In: collecting every field a KB Streams record carries outside the shared record model and any declared adapter field; surfacing each as a warning naming file and field wherever `ki` reads work records for listing, selection or audit; the warning text saying that horizon is the only priority signal when the field is `priority`; contract tests through `run(args, context)`; `CHANGELOG.md` and the help or manual lines that list warnings.
- Out: turning the warning into a failure; changing the roadmap adapter's existing rejection; editing any record, including KI-PRINCIPAL-MOD-006 and KI-PRINCIPAL-MOD-008; the ki-repo-kb-streams checker in ki-agentic-harness.

## Current state

Read at `b36b3312` on 16 October 2026.

- `frontmatter` in `src/core/work/items.ts:277` rejects any field outside `allowedFields` for the roadmap adapter. For `kb-streams` it treats an uncommon key as an adapter field, skips its value and indented continuation lines, and records nothing, so `priority:` passes silently.
- `readWorkItemRecordInventory` (`items.ts:485`) returns `records` and `faults`; nothing carries a per-record warning. `ki repo roadmap` already prints a `warnings (<n>)` block for registry grouping warnings that never change the exit status (`src/commands/repo/roadmap.ts:147`, `:376`).
- **The harness side has landed.** `ki-agentic-harness` `origin/main` (`05ee5b1f`) ships the `ki-repo-kb-streams` checker's list: `RECORD_FIELDS` in `skills/repo-structure/ki-repo-kb-streams/scripts/rubric/contexts/streams.ts` (the current work-item fields) plus `KB_NOTE_FIELDS` (`note_type`, `updated`, `reviewed`, `created`, `tags`, `author`), warning on anything else and naming `priority`. The field-list agreement the Dependencies section asked for is therefore defined, not open.
- `tools-ki`'s `allowedFields` also admits `theme`, `waiting_on_trades`, `intake_disposition` and `intake_disposition_target`, retired fields it still reads for migration and which the harness checker fails separately.

## Decision

1. **Known fields** for a KB Streams record are `allowedFields` plus the six `ki-repo-kb` universal note fields; everything else is unknown and warned. The retired fields stay accepted here, as today, because their retirement is the roadmap adapter's own check.
2. **Kept in step by a contract test on each side**, not an export: `tools-ki` has no published data artefact the harness reads at check time, and the harness already has `streams.test.ts` holding its two lists level. This record adds a `tools-ki` test pinning the known set, with a comment naming the harness file it mirrors.
3. **Where it shows.** Every `ki repo roadmap` view that reads Streams records (list, next, grouped views) prints one warning per record and field in its existing warnings block; for `priority` the text adds "horizon is the only priority signal". Exit status never changes.

## Steps

- [x] In `src/core/work/items.ts`, add `kbNoteFields` and collect each uncommon key for `kb-streams` into `unknownFields` on the parsed result instead of discarding it; keep skipping its value lines.
- [x] Carry `unknownFields` on `WorkItemRecord` and add `warnings: readonly string[]` to `WorkItemRecordInventory` (and `WorkItemInventory`), formatted `<file>: unknown field <name>` with the `priority` addendum.
- [x] In `src/commands/repo/roadmap.ts`, merge the inventory warnings into the existing warnings block for text and JSON output, after the grouping warnings.
- [x] Contract tests through `run(args, context)` (see Verify).
- [x] `CHANGELOG.md`, `man/ki.1` and `man/ki.commands.json` where `ki repo roadmap` lists its warnings, and `docs/guides/user/repository-operations.md` if it describes the warnings block.

## Files touched

`src/core/work/items.ts`; `src/commands/repo/roadmap.ts`; `src/tests/cli/repo/roadmap.test.ts` (or `roadmap-model.test.ts`); `CHANGELOG.md`; `man/ki.1`; `man/ki.commands.json`; possibly `docs/guides/user/repository-operations.md`.

## Verify

1. A KB Streams fixture record with `priority: high` lists normally, and `ki repo roadmap` prints `<file>: unknown field priority; horizon is the only priority signal` under warnings, exit 0.
2. A record with `tags` and `note_type` draws no warning; one with `owner: x` draws `unknown field owner`; two unknown fields on one record draw two lines.
3. A multi-line unknown field's continuation lines are skipped as before and do not fault the record.
4. The roadmap adapter still rejects an unknown field with `has unsupported or repeated field`, unchanged.
5. The pinned known-field test lists exactly `allowedFields` plus the six note fields.
6. `bun run test:coverage` at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `mandoc -T lint man/ki.1`, rumdl and `ki repo audit --repo .` clean.
7. `ki repo roadmap --repo <ki-principal>` run read-only on this machine shows a warning for any record still carrying `priority`, or none if KI-PRINCIPAL-MOD-006 and KI-PRINCIPAL-MOD-008 are already fixed.

## Dependencies / blocks

None. The harness `ki-repo-kb-streams` checker it mirrors is on `ki-agentic-harness` `origin/main`; a later change to that list needs the matching change here, which the pinned test makes visible.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

`CHANGELOG.md`, `man/ki.1`, `man/ki.commands.json` and, if it lists warnings, `docs/guides/user/repository-operations.md`.

### Roadmap

None.

## Review

### Delivered

`ki repo roadmap list` and `summary` now warn on each KB Streams record field outside the shared record model and the six `ki-repo-kb` note fields, as `<file>: unknown field <name>`. For `priority` the line adds `; horizon is the only priority signal`. The warnings sit in the existing warnings block, and JSON output lists them under each repository's `warnings`. The exit status never changes, and the roadmap adapter still rejects such a field.

### Change Summary

- `6aa676a0`:
  - `src/core/work/items.ts`: `kbNoteFields` and the known set. `frontmatter` collects each unknown KB Streams key and still skips its continuation lines. `WorkItemRecord` carries `unknownFields`, and both inventories carry `warnings`.
  - `src/core/work/operations.ts`: the list result carries the inventory warnings.
  - `src/commands/repo/roadmap.ts`: the warnings join the grouping warnings. A single-repository list now also shows a warnings block.
  - `src/core/work/roadmap-report.ts`: a repository entry gains `warnings` only when it has some, so existing `ki/roadmap/v1` output keeps its shape.
  - `CHANGELOG.md`, `man/ki.1` and the regenerated `man/ki.commands.json`.
- `docs/guides/user/repository-operations.md` does not describe the roadmap warnings block, so it is unchanged.

One choice went beyond the Steps. The pinned known-field test runs through `run(args, context)` rather than importing the set, because the CLI test boundary forbids product imports in tests. It writes one record per pinned field plus `owner`, and expects `owner` as the only warning. Removing `author` from the set made it fail, as intended. It cannot catch a field that `tools-ki` adds to its model without the Harness, because a field `tools-ki` knows never warns.

### Verification

Through `run(args, context)` and `sandbox()`:

- **Verify 1:** a `priority: high` record lists, and the warning line appears in text, in `summary` and in JSON, with exit 0.
- **Verify 2:** `tags`, `note_type`, `author` and `created` draw no warning. `owner` draws one, and a record with three unknown fields draws three lines.
- **Verify 3:** a multi-line `aliases` list is skipped and does not fault its record.
- **Verify 4:** a roadmap-adapter record with `owner` still fails with `has unsupported or repeated field owner` and no warning.
- **Verify 5:** the pinned test lists the 26 shared fields plus the six note fields.

Gates, on 16 October 2026:

- `bun run test:coverage` passed 74 files and 1212 tests at 100% statements, branches, functions and lines.
- `bunx tsc --noEmit -p .`, biome, `bunx knip`, `mandoc -T lint man/ki.1` and rumdl were clean.
- `ki repo audit --repo .` reports only the earlier DEPS-1 failure and the CI-1 and HOOK-1 warnings.

**Verify 7:** `ki repo --repo <ki-principal> roadmap list`, run read-only, listed four records with no warnings and exit 0. KI-PRINCIPAL-MOD-006 and KI-PRINCIPAL-MOD-008 no longer carry `priority`.

### Outstanding concerns

- The pinned list mirrors the Harness at `05ee5b1f` and was not re-read there, because this run makes no remote calls. A later change to the Harness lists needs a matching change here.
- `ki repo audit` does not yet report these warnings. The Decision limits this record to the `ki repo roadmap` views, and the Harness checker owns the audit side.

### Post-change review

The change adds data alongside existing data and leaves the failure paths alone. Unknown fields are gathered while the frontmatter is read, using the same skip rule as before. A record that fails validation adds no warning. A warning never reaches the exit-status checks. The `ki/roadmap/v1` report is unchanged for any repository without warnings.

### Mini recap

KB Streams records now report fields outside the shared model, such as `priority`, naming the file and field without failing. A test checks the known set against the Harness checker's lists.

## Done

Accepted 2026-10-18 by Kris Brown on the review packet above and the independent review of 18 October, which found it ready for acceptance. In the ways-of-working walk-through Kris answered "Tools-sitting, yes, accepted", recorded in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, batch 5") as TOOLS-SITTING a): accept the ten reviewed tools-ki records, then cut v0.11.1 and install it on this Mac. Kris accepted what is there, so any provisional call named under Outstanding concerns stands as delivered.

## Discussion

Capture only, on Kris Brown's explicit request in PRIORITY-FIELD; adoption, priority and plan belong to this repository. Question for planning: whether the shared field list should be exported once from `ki` for the harness checker to read, or kept in step by a contract test on each side.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned and set Ready on 16 October 2026 under the tools-burndown thread's BURN-OVERNIGHT authority. The planning question above is settled in the Decision section: a pinned contract test on each side, since the harness checker's list has already landed.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record, against Decisions 1 to 3 and Verify 1 to 7. No code was changed and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Decision 1:** `kbStreamsKnownFields` in `src/core/work/items.ts:50` is `allowedFields` plus the six note fields. Read against the local `ki-agentic-harness` checkout, every one of the 23 fields in its `RECORD_FIELDS` and its six `KB_NOTE_FIELDS` is in the `tools-ki` set; the three extra fields here are the retired ones Decision 1 keeps, so the delivery's concern that the list was not re-read is now settled.
- **Decision 3:** `ki repo roadmap` has no `next` view; `list` and `summary` are the views that read Streams records, and both carry the warnings.
- **Verify 1 to 5:** covered by contract tests through `run(args, context)`, as the Verification lists.
- **Verify 6:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc, biome, knip, mandoc and rumdl were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1, neither from this record.
- **Verify 7:** `ki repo --repo <ki-principal> roadmap list`, read-only, listed four records with no warnings, exit 0.
