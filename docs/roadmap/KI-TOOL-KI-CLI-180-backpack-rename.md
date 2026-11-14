---
id: KI-TOOL-KI-CLI-180
area: CLI
title: Backpack rename
kind: deliver
purpose: upkeep
component: backpack
priority: high
size: m
assignee: run/backpack-rename
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 099bba9a3a82e45421d07c82ef55d045ef48f955
created_at: 2026-11-14T13:45:00Z
updated_at: 2026-11-14T14:10:00Z
---

# KI-TOOL-KI-CLI-180: Backpack rename

## Goal

`ki` names backpacks "backpack" everywhere it speaks or writes: the `ki backpack` command group, the `[repo] backpacks` key, the `[backpacks]` table in its own configuration, the `$XDG_DATA_HOME/ki/backpacks/` data folder, its help, errors, specifications and guides. The only "harness" left is in the deliberate one-release compatibility paths, and in ids such as HARN-004, which are history.

## Context

Kris approved the rename on 14 November 2026 (TOOL-RENAME a). Knowledge Islands had already renamed its eight `*-agentic-harness` repositories to `*-agent-backpack`, the skill `ki-repo-harness` to `ki-repo-backpack`, and the concept "harness" to "backpack". ki 0.16.0 and 0.16.1 read the new repository names, the `[skills.ki-repo-backpack]` prefix table and the skill `backpack` key (HARN-004), but still use the old name on their own surface. Kris wants this rename complete and final, so that nobody has to go through it again.

A second defect is in scope. Reinstalling a renamed backpack reused the slot already on disk, so a slot under its retired `*-agentic-harness` name kept that name. Sol's housekeeper renamed the Humans not Robots slot by hand overnight.

## Boundary

In scope: tools-ki's own command surface, configuration keys, data folder, internal names, tests, specifications, guides, manual and README. Out of scope: other repositories' `.ki.toml` files, the chezmoi-managed user configuration, the installed `ki` on any rig, the real `~/.local/share/ki`, the version, tags, releases and the Homebrew tap. Decision records, roadmap and idea records keep their wording, because they are history.

## Current state

Planned in a detached linked worktree from `main` at `61a6e204`. On sol the installed `ki` runs the primary checkout's `src/main.ts`, so fast-forwarding the primary checkout installs this change. Landing waits for Kris's word.

## Steps

- [ ] Rename the surface and internal names: the command group, `[repo] backpacks`, the `[backpacks]` configuration table, the `backpacks/` data folder, modules, types, tests, help text, errors, specifications, guides, manual and README, keeping HARN, ADR, PDR, GDR and record ids.
- [ ] Keep `ki harness` for one release as a hidden alias that prints a one-line deprecation notice to stderr.
- [ ] Read `[repo] harnesses` for one release when `backpacks` is absent, with a warning, and refuse a declaration that has both. `ki repo init` writes `backpacks`, and `ki repo repair` renames the retired key.
- [ ] Read the retired `[harnesses]` configuration table the same way, refuse both, and write `[backpacks]` whenever ki writes the file.
- [ ] Move `harnesses/` to `backpacks/` on the first command by one rename, and leave `harnesses` as a relative link to `backpacks` for one release, so that every existing absolute skill link keeps resolving. Development slots, which are absolute links to checkouts, move unchanged.
- [ ] Normalise a slot still under its retired `*-agentic-harness` name to its backpack name, leaving a one-release alias, so that install, reinstall and refresh always write the backpack slot.
- [ ] Re-point links that still pass through a retired path: `ki repair --apply` for user skills, `ki repo repair` for repository skills, and any relink. `ki doctor` and `ki repo diag` report them.
- [ ] Add CLI contract tests for each compatibility path and the migration, with temporary data directories only. Update specifications with a `_Verify:_` test for each MUST.
- [ ] Run the full gate, including 100% coverage.

## Files touched

All tracked product, test, specification, guide, manual and README files that name the harness; `docs/specs/harnesses.md` becomes `docs/specs/backpacks.md`, and every link to it is updated. Also this record and `CHANGELOG.md`. Not touched: `docs/decisions/`, `docs/roadmap/` apart from this record, `docs/ideas/`, or any other repository.

## Verify

`bun run test:coverage` at 100% thresholds, `bunx tsc --noEmit`, `bunx biome check`, `bun run ki:tools:lint-man`, the regenerated command inventory, and `ki repo audit --repo .` run from this checkout. Before review, a bounded search for "harness" across product, test and documentation sources shows only compatibility paths and historical ids.

## Dependencies / blocks

None to build. Landing waits for Kris's release word. After the release, each rig installs the new `ki`, runs one command to migrate its data folder, and repairs links. Then the `.ki.toml` files are rewritten, and the chezmoi source of `~/.config/ki/config.toml` changes to `[backpacks]`. Both must wait until every rig runs the new `ki`, because 0.16.1 requires the retired keys.

## Documentation impact

### Decision Records

None new. The compatibility window follows the HARN-004 precedent and the product standard's bounded-transition rule.

### Specifications

HARN moves to `docs/specs/backpacks.md`, keeps its ids, gains requirements for the data-folder migration, the retired keys, the command alias and slot normalisation, and each has a `_Verify:_` test.

### Guides

User and developer guides, the README and the manual say "backpack" and describe the one-release compatibility.

### Roadmap

This record only.

## Discussion

### Links across the move

Every managed skill link is absolute. A link into an installed slot names `…/ki/harnesses/<owner>/<name>/skills/<skill>`, and a development-mode link names the checkout directly. A bare rename would break the first kind. A relative `harnesses -> backpacks` link left behind for one release keeps them resolving, so the migration has to re-point nothing. Relinking replaces any link whose text still passes through a retired path, and `ki repair --apply` with `ki repo --estate repair` re-points the rest before the next release removes the aliases.
