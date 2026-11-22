---
id: KI-TOOL-KI-CLI-184
area: CLI
title: Territory rank from store
kind: deliver
purpose: capability
priority: medium
size: s
assignee: work/ki.summit
status: done
blocks: []
blocked_by: []
baseline_ref: 5f855bb8546c710eab9f5b839e295de052318d52
created_at: 2026-11-21T18:45:00Z
updated_at: 2026-11-22T00:34:30Z
---

# KI-TOOL-KI-CLI-184: Territory rank from store

## Goal

`ki` ranks territories by each record's `ki-rank` in the Cairn store's territory register, `roster/territories/<code>/_index.md`, and keeps its configuration copy, `[territories] ranking` in `config.toml`, as the fallback where the store or a record is missing.

## Context

Kris took TERRITORY-RANK a on 21 November 2026, about 16:48 GMT, in Kitteth's bot's Home Chat, recorded in cairn.summit's [80, 4.5](https://github.com/krisb/ki-cairn-store/blob/eae66fca/work/cairn/cairn.summit/80-territories.change.md#45-decided): "a territory's rank is `ki-rank` on its record in the store; `ki`'s rule changes so rank may come from the store, `ki` keeping its configuration copy until it reads the store." Change 80's step 3 built the register, nine records with their ranks under FAMILY-RANK a and TMX-LAST; its step 4 hands this change down to ki.summit, which holds `tools-ki` work while the ki.tools seat is vacant. Kitteth handed it on as TERRITORY-RANK a; Loreward briefed this run.

The ranks are personal 1, knowledge-islands 2, Family 3, humans-not-robots 4, 5ge-principal 5, valle-armonia 6, sacred-inquiry 7, equal-remedy 8 and techmedix 9. TERRITORY-FAMILY a retires `legal` from the ranking; the Family record has no `ki-handle` until `family-principal`'s `.ki.toml` declares the territory, which waits for Kinward.

## Boundary

In scope: reading the register's rank and handle, finding the store as `ki work banner` does, the per-record fallback to the configuration copy, warnings for a malformed record or an unreadable Cairn configuration, and the specification, guide, manual, README and changelog. Out of scope: the configuration copy itself, which is chezmoi's `dot_config/ki/config.toml` and is not this repository's (see Outstanding concerns); territory glyphs, since `ki` shows none; `family-principal`'s declaration; and any release.

## Shaping

**Approach.** A register reader in `src/core/territory/register.ts` returns the handles the register ranks; `rankedCapitals` puts them first and the configuration ranking's other handles after them, then the derived order. The store is found lazily, only for a ranked selection, by a command-layer locator that reuses `ki work banner`'s lookup, `MCP_CAIRN_STORE` then `[store] path` in the rig's `cairn/config.toml`.

- A record ranks a Capital when its `ki-id` is `territory:<folder>`, its `ki-rank` a positive integer and its `ki-handle` a registered Capital's handle. Equal ranks fall to code order; a repeated handle keeps its first rank.
- A record with no rank or handle yet ranks nothing, quietly, as STORE.md leaves an unsettled fact out. A record whose handle this machine does not hold passes quietly, since the register lists every territory.
- A malformed record, an unreadable record's front matter or an invalid field, is a warning naming the file and the fault, and its territory keeps its configuration rank. An unreadable Cairn configuration is a warning, and the configuration ranking applies.

**Acceptance criteria.**

- [x] `--principals`, `ki territory list`, `--estate` and repository selection follow the register's ranks ahead of the configuration copy.
- [x] Without a store, a register or a ranked record, the configuration copy ranks as before.
- [x] A malformed record warns and falls back for its territory only; repository selection, which reports no ranking warnings, still orders by the rest.
- [x] A single `--territory` selection reads neither the store nor the ranking.
- [x] Tests cover reading from the store, the fallback and each malformed record, at the 100% coverage gate; the repository's checks pass.

## Current state

Captured, planned and built on 21 November 2026 by a ki.summit background run on Loreward's brief, from baseline `5f855bb8`; accepted by Kris on 22 November 2026. Unreleased until TOOL-RELEASES is settled.

## Steps

- [x] Add `src/core/territory/register.ts`, reading `roster/territories/*/_index.md` for `ki-id`, `ki-rank` and `ki-handle`.
- [x] Put the register's ranking ahead of the configuration copy in `rankedCapitals`, the store found through a required locator on `TerritoryDirectories`.
- [x] Split `configuredCairnStore` out of `resolveCairnStore` and add `src/commands/shared/cairn-store.ts`, the locator every territory and repository selection passes in.
- [x] Add `src/tests/cli/territory/register.test.ts`.
- [x] Update TERRITORY-006, the territory-selection guide, the README, the manual and its command inventory, and the changelog.
- [x] Run the full gate.

## Files touched

`src/core/territory/register.ts`, `src/core/territory/ranking.ts`, `src/core/territory/resolution.ts`, `src/core/work/package.ts`, `src/core/work/operations.ts`, `src/core/repository/selection.ts`, `src/core/repository/operations/types.ts`, `src/core/repository/operations/selection.ts`, `src/core/repository/operations/conform.ts`, `src/commands/shared/cairn-store.ts`, the territory, repo, trade, batch and registry commands that select repositories, `src/tests/cli/territory/register.test.ts`, `src/tests/work-inventory.test.ts`, `docs/specs/territories.md`, `docs/guides/user/territory-selection.md`, `README.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md` and this record. Not touched: the Cairn store, chezmoi, any release file or version.

## Verify

`bun run test:coverage` at the 100% thresholds, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip`, `bun run ki:tools:lint-man`, `bun scripts/generate-command-inventory.ts` with no drift, rumdl, and `ki repo audit --repo .` adding no failure to those on `main`. Then `ki territory list` on sol, with the rig's store, lists the territories in the register's order.

## Dependencies / blocks

None to build. Going out waits on TOOL-RELEASES, parked with Kris; until then the primary checkout's `ki` runs it from `main`.

## Documentation impact

### Decision Records

None; TERRITORY-RANK a is recorded in cairn.summit's change 80.

### Specifications

TERRITORY-006, now Territory ranking, in `docs/specs/territories.md`.

### Guides

The territory-selection guide's Rank your territories section and the README.

### Roadmap

This record only.

## Review

### Delivered

- `ki` reads each territory's rank from the store's register and joins it to its Capital by `ki-handle`; the configuration copy ranks only what the register does not.
- Every territory and repository selection passes the same lazy store locator, so `ki territory` and `ki repo --estate` or `--principals` agree.

### Change Summary

- `src/core/territory/register.ts` is new: it reads the register's records and returns the handles they rank.
- `src/core/territory/resolution.ts` ranks the register's handles ahead of the configuration copy's; `TerritoryDirectories` gains a required `store` locator, and `ranking.ts` exports its handle grammar for the register to share.
- `src/core/work/package.ts` splits `configuredCairnStore` out of `resolveCairnStore`, which `ki work banner` still uses unchanged.
- `src/commands/shared/cairn-store.ts` is the locator; the territory commands, and every command and operation context that selects repositories, pass it in.
- The specification, guide, README, manual, command inventory and changelog describe the register as the ranking's first source.

### Verification

`bun run test:coverage`: 87 files, 1,407 tests, 100% statements, branches, functions and lines, 5 of them in the new `register.test.ts`. Typecheck, Biome, the manual lint, the command inventory and rumdl pass; knip and `ki repo audit --repo .` report only what `main` reports.

### Outstanding concerns

- **The configuration copy still holds `legal`.** It is chezmoi's `dot_config/ki/config.toml`, outside this repository, and chezmoi's template test pins that ranking to the territories `rigs.yaml` homes, which still include `legal`. With the register in place, `legal` has no record, so it falls back to its configuration rank after the nine the register ranks. Dropping it, and bringing the copy to the register's order, is a chezmoi change, with `rigs.yaml` beside it; it is handed back to Loreward. The handle `legal` itself still comes from the stale `legal-principal` entry in this machine's local registry.
- **Family is not ranked.** Its record carries no `ki-handle`, so it ranks nothing until `family-principal` declares the territory, as the register intends.
- **Glyphs are not read.** `ki` shows no territory glyph anywhere; reading `ki-glyph` waits for a surface that shows it.
- **`ki-status` is not read.** Its values are an open gap in change 80.

### Post-change review

The change reads only. Its wider reach is the new required `store` locator on repository selection and the two operation contexts, so a future caller must say where the register is or pass a locator that finds none.

### Mini recap

Territories rank by the store's register, with the configuration copy as the per-territory fallback.

## Done

Accepted 22 November 2026 by Kris on the review packet above.

## Discussion

### Acceptance

Kris answered ACCEPT-CLI184 on Orca item 54, 22 November 2026, about 00:20 UTC: "Accept it (recommended, high confidence)". The answer is recorded in ki.summit's change 14, 4.2 Decided, in the Cairn store, `work/ki/ki.summit/14-ki-command-surface.change.md`. The first outstanding concern, `legal` in the configuration copy, went to chezmoi under LEGAL-CONFIG a on Orca item 55 at the same time; the release waits on TOOL-RELEASES.

### Why the fallback is per territory

TERRITORY-RANK a keeps the configuration copy "until it reads the store". Reading the register whole or not at all would drop a territory the register does not yet rank, such as Family before its handle is settled, so each territory falls back on its own: the register's ranks lead, the copy's other handles follow in its order, and the derived order closes. Once the copy agrees with the register, the two give the same order.

### Why the store is found lazily

A single `--territory` selection reads no ranking, and most `ki repo` commands select by `--repo`, so the locator runs only for a ranked selection. An unreadable Cairn configuration therefore warns only where a ranking was needed.
