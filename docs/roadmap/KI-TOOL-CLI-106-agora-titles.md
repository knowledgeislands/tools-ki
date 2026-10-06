---
id: KI-TOOL-CLI-106
area: CLI
title: Agora titles
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T11:15:00Z
updated_at: 2026-10-06T11:15:00Z
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

- [ ] `src/core/agora/declarations.ts`: accept and require `title` as a non-empty, single-line string without surrounding whitespace, failing with `home requires a non-empty single-line title`.
- [ ] `src/core/agora/types.ts` and `src/core/agora/profiles.ts`: rename the profile `name` to `title`, carry the declared title, and keep `Registered estate` for the system estate.
- [ ] `src/commands/agora/list.ts` and `src/commands/agora/show.ts`: present the title; `show` prints `title:`.
- [ ] Tests under `src/tests/cli/agora/`: titled fixtures, exact list and show output, and malformed-title cases (missing, blank, padded, multi-line, non-string).
- [ ] Documentation: AGORA-017 in `docs/specs/agoras.md`, the README Agoras paragraph and `man/ki.1`.

## Files touched

- `src/core/agora/declarations.ts`, `src/core/agora/types.ts`, `src/core/agora/profiles.ts`
- `src/commands/agora/list.ts`, `src/commands/agora/show.ts`
- `src/tests/cli/agora/agora.test.ts`, `audit.test.ts`, `inspect.test.ts`, `references.test.ts`
- `docs/specs/agoras.md`, `README.md`, `man/ki.1`

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

`README.md` and `man/ki.1` describe the required title.

### Roadmap

This record.

## Discussion

### Cross-repository relationship

This item receives the CLI handoff from KI-ARCADIA-GOV-017 and pairs with KI-HARNESS-GOV-143. The relationship is non-blocking in both directions: no record lists another in `blocks` or `blocked_by`, and each repository accepts its own delivery.

### Release window

The released `ki` v0.6.1 rejects `title` as an unrecognised key. Once owners declare titles, the released binary fails `ki agora` and `ki repo --agora` resolution until a `ki` release includes this item. No release is cut here.
