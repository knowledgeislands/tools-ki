---
id: KI-TOOL-CLI-106
area: CLI
title: Agora titles
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: d2312360b500152933c69d99f3661231a2c49ee9
created_at: 2026-10-06T11:15:00Z
updated_at: 2026-10-06T12:40:00Z
---

# Agora titles

## Goal

`ki` parses the required owner-declared `title` on every `[skills.ki-agora.<id>]` declaration, rejects a missing or malformed title, and shows it to people in `ki agora list` and `ki agora show`, while the identifier stays the only machine key.

## Context

The owner approved [KI-ARCADIA-GOV-017](https://github.com/knowledgeislands/ki-arcadia-principal/blob/main/Streams/Roadmap/KI-ARCADIA-GOV-017-agora-identifiers-and-titles.md) on 2026-10-06: "Agora titles - KI-ARCADIA-GOV-017 - yes please … process as much as possible." It separates an Agora's stable identifier, used for selection and for folders such as `-/_CONTEXT/chatgpt/<agora-id>/`, from a readable title shown to people. The decision there makes `title` mandatory, with no identifier fallback. [KI-HARNESS-GOV-143](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-143-agora-titles.md) amends the `ki-agora` standard, rubric and GDR-KI-HARNESS-006 to the same rule; this item is the CLI half.

## Boundary

- Parse, validate and present the declared title; the identifier remains the only key for selection, lookups, `ki agora roots`, projections and folder paths.
- Do not add an identifier fallback, a compatibility mode for untitled declarations or title uniqueness.
- Do not edit owner `.ki.toml` declarations, the `ki-agora` standard or rubric, cut a release or publish.

## Current state

`homeDeclaration` in `src/core/agora/declarations.ts` accepts only `purpose`, `members` and `includes`, so a declaration carrying `title` fails as an unrecognised key and breaks `ki agora` and `ki repo --agora` resolution. `AgoraProfile.name` repeats the identifier for declared Agoras and holds `Registered estate` for the system estate; `ki agora list` prints it after the identifier and `ki agora show` prints it as `name:`.

## Steps

- [x] `src/core/agora/declarations.ts`: accept and require `title` as a non-empty, single-line string without surrounding whitespace, failing with `home requires a non-empty single-line title`.
- [x] `src/core/agora/types.ts` and `src/core/agora/profiles.ts`: rename the profile `name` to `title`, carry the declared title, and keep `Registered estate` for the system estate.
- [x] `src/commands/agora/list.ts` and `src/commands/agora/show.ts`: present the title; `show` prints `title:`.
- [x] Tests under `src/tests/cli/agora/`: titled fixtures, exact list and show output, and malformed-title cases (missing, blank, padded, multi-line, non-string).
- [x] Documentation: AGORA-017 in `docs/specs/agoras.md`, the README Agoras paragraph, `CHANGELOG.md`, `man/ki.1` and the regenerated `man/ki.commands.json`.

## Files touched

- `src/core/agora/declarations.ts`, `src/core/agora/types.ts`, `src/core/agora/profiles.ts`
- `src/commands/agora/list.ts`, `src/commands/agora/show.ts`
- `src/tests/cli/agora/agora.test.ts`, `audit.test.ts`, `inspect.test.ts`, `references.test.ts`
- `docs/specs/agoras.md`, `README.md`, `CHANGELOG.md`, `man/ki.1`, `man/ki.commands.json`

## Verify

```bash
bun run test:coverage
bunx tsc --noEmit
bunx biome check .
bun run ki:tools:lint-man
ki repo audit --repo . --progress never --concise
```

Coverage stays at 100%, biome reports no errors and the audit reports FAIL=0.

## Dependencies / blocks

No local dependency. The cross-repository relationship is recorded under Discussion.

## Documentation impact

### Decision Records

None in this repository; the contract decision is recorded in GDR-KI-HARNESS-006 through KI-HARNESS-GOV-143 and the mandatory choice in KI-ARCADIA-GOV-017.

### Specifications

`docs/specs/agoras.md` gains AGORA-017 for the declared title.

### Guides

`README.md`, `CHANGELOG.md` and `man/ki.1` describe the required title.

### Roadmap

This record.

## Review

### Delivered

The approved boundary: `ki` parses and requires the declared Agora `title`, presents it in `ki agora list` and `ki agora show`, and keeps the identifier as the only selector and machine key. Excluded: owner declarations, the `ki-agora` standard and rubric (KI-HARNESS-GOV-143), identifier fallback, compatibility mode, title uniqueness, releases and publication. Baseline `d2312360b500152933c69d99f3661231a2c49ee9`; the delivery commits follow it on `main`.

### Change Summary

- `src/core/agora/declarations.ts`: `homeDeclaration` admits `title` and fails closed with `home requires a non-empty single-line title` when it is missing, non-string, empty, padded, or contains CR, LF, U+2028 or U+2029, before `purpose` is checked. The rule matches the harness CONFIG-1 check.
- `src/core/agora/types.ts`, `profiles.ts`: the profile `name` becomes `title`; declared Agoras carry the owner's title and the estate keeps `Registered estate`.
- `src/commands/agora/list.ts`, `show.ts`: `list` prints `<id> [declared] <title> (...)`; `show` prints `title: <title>`. Roots, selection, projections and editor targets still use only the identifier.
- Tests under `src/tests/cli/agora/`: titled fixtures whose titles differ from identifiers, exact list and show output, and every malformed-title form.
- Documentation: AGORA-017, README, CHANGELOG, `man/ki.1` and the regenerated `man/ki.commands.json`.
- No approved deviations.

### Verification

- `bun run test:coverage`: all files and tests pass at 100% statement, branch, function and line coverage.
- `bunx tsc --noEmit`: clean.
- `bunx biome check .`: no errors; warnings and infos unchanged from the baseline.
- `bun run ki:tools:lint-man`: clean.
- `ki repo audit --repo . --progress never --concise` in an isolated environment that registers this worktree against a harness including KI-HARNESS-GOV-143: PASS.
- Against the seven titled owner repositories, this build's `ki agora list` shows every declared title and `ki agora audit` reports HEALTHY=7 FINDINGS=0.

### Outstanding concerns

None in this item. Released `ki` v0.6.1 rejects `title` as an unrecognised key, so `ki agora` and `ki repo --agora` fail with the installed binary until a `ki` release includes this item; the owner has accepted that window and the coordinator holds the release.

### Post-change review

Goal met: the CLI enforces the same title rule as the rubric and shows the title without changing any machine interface. Fable review found no blocking issue; its CHANGELOG finding and the Unicode line-separator and test-case observations are addressed. Regression risk is confined to untitled declarations, which now fail by design; every locally registered owner declares a title. Ready for acceptance.

Review outcome: Fable's first review found no blocking issue; its CHANGELOG finding, Unicode line-separator and test-case nits are addressed in the follow-up commit. A focused Fable re-review confirmed each fix, with the remaining correction being this baseline after rebasing onto `main`. Gates were rerun after the rebase: 1051 tests passing at 100% coverage and the audit passing.

### Mini recap

Required Agora titles are parsed, validated and presented by `ki` with full coverage and passing gates; the open matter is the owner-held `ki` release. Learning route: none proposed beyond KI-ARCADIA-GOV-017.

## Done

Accepted 2026-10-06 by Kris Brown on review packet above.

## Discussion

### Cross-repository relationship

This item receives the CLI handoff from KI-ARCADIA-GOV-017 and pairs with KI-HARNESS-GOV-143. The relationship is non-blocking in both directions: no record lists another in `blocks` or `blocked_by`, and each repository accepts its own delivery.

### Release window

The released `ki` v0.6.1 rejects `title` as an unrecognised key. Once owners declare titles, the released binary fails `ki agora` and `ki repo --agora` resolution until a `ki` release includes this item. No release is cut here.
