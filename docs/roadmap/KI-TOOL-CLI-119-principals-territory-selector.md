---
id: KI-TOOL-CLI-119
area: CLI
title: Principals territory selector
kind: deliver
purpose: capability
project: estate-factorisation
component: territory
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: 3de097d0dbb140769db0dee7f936296de408a63c
created_at: 2026-10-12T04:03:08Z
updated_at: 2026-10-12T04:03:08Z
---

# Principals Territory Selector

## Goal

Every `ki` command that accepts `--estate` also accepts `--principals`, which selects only the registered territory Capitals in a stable order: the system Capital first, then the rest alphabetically by territory name. `ki territory open --principals --target zed` opens them so Zed's project list follows that order.

## Context

Master state-of-play Decision 82 (12 October 2026, 05:55 BST) asks for a `--principals` selector wherever `--estate` exists, particularly for `ki territory open`, with Knowledge Islands Principal first and the other Principals alphabetical. The decision is the delivery authority; it grants no acceptance, release or Homebrew publish.

The selector contract is tools-ki's own: [territory selection](../specs/territories.md) TERRITORY-002 and its repository, audit and registry counterparts. KI Specifications carries no territory selector text, so no handoff is needed. The accepted territory-selection decision in the KI Principal predates this third primary scope; it is an additive selector over the same Capital discovery, not a membership change.

## Boundary

- **In:** the `--principals` scope in territory, repository and registry selection; its ordering rule; target-order proof for Zed, VS Code and Delta; tools-ki specifications, guides, README, help and manual; public CLI tests.
- **Out:** Capital metadata or `.ki.toml` changes in any repository, territory aliases (KI-TOOL-CLI-118), release and Homebrew publication.

## Current state

[Territory resolution](../../src/core/territory/resolution.ts) discovers registered Capitals and resolves either one territory's members or the whole registered estate, sorting roots by physical path. [Repository selection](../../src/core/repository/selection.ts) delegates both scopes to it and rejects combinations with `--repo`. `--estate` is declared by `ki territory` (show, roots, audit, open, inspect), `ki repo` and `ki registry`; `ki repo init` and `ki registry list`/`remove` reject it. Trade commands treat a territory or estate parent selection as aggregate.

[Zed opening](../../src/core/territory/targets/zed.ts) reverses the projection and adds the owner last because Zed prepends each opened folder. VS Code receives all roots in one `--new-window` invocation in order; Delta opens roots sequentially in order.

## Steps

The system Capital is the registered Capital whose `territory_members` contain the canonical KI Harness, `https://github.com/knowledgeislands/ki-agentic-harness`, which `ki` already treats as its default Harness. It sorts first. The remaining Capitals sort by territory name with English collation, ties by handle. Without such a Capital, every Capital sorts by name. This derives Knowledge Islands Principal's position from membership rather than a path, key or title.

- [ ] Add `principals` to territory selection: exactly one of `--territory`, `--estate` or `--principals`; filters narrow Capital basenames; every selected Capital is validated as an owner root; the profile keeps the ordering above instead of path order.
- [ ] Add the option and conflict wording to `ki territory` subcommands (including `inspect`), `ki repo`, `ki registry`, `ki repo init`, `ki registry list`/`remove` rejection and trade aggregate selection.
- [ ] Prove the Zed, VS Code and Delta invocation order through recorded runner calls.
- [ ] Update specifications, user guides, README, help text and manual; regenerate inventories where tooling requires it.

## Files touched

Territory and repository selection core, the commands that declare `--estate`, their CLI tests, the territory, repository-audit and registry specifications, the territory-selection guide, README and `man/ki.1`. Exact delivered paths are recorded in Review.

## Verify

Public CLI tests with 100% coverage, TypeScript, Biome, Markdown and manual lint, command inventory and a compiled executable run of `ki territory show --principals` against the live registry.

## Dependencies / blocks

None. KI-TOOL-CLI-118 will extend handle resolution with aliases; `--principals` takes no handle, so the two do not overlap.

## Documentation impact

### Decision Records

None; Decision 82 is recorded in the Master decisions log and summarised here.

### Specifications

TERRITORY-002 gains the third primary scope and its ordering; repository-audit and registry selector requirements name it.

### Guides

The territory-selection guide gains a principals section.

### Roadmap

Approved immediate delivery that stops at Awaiting review.

## Discussion

### Approval

Decision 82 authorises delivery, merge to `main` and push after full gates, with the record left Awaiting review for Kris.
