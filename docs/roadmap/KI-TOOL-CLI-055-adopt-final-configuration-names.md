---
id: KI-TOOL-CLI-055
title: Adopt final configuration names
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: f86dec42ead8ca1e9d0dcd253c701b064807a449
---

## Goal

Make `.ki.toml` the sole Knowledge Islands declaration filename consumed and produced by `ki`, and replace the obsolete mGit workspace reader with the final `.mgit.toml` schema-one contract.

## Context

The CLI previously coupled the retired KI filename to repository discovery, Harness installation, fixture setup, diagnostics, and documentation. Its mGit integration also read an obsolete flat workspace filename and member shape. The final contracts use `.ki.toml` for KI repositories and Harnesses, and `.mgit.toml` for mGit workspaces and repository manifests.

The user explicitly rejected migration support. This item therefore implements the final names directly: no legacy constants, compatibility reads, dual writes, precedence rules, migration command, or pinned-release exception.

## Boundary

This item owns CLI constants, readers, renderers, repository discovery and initialisation, Harness archive and installed declaration handling, mGit workspace selection, diagnostics, fixtures, tests, specifications, guides, manual, changelog, and this repository's declaration rename.

It does not mutate another repository, migrate a user or estate, invoke mGit, add a group selector, publish a release, or retain support for retired filenames. User-level `$XDG_CONFIG_HOME/ki/config.toml` is a separate configuration contract and remains unchanged.

## Current state

- Repository and Harness declarations are being collapsed onto `.ki.toml` throughout product code and tests.
- Old-name compatibility and the provisional migration implementation are being removed.
- The final mGit schema-one reader is implemented locally and still needs its complete CLI-contract fixture coverage.
- External contract publication can proceed independently and does not block this local implementation.

## Steps

- [x] Use one `.ki.toml` declaration constant across repository and Harness source, archive, installed, diagnostic, and mutation boundaries.
- [x] Remove every retired-name read, write, migration action, compatibility exception, and diagnostic.
- [x] Replace the obsolete mGit reader with strict schema-one `.mgit.toml` workspace and repository validation, configured-group selection, and child-workspace recursion.
- [x] Migrate fixtures by their semantic write target and rename this repository's declaration to `.ki.toml`.
- [x] Update CLI help, specifications, guides, README, manual, and changelog to the final contract.
- [x] Run focused contract tests, then repository governance, TypeScript, 100% coverage, formatting, manual, help, completion, and bounded retired-name searches.

## Files touched

- `.ki.toml`
- `src/core/configuration/`, `src/core/repository/`, `src/core/harness/`, `src/core/storage/`, `src/core/agora/`, `src/core/trade/`
- `src/agents/`, `src/commands/repo/`, `src/commands/manage/`, CLI catalogue and completion sources
- `src/tests/cli/`, including repository target, Harness acquisition, registry, trade, Agora, mGit, and fixture helpers
- `README.md`, `CHANGELOG.md`, `man/ki.1`, affected `docs/specs/`, and affected `docs/guides/`

## Verify

- `ki repo audit --repo . --progress never`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx biome check`
- `bun run build`
- `bun run ki:tools:lint-man`
- generated root and repository help and completion checks
- bounded search confirms retired KI and mGit filenames and migration command are absent from current product, test, and documentation surfaces

## Dependencies / blocks

No implementation blocker. External owners may publish their matching declarations in parallel; this repository targets the agreed final contract without temporary compatibility.

## Documentation impact

### Decision Records

Update current local Decision Records only where they name the retired repository marker. Do not create a competing naming decision; the portable contract is externally owned.

### Specifications

Update repository selection, initialisation, Harness acquisition and integrity, management diagnostics, and mGit workspace-selection requirements to name only the final files.

### Guides

Update repository governance and local Harness development guidance to use `.ki.toml` exclusively.

### Roadmap

Retain this record through implementation review and acceptance. Any external repository rename remains separately authorised work.

## Review

### Delivered

The CLI now consumes and produces `.ki.toml` as the sole repository and Harness declaration filename, and `.mgit.toml` as the sole mGit manifest filename. There is no retired-name reader, migration command, compatibility fallback, dual write, archive projection, or release exception.

### Summary of changes

Repository discovery, explicit targeting, initialisation, diagnostics, Harness acquisition and installation, registry metadata, Agora, trades, work operations, fixtures, specifications, guides, README, manual, changelog, and this repository declaration now use the final names. The mGit reader validates schema-one workspaces and repositories, group selection, member types, and nested workspaces without invoking mGit.

### Verification

Against baseline `f86dec42ead8ca1e9d0dcd253c701b064807a449`, `bun run test:coverage` passed 688 tests with 100% statements, branches, functions, and lines. `bunx tsc --noEmit`, `bunx biome check`, `bun run build`, and `bun run ki:tools:lint-man` passed. Bounded estate search found zero files or references using the retired KI declaration name; all 32 current `.ki.toml` declarations parsed successfully. Affected catalogue, MCP, and website contract checks also passed.

### Outstanding concerns

The built-in canonical Harness release pin still identifies an immutable archive published before its source adopted `.ki.toml`. The CLI deliberately rejects that archive rather than carrying compatibility; the pin can advance after a final-name archive is published. Direct local governance audit also remains unavailable until installed user Harness state uses the final filename; this implementation does not mutate user state.

### Post-change review

The cutover has one name at every product boundary and no hidden migration surface. Contract tests cover absent, duplicate, malformed, unsafe, nested, and non-workspace declarations. User-level `$XDG_CONFIG_HOME/ki/config.toml` remains intentionally separate.

### Mini recap

CLI-055 is ready for human review: final names only, complete estate source cutover, no compatibility, full product coverage clean, and one explicit publication concern.

## Done

Accepted by user on 2026-08-29. The reviewed delivery is recorded in `4aa46ae`; its six-part review packet is complete, and the explicit archive-pin, governance-audit, and remote-synchronisation follow-ons remain visible. The acceptance action did not push the repository.

## Discussion

### Final naming

`.ki.toml` is the only KI declaration filename. Repository discovery, explicit repository targets, repository initialisation, local Harness inspection, release archives, installed Harness inspection, registry transactions, diagnostics, tests, and documentation all use that same name. A checkout containing only a retired filename is simply not a KI repository or valid Harness; `ki` offers no migration path.

### mGit selection

The built-in selector reads direct-working-directory `.mgit.toml` with `schema = 1`, `kind = "workspace" | "repository"`, a configured default group, and `groups.<name>.members.<path>`. Workspace selection uses its configured group while structural member metadata supplies member type; child workspaces recurse through their own default group. Standard members select the child, nested members select `main/`, and bare members are skipped. Repository-kind documents validate and fall through to ordinary single-repository discovery. `ki` neither recognizes retired mGit filenames nor invokes mGit.

### Parallel contract assumption

Implementation proceeds against the agreed final naming without waiting for external repository changes. Release integration must point at artifacts that already satisfy the final contract; it must not restore compatibility code.
