---
id: KI-TOOL-KI-CLI-155
area: CLI
title: Priority and size fields
kind: deliver
purpose: capability
project: ways-of-working
component: repo
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 171549e8c4b6305d415b5899d73a9507dda6a158
created_at: 2026-10-19T07:45:00Z
updated_at: 2026-10-19T18:05:39Z
transferred_from: ki-agentic-harness work-item format and ki-principal GDR-KI-PRINCIPAL-016, 2026-10-19
---

# KI-TOOL-KI-CLI-155: Priority and Size Fields

## Goal

`ki` reads and writes the `priority` and `size` work-record fields the harness work-item format now defines, lists the records still missing a size or a `kind` or carrying a retired shape, and warns and then fails on them in step with the harness checker, so that `ki work` and `ki repo audit` give the same verdict on a record.

## Context

On 2026-10-19 Kris reversed the 15 October answer that horizon is the only priority signal. Under [GDR-KI-PRINCIPAL-016](https://github.com/knowledgeislands/ki-principal/blob/main/Admin/Governance/Decisions/GDR-KI-PRINCIPAL-016-priority-and-size-on-work-records.md) every work record, in a local roadmap or Knowledge Base Streams, carries a priority and a size written at capture whatever its horizon. The harness [work-item format](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/change-management/ki-work-roadmap/references/standards-work-item-format.md#priority-and-size) and the repository-roadmap standard's [migration tolerance](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/change-management/ki-work-roadmap/references/standards-repository-roadmaps.md#migration-tolerance) carry the contract, and the harness roadmap and Streams checkers already apply it.

`ki` lags the harness today:

- `src/core/work/items.ts` treats `priority` as an unknown field. In a Knowledge Base it warns that "horizon is the only priority signal"; in a roadmap repository it rejects the record as having an unsupported field, so a roadmap record cannot carry `priority` or `size` until `ki` accepts them.
- It tolerates the retired horizons `triage`, `waiting-for` and `parked`, which the harness checker already fails, and reports a missing `kind` only as legacy.
- It still accepts `initiative` and `purpose: adoption`, which the harness has retired.

The contract `ki` should match:

- `priority` is `high`, `medium` or `low`; an absent priority reads as `medium` and never warns or fails.
- `size` is `s`, `m`, `l` or `xl`, `xl` meaning split before Ready; it is required on every record.
- During the field migration window, a missing size, an adopted open record without `kind`, a retired horizon, `initiative` and `purpose: adoption` warn, and `ki work` lists each gap so that owners can backfill by judgement.
- The window closes in the first `ki` release after `ki work` shows no gaps across the estate; from that release each of these fails, as the harness checker then does.
- Capture through `ki` requires a priority and a size.
- `kind: decide`, `resolution_target` and `task_links` stay valid: the harness kept them because other rules depend on them.

## Boundary

This record changes `ki`'s work-record reader, validator, capture and `ki work` listing only. It does not edit any repository's records or backfill sizes; each owner does that. It does not change the harness standard or checker, whose closing of the window is a harness change made in step with the `ki` release that closes it.

## Current state

- `src/core/work/items.ts` rejects `priority` and `size` in a roadmap repository as an "unsupported or repeated field", so `ki repo roadmap list` drops 18 records today: two in apps-observatory.local, 15 in ki-design and one in tools-mgit. In a Knowledge Base the same fields warn as unknown, `priority` with "horizon is the only priority signal".
- The reader marks a retired horizon, `initiative` and an adopted open record without `kind` as `legacy`, accepts `purpose: adoption` silently, and says nothing about a missing size or a theme named beside a Project.
- Text listing orders each lane by lifecycle status, then identifier. JSON items follow identifier order.
- `ki` has no record-capture command: `ki-next` writes new records by hand, so "capture through `ki` requires a priority and a size" has no `ki` surface to change. The harness checker enforces the size at capture.

## Decision

1. **Fields.** `priority` is `high`, `medium` or `low`, read as `medium` when absent; `size` is `s`, `m`, `l` or `xl`. A value outside either vocabulary, and a `ready` record of size `xl`, makes the record unreadable at once, with the harness checker's words: "priority must be high, medium or low", "size must be s, m, l or xl", "a ready record must not be size xl; split it before Ready".
2. **Gaps.** Each record carries the migration-window gaps the harness roadmap checker warns on, in its words: "a record should declare size: s, m, l or xl" on a record that is neither done nor cancelled; "an adopted record should declare kind" on an adopted open record off a retired horizon; "initiative is retired; name the theme in theme"; "the theme comes from the project; do not name it beside the project"; "purpose adoption is retired; use capability or upkeep"; and, for the retired horizons the harness already fails, its "retired: horizon '<h>'; use ..." line. Closed records are exempt from size and kind, as the standard sets. Gaps never fail in this release; `legacy` keeps its present meaning so the JSON projection stays additive.
3. **Listing.** `ki repo roadmap list` text shows a `gaps (<n>)` section with one `<ID>: <gap>` line per gap, and every summary line gains `GAPS=<records with a gap>`, so `ki repo roadmap list --estate --aggregate` gives the window's territory-wide count. `ki repo roadmap summary` names the count beneath its table. JSON items gain `priority` (effective, so `medium` when absent), `size` (or `null`) and `gaps`.
4. **Order.** Within each lane, which already places adoption, holds and horizon, text orders dependency-ready records before those whose `blocked_by` names an open listed record, then by priority, then by size smallest first with no size last, then by the existing status order and identifier. Priority never crosses a lane. Aggregate and grouped views apply the same order within each repository and keep repositories apart, so they still imply no cross-repository priority order. Each item label shows its priority when not `medium` and its size when set.
5. **Window close.** No date logic in `ki`: the fail level ships in the later release that closes the window, at the first complete no-gaps scan or 60 days after the release carrying this record, whichever comes first, in step with the harness checker.

## Steps

- [ ] **Reader.** In `items.ts` add `priority` and `size` to the optional fields with exported `workItemPriorities` and `workItemSizes`, validate them under Decision 1, carry them on `WorkItem`, compute `gaps` under Decision 2, and drop the `priority` note from the unknown-field warning.
- [ ] **Order.** A core comparator for the within-lane selection order under Decision 4, used by the text renderers in `src/commands/repo/roadmap.ts` with repositories kept apart in aggregate views.
- [ ] **Listing and JSON.** Gap section, `GAPS=` summary count, summary-table line and item label in `roadmap.ts` and `roadmap-links.ts`; `priority`, `size` and `gaps` in `roadmap-report.ts`.
- [ ] **Tests** through `run(args, context)` in `src/tests/cli/repo/roadmap.test.ts` and `roadmap-model.test.ts`: the cases in Verify 1 to 5.
- [ ] **Documentation.** `README.md` roadmap paragraphs, `docs/specs/repository-operations.md`, `CHANGELOG.md`; regenerate `man/` if the help text changes.

## Files touched

`src/core/work/items.ts`, `src/core/work/index.ts`, `src/core/work/roadmap-report.ts`, `src/commands/repo/roadmap.ts`, `src/commands/repo/roadmap-links.ts`, `src/tests/cli/repo/roadmap.test.ts`, `src/tests/cli/repo/roadmap-model.test.ts`, `README.md`, `docs/specs/repository-operations.md`, `CHANGELOG.md`.

## Verify

1. A roadmap record with `priority: high` and `size: m` lists, and its JSON item carries both; one without `priority` reads as `medium`.
2. `priority: urgent`, `size: huge`, and `status: ready` with `size: xl`, are each a diagnostic with the harness wording; `size: xl` at `draft` lists.
3. An open record without size, an adopted record without kind, `initiative`, `theme` beside `project`, `purpose: adoption` and a retired horizon each list one gap line in harness wording; a done or cancelled record without size or kind lists none; the summary shows `GAPS=`.
4. Within one lane a blocked record follows a ready one, `high` precedes `medium` and `low`, and among equal priority `s` precedes `xl` and no size comes last; a `high` record at `next` never precedes a `low` one at `now`.
5. A Knowledge Base Streams record with `priority` and `size` draws no unknown-field warning.
6. The repository gate passes (`bun run test`, `tsc`, `biome check .`, `ki repo audit`), and the working-tree `ki` lists all 18 previously dropped records in apps-observatory.local, ki-design and tools-mgit with no diagnostic.

## Dependencies / blocks

None in this repository. The harness work-item format and roadmap checker already carry the contract this record matches.

## Discussion

### Ordering

Accepting the two fields comes first: until a `ki` release accepts them, a roadmap repository cannot record a priority or size without `ki work` rejecting the record, so capture there has to leave them out. The warn level and the gap listing can follow in the same release; the fail level is a later release, gated on the estate showing no gaps.

### Window evidence

The release that closes the window needs evidence that `ki work` shows no gaps across the estate. A territory-wide `ki work` gap count would let the release check that directly rather than by survey.
