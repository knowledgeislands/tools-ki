---
id: KI-TOOL-KI-CLI-138
area: CLI
title: Warn unknown record fields
project: tools-burndown
purpose: corrective
kind: deliver
component: repo
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-15T21:48:02Z
updated_at: 2026-10-16T01:20:20Z
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

- [ ] In `src/core/work/items.ts`, add `kbNoteFields` and collect each uncommon key for `kb-streams` into `unknownFields` on the parsed result instead of discarding it; keep skipping its value lines.
- [ ] Carry `unknownFields` on `WorkItemRecord` and add `warnings: readonly string[]` to `WorkItemRecordInventory` (and `WorkItemInventory`), formatted `<file>: unknown field <name>` with the `priority` addendum.
- [ ] In `src/commands/repo/roadmap.ts`, merge the inventory warnings into the existing warnings block for text and JSON output, after the grouping warnings.
- [ ] Contract tests through `run(args, context)` (see Verify).
- [ ] `CHANGELOG.md`, `man/ki.1` and `man/ki.commands.json` where `ki repo roadmap` lists its warnings, and `docs/guides/user/repository-operations.md` if it describes the warnings block.

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

## Discussion

Capture only, on Kris Brown's explicit request in PRIORITY-FIELD; adoption, priority and plan belong to this repository. Question for planning: whether the shared field list should be exported once from `ki` for the harness checker to read, or kept in step by a contract test on each side.

Adopted on 16 October 2026 through `ki-next` as deliver / Next under the tools-burndown Project, on Kris Brown's TRIAGE-ADOPT answer (option a) as applied in the tools-burndown thread's BURN-OVERNIGHT decision.

Planned and set Ready on 16 October 2026 under the tools-burndown thread's BURN-OVERNIGHT authority. The planning question above is settled in the Decision section: a pinned contract test on each side, since the harness checker's list has already landed.
