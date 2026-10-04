---
id: KI-TOOL-CLI-102
area: CLI
title: One Granola Attendees heading
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 5f7ee0f12308b7cfe4bb0a3ea8e6fe165e2bee52
created_at: 2026-10-04T12:19:44Z
updated_at: 2026-10-04T16:39:39Z
---

# One Granola Attendees heading

## Goal

An acquired Granola meeting document carries at most one `## Attendees` heading, on first import and on every re-import, so the receiving Knowledge Base does not inherit a duplicate-heading Markdown finding from the importer.

## Context

Handoff from kit-principal `KIT-010`, relayed by the estate coordinator on 2026-10-04 (non-blocking). `renderGranolaMeeting` in `src/core/acquire/granola/markdown.ts` emits its own `## Attendees` section from the participant list, then appends the source summary with its headings normalised so the shallowest becomes level two. A Granola summary that opens with its own `Attendees` heading therefore produced two `## Attendees` headings, and because re-import re-renders the whole document, a hand repair in the receiver was overwritten on the next run.

## Boundary

Only the importer's own Attendees section. The source summary is rendered faithfully and keeps its heading and list; participants remain in frontmatter either way. No other heading collision, no change to summary normalisation, and no receiver-side repair of already imported documents.

## Current state

Delivered: the importer omits its own section when the rendered summary already carries a level-two `Attendees` heading.

## Steps

- [x] Reproduce with a focused CLI test whose summary carries `### Attendees`, asserting one `## Attendees` after first import and after re-import.
- [x] Skip the importer's Attendees section when the rendered summary already has a level-two `Attendees` heading, keeping the participant frontmatter.

## Files touched

`src/core/acquire/granola/markdown.ts`, `src/tests/cli/acquire/granola.test.ts`, and this record.

## Verify

The new test fails before the change (two headings) and passes after it; `bun run test:coverage`, `bunx tsc --noEmit -p .`, `bunx biome check` and `ki repo audit` pass.

## Dependencies / blocks

None. The originating kit-principal item `KIT-010` is not blocked by this record; receivers already holding duplicated headings repair them under their own authority.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

None; the acquisition guide does not describe section layout.

### Roadmap

`docs/roadmap/_ISSUES.md` advances `CLI` to `102`.

## Review

### Delivered

Granola acquisition no longer writes a second `## Attendees` heading when the source summary already carries one, on first import or re-import.

### Change Summary

- `renderGranolaMeeting` tests the rendered summary for a level-two `Attendees` heading and omits the importer's own section when present; participants stay in frontmatter.
- A CLI test imports a meeting whose summary opens with `### Attendees`, asserts exactly one `## Attendees` with the source list and a preserved `## Decisions`, then re-imports and asserts one heading again.

### Verification

- New test failed before the change (`expected 2 to have length 1`) and passes after it.
- `bun run test:coverage`: 962 tests pass; `bunx tsc --noEmit -p .` clean; `bunx biome check` clean on the touched files; `ki repo audit` PASS.

### Outstanding concerns

A source heading named differently (for example `Participants`) still sits beside the importer's section; that is not a duplicate heading and is left alone.

### Post-change review

The fix keeps the source's own list rather than the importer's prose list, which is the more faithful choice; documents previously imported keep their duplicate until the next amendment-triggered re-import rewrites them.

### Mini recap

One-line importer guard plus a two-pass regression test closes the KIT-010 duplicate Attendees handoff.

## Done

Accepted 2026-10-04 on the review packet above, under the owner's delegated estate-push authority following an independent Fable review. The reviewer confirmed both Steps against ac963ab: `renderGranolaMeeting` omits its own section only when the rendered summary already carries a level-two `Attendees` heading, participants stay in frontmatter, and the two-pass CLI test asserts one heading after import and re-import. Re-run on HEAD: `bun run test:coverage` (962 tests, 100% coverage), `bunx tsc --noEmit -p .`, Biome on the touched files and `ki repo audit` all pass. Nit: a source heading named otherwise still sits beside the importer's list, as Outstanding concerns records; no action needed.

## Discussion

### Origin

Captured and adopted on 2026-10-04 under the owner's delegated estate-push authority from the coordinator's relay of kit-principal `KIT-010`; small and clear, so delivered in the same session.
