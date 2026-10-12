---
id: KI-TOOL-CLI-119
area: CLI
title: Principals territory selector
kind: deliver
purpose: capability
project: estate-factorisation
component: territory
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 3de097d0dbb140769db0dee7f936296de408a63c
created_at: 2026-10-12T04:03:08Z
updated_at: 2026-10-12T04:16:48Z
---

# Principals Territory Selector

## Goal

Every `ki` command that accepts `--estate` also accepts `--principals`, which selects only the registered territory Capitals in a stable order: the system Capital first, then the rest alphabetically by territory name. `ki territory open --principals --target zed` opens them so Zed's project list follows that order.

## Context

Master state-of-play Decision 82 (12 October 2026, 05:55 BST) asks for a `--principals` selector wherever `--estate` exists, particularly for `ki territory open`, with Knowledge Islands Principal first and the other Principals alphabetical. The decision is the delivery authority; it grants no acceptance, release or Homebrew publish.

The selector contract is tools-ki's own: [territory selection](../specs/territories.md) TERRITORY-002 and its repository, audit and registry counterparts. KI Specifications carries no territory selector text, so no handoff is needed. The accepted territory-selection decision in the KI Principal predates this third primary scope; it is an additive selector over the same Capital discovery, not a membership change.

Ordering rule: the system Capital is the registered Capital whose `territory_members` contain the canonical KI Harness, `https://github.com/knowledgeislands/ki-agentic-harness`, which `ki` already treats as its default Harness. It sorts first. The remaining Capitals sort by territory name with English collation, ties by handle. Without such a Capital, every Capital sorts by name. This derives Knowledge Islands Principal's position from membership rather than a path, key or title.

## Boundary

- **In:** the `--principals` scope in territory, repository and registry selection; its ordering rule; target-order proof for Zed, VS Code and Delta; tools-ki specifications, guides, README, help and manual; public CLI tests.
- **Out:** Capital metadata or `.ki.toml` changes in any repository, territory aliases (KI-TOOL-CLI-118), release and Homebrew publication.

## Current state

[Territory resolution](../../src/core/territory/resolution.ts) discovers registered Capitals and resolves either one territory's members or the whole registered estate, sorting roots by physical path. [Repository selection](../../src/core/repository/selection.ts) delegates both scopes to it and rejects combinations with `--repo`. `--estate` is declared by `ki territory` (show, roots, audit, open, inspect), `ki repo` and `ki registry`; `ki repo init` and `ki registry list`/`remove` reject it. Trade commands treat a territory or estate parent selection as aggregate.

[Zed opening](../../src/core/territory/targets/zed.ts) reverses the projection and adds the owner last because Zed prepends each opened folder. VS Code receives all roots in one `--new-window` invocation in order; Delta opens roots sequentially in order.

## Steps

- [x] Add `principals` to territory selection: exactly one of `--territory`, `--estate` or `--principals`; filters narrow Capital basenames; every selected Capital is validated as an owner root; the profile keeps the ordering above instead of path order.
- [x] Add the option and conflict wording to `ki territory` subcommands (including `inspect`), `ki repo`, `ki registry`, `ki repo init`, `ki registry list`/`remove` rejection and trade aggregate selection.
- [x] Prove the Zed, VS Code and Delta invocation order through recorded runner calls.
- [x] Update specifications, user guides, README, help text and manual; regenerate inventories where tooling requires it.

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

## Review

### Delivered

`--principals` is accepted wherever `--estate` is: `ki territory show`, `roots`, `audit`, `open` and `inspect`, `ki repo` (every operation, including trade aggregation) and `ki registry add`. `ki repo init` and `ki registry list`/`remove` reject it. It conflicts with `--repo`, `--territory` and `--estate`, and `--filter` narrows it as it narrows `--estate`. Against the live registry it selects the eight Capitals as ki-principal, er-principal, hnr-principal, legal-principal, personal-principal, si-principal, tmx-principal, va-principal.

### Change Summary

- `src/core/territory/resolution.ts` adds the principals resolution and ordering rule and shares root validation through `memberAt`; `src/core/configuration/index.ts` exports the canonical Harness identity it uses.
- `src/core/repository/selection.ts` and the selection types and pass-throughs in `src/core/repository/operations/`, `src/core/work/operations.ts` and `src/commands/repo/` carry the new scope.
- `src/commands/territory/selection.ts` and `inspect.ts`, `src/commands/repo/index.ts`, `src/commands/registry/index.ts` declare the option; `src/commands/repo/init.ts`, `src/commands/registry/list.ts` and `remove.ts` reject it; `src/commands/trade/selection.ts` treats it as aggregate.
- `src/tests/cli/territory/principals.test.ts` proves ordering, tie-breaks, the no-system-Capital fallback, filters, conflicts, inspection, repository, registry and trade selection, and Zed, VS Code and Delta invocation order. Existing message assertions, the manual inventory and completion expectations are updated.
- TERRITORY-002 and the new TERRITORY-005, REPO-AUDIT-009, REGISTRY-004, the territory-selection and repository-operations guides, README, `man/ki.1` and `man/ki.commands.json` document the selector.

### Verification

- `bun run test:coverage`: 66 files, 1,120 tests passed, 100% statements, branches, functions and lines.
- TypeScript, Biome (no new diagnostics), `mandoc -T lint`, command inventory check passed.
- Compiled `dist/ki territory show --principals` and `roots --principals` against the live registry returned the required order; `-f ki- -f hnr-` narrowed it to two.
- `ki repo audit` on the worktree: the roadmap and documentation criteria pass. Remaining failures are pre-existing on `main` (KNIP-2 unused `RollbackPlan`/`ConvergeOptions` types from `ki estate converge`, eight RUNTIMES-2 activation findings, CI-1 and HOOK-1 warnings) or worktree-only (REPO-REG-1).

### Outstanding concerns

- Zed order relies on Zed prepending each `zed -e` folder, as the existing territory opening already does; proven through recorded invocations, not a live Zed session.
- A Capital whose checkout is unavailable cannot be recognised and is silently left out, consistent with existing Capital discovery.
- The accepted territory-selection decision in the KI Principal names two primary scopes; Kris may want it to record the third.

### Post-change review

The selector reuses Capital discovery and root validation rather than adding a parallel path; no handle, alias or membership semantics changed, so KI-TOOL-CLI-118 is unaffected.

### Mini recap

Decision 82 delivered as a third primary scope with a membership-derived order. Not accepted or pruned; no release.

## Discussion

### Approval

Decision 82 authorises delivery, merge to `main` and push after full gates, with the record left Awaiting review for Kris.
