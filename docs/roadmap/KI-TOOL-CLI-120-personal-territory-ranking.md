---
id: KI-TOOL-CLI-120
area: CLI
title: Personal territory ranking
kind: deliver
purpose: capability
project: estate-factorisation
component: territory
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 104ab7b62a7e1fe0be647055286b73ffbb07a9ea
created_at: 2026-10-12T04:33:13Z
updated_at: 2026-10-12T05:11:30Z
---

# Personal Territory Ranking

## Goal

A user can rank territory handles in their own `ki` configuration, and every multi-territory ordering follows it: `--principals`, `ki territory list` and `--estate`. Without a ranking, or for territories it omits, the current derived order applies.

## Context

Master state-of-play Decision 95 (12 October 2026, 05:28 BST) records Kris's ranking of territories by where Kris should spend most time - personal, knowledge-islands, legal, humans-not-robots, valle-armonia, sacred-inquiry, techmedix, equal-remedy - and asks that `--principals`, Zed opening and the estate follow it. The ranking is a personal, user-level preference, not public governance, so it belongs in the user configuration (`config.toml`), not in a Capital's `.ki.toml`, and it falls back to the current derived order when unset. The decision grants delivery to `main` and push; it grants no acceptance, release or Homebrew publish.

`KI-TOOL-CLI-119` (commit `311c762`, closed in `24d9fd9`, since pruned) delivered `--principals` with the derived order in [TERRITORY-005](../specs/territories.md#territory-005--principals-selection): the system Capital first, then territory name, then handle. `mgit --principals` consumes `ki territory roots --null --principals`, so it inherits the ranking without change.

## Boundary

- In scope: a `[territories] ranking` list of handles in `config.toml`, its strict shape validation, ranked ordering of `--principals`, `ki territory list` and `--estate`, warnings for ranked handles no registered Capital declares, and the specification, guide, manual, README and tests.
- Out of scope: single-territory ordering (`--territory`), which keeps physical-path order because the ranking orders territories, not repositories within one; Capital metadata; Warp tabs and other non-`ki` consumers; editing the user's chezmoi source.

## Current state

[Territory resolution](../../src/core/territory/resolution.ts) sorts discovered Capitals by handle for `ki territory list`, orders `--principals` by the derived rule, and sorts `--estate` roots by physical path. Commands pass only the state directory. The user configuration already carries strictly validated optional tables read tolerantly by [the MCP inventory reader](../../src/core/storage/mcp-inventory.ts).

## Steps

- [x] Read an optional `[territories]` table from `config.toml`: only `ranking`, an array of distinct handle-shaped strings; anything else fails as a configuration error.
- [x] Order territories by ranking position, then by the derived order; apply it to `--principals` and `ki territory list`.
- [x] Order `--estate` roots by the ranked territory that declares them, physical path within each, and leave unranked roots in their current path order after them.
- [x] Warn on standard error from `ki territory` commands about ranked handles no registered Capital declares, without failing.
- [x] Prove ordering, fallback, partial rankings, unknown handles and configuration errors through the public CLI; update TERRITORY-005 with a new ranking requirement, the territory-selection guide, `man/ki.1` and README.

## Files touched

Territory resolution and a new ranking reader in `src/core/territory/`, the territory commands and repository selection, CLI tests, `docs/specs/territories.md`, the territory-selection guide, README and `man/ki.1`. Exact delivered paths are recorded in Review.

## Verify

Public CLI tests at 100% coverage, TypeScript, Biome, Markdown and manual lint, the command inventory check, and the compiled executable run against the live registry with a temporary configuration carrying Kris's ranking. The committed `ki` drives `mgit --principals` to show the ranked order with no mgit change.

## Dependencies / blocks

None. KI-TOOL-CLI-118 may add handle aliases; the ranking names canonical handles, so an alias in the ranking is an unknown handle until that work decides otherwise.

## Documentation impact

### Decision Records

None; Decision 95 is recorded in the Master decisions log and summarised here.

### Specifications

TERRITORY-005 names the ranking as the first ordering key; a new TERRITORY-006 specifies the configuration, fallback, estate grouping and warnings.

### Guides

The territory-selection guide gains a ranking section with the configuration snippet.

### Roadmap

Approved immediate delivery stops at Awaiting review.

## Review

### Delivered

An optional `[territories] ranking` of handles in `$XDG_CONFIG_HOME/ki/config.toml` now leads `--principals`, `ki territory list` and `--estate`. Territories it omits keep the derived order (Knowledge Islands first, then by name); estate roots group by their earliest-ranked territory, path order within each, and the rest keep path order. `--territory` neither reads nor applies it. Ranked handles no registered Capital declares produce a `ki: warning:` from `ki territory` commands and never fail; a malformed table fails with exit 1. Unset behaviour is unchanged except that `ki territory list` now uses the derived order (system Capital first) instead of handle order, so it agrees with `--principals`.

### Change Summary

- `src/core/territory/ranking.ts` reads and strictly validates the ranking, leaving a missing or unreadable file to the existing configuration reader.
- `src/core/territory/resolution.ts` replaces the principals order with a ranked territory order, applies it to principals, list and estate, and reports unknown handles through an optional warning callback; `resolveTerritory` and `listTerritories` take state and configuration directories.
- `src/commands/territory/index.ts` and `inspect.ts` pass the configuration directory and write warnings to standard error; `src/core/repository/selection.ts` passes the configuration directory, so `ki repo` scopes follow the ranking.
- `src/tests/cli/territory/ranking.test.ts` proves the fallback, partial ranking across principals, list, estate, filters, a single territory, repository and Zed opening, warnings and malformed configuration.
- TERRITORY-005 now orders by territory order; new TERRITORY-006 specifies the ranking. The territory-selection guide gains "Rank your territories", README and `man/ki.1` describe it, and `man/ki.commands.json` is regenerated.

### Verification

- `bun run test:coverage`: 67 files, 1,125 tests passed, 100% statements, branches, functions and lines.
- TypeScript, Biome on the changed files, `mandoc -T lint`, command inventory check and `rumdl` passed.
- `ki repo audit`: the roadmap and documentation criteria pass. Remaining findings are pre-existing on `main`: KNIP-2 (unused `src/core/estate/index.ts` exports from `ki estate converge`), CI-1 and HOOK-1 warnings. One audit run saw `roadmap.test.ts` "restores the records ... when the runner throws during a commit" fail once; it passed on rerun and in the full coverage gate, so it looks flaky and untouched by this change.
- Compiled `dist/ki` against the live registry with a temporary configuration carrying Kris's ranking: `territory roots --principals` and `territory list` returned personal, knowledge-islands, legal, humans-not-robots, valle-armonia, sacred-inquiry, techmedix, equal-remedy; `roots --estate` grouped roots in that order; with no configuration the order stayed ki, er, hnr, legal, personal, si, tmx, va.

### Outstanding concerns

- `ki repo` and `ki registry` scopes follow the ranking but do not print unknown-handle warnings; only `ki territory` commands do.
- The user configuration is chezmoi-managed; the ranking takes effect once the master thread applies the snippet.
- Warp tabs and other non-`ki` consumers named in Decision 95 are outside this repository.

### Post-change review

The ranking is one extra leading sort key over the existing Capital discovery; no handle, alias or membership semantics changed, so KI-TOOL-CLI-118 is unaffected. Estate grouping applies only when a ranking is set, keeping unset estate output byte-identical.

### Mini recap

Decision 95 delivered as a personal configuration key with derived fallback. Not accepted or pruned; no release.

## Discussion

### Approval

Decision 95 authorises delivery, commit to `main` and push after full gates, with the record left Awaiting review for Kris.
