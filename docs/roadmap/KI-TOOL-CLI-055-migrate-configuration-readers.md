---
id: KI-TOOL-CLI-055
title: Migrate configuration readers
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Migrate the `ki` CLI to the `.ki.toml` repository declaration and `.mgit.toml` workspace contract, removing legacy filename assumptions and aligning repository discovery with each owning tool.

## Context

The CLI currently treats `.ki-config.toml` as both a repository marker and an installed Harness metadata filename. Those roles have different lifecycles: a repository declaration is authored in a source checkout, while installed Harness metadata is a verified internal projection under the KI data directory.

mGit integration separately reads direct-CWD `.mgit-config.toml` using an obsolete flat member schema. The current mGit contract uses a versioned `.mgit.toml` document with explicit workspace and repository kinds, named groups, a configured default group, and structural member types.

Harness owns the portable KI repository declaration and mGit owns its workspace and repository schema. `tools-ki` consumes those contracts while owning its CLI migration, diagnostics, discovery, and installed-Harness projection boundaries.

## Boundary

This item owns role-specific CLI constants and types, repository discovery and initialization, one explicit single-root repository migration action, mGit workspace selection, installed-Harness metadata projection, repository-facing diagnostics, tests, specifications, guides, manual, changelog, and the in-scope declaration rename for `tools-ki`.

It does not rename user-level `$XDG_CONFIG_HOME/ki/config.toml`, mutate another repository, perform an estate-wide or Chezmoi migration, invoke mGit, add a group selector, expand mGit symlink metadata, publish a release, or keep permanent repository dual-read or dual-write paths.

## Current state

- Repository discovery, explicit targets, Agora resolution, registry and trade reads, initialization, repository skill mutation, and management diagnostics use `.ki-config.toml` as the repository declaration.
- Installed Harness acquisition and inventory also use root `.ki-config.toml` as verified payload metadata, but that internal role is not a repository declaration.
- Direct-CWD workspace selection reads `.mgit-config.toml`, expects `version = 1` and a flat `members` table, and does not consume the owning mGit schema.
- `MGIT-CLI-004` is implemented and awaiting review in `tools-mgit`; its `.mgit.toml` specification is concrete enough to consume.
- `KI-HARNESS-FND-020` remains a Harness draft, but its stable direction is `.ki.toml` for repository declarations with the existing `[repo]` and one-table-per-skill data model. The user has explicitly authorised parallel local implementation rather than treating upstream publication as a coding prerequisite.

## Steps

- [ ] Separate repository declaration and installed-Harness metadata concepts in constants, types, readers, renderers, errors, and call sites.
- [ ] Make `.ki.toml` the sole canonical repository marker, classify canonical, legacy, conflicting, absent, and unsafe marker states, and add bounded `ki repo migrate [directory]` behaviour.
- [ ] Project canonical source Harness metadata into the internal installed `.ki-config.toml` role while retaining only a bounded intake path for the currently pinned legacy archive and rejecting ambiguous archives.
- [ ] Replace the obsolete mGit reader with strict schema-one `.mgit.toml` workspace and repository validation, configured-group selection, child-workspace recursion, actionable legacy diagnostics, and no mGit subprocess.
- [ ] Migrate repository fixtures by their semantic role, rename this repository's declaration to `.ki.toml`, and update CLI help, specifications, guides, README wording, manual, changelog, and completion evidence.
- [ ] Run focused contract tests during implementation, then complete repository governance, TypeScript, 100% coverage, formatting, manual, help, completion, and bounded legacy-name verification.

## Files touched

- `.ki-config.toml` → `.ki.toml`
- `src/core/configuration/`, `src/core/repository/`, `src/core/harness/`, `src/core/storage/`, `src/core/agora/`, and `src/core/trade/`
- `src/agents/`, `src/commands/repo/`, `src/commands/manage/`, and CLI catalogue or completion sources
- `src/tests/cli/`, including repository target, migration, Harness acquisition, registry, trade, Agora, and fixture helpers
- `README.md`, `CHANGELOG.md`, `man/ki.1`, affected `docs/specs/`, and affected `docs/guides/`

The final implementation diff may narrow this list where a named consumer already receives a resolved declaration path rather than owning filename semantics.

## Verify

- Focused CLI tests for repository discovery and migration, mGit targets, initialization, Harness acquisition and development, registry, trade, Agora, help, and completion.
- `ki repo audit --repo .`
- `ki repo audit --skill ki-self --repo .`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx biome check`
- `bun run ki:tools:lint-man`
- Confirm repository commands run against `.ki.toml`, generated help and completion include `repo migrate`, and bounded searches leave legacy names only in installed metadata, migration diagnostics and fixtures, or historical evidence.

## Dependencies / blocks

No local work-item dependency blocks delivery. `MGIT-CLI-004` and `KI-HARNESS-FND-020` are directional source contracts rather scheduling prerequisites. Any upstream contradiction discovered before release must be reconciled explicitly, but absent publication does not block local implementation or review.

## Documentation impact

### Decision Records

Update current local Decision Records that identify `.ki-config.toml` as the repository marker. Do not create a competing naming decision; the Harness owns the portable repository declaration contract.

### Specifications

Update repository operation, selection, migration, installed-Harness metadata, and management diagnostics requirements to distinguish the canonical declaration, legacy migration states, internal metadata, and mGit workspace selection.

### Guides

Update repository-local governance and local development guidance for `.ki.toml`, `ki repo migrate`, and the installed-Harness metadata distinction.

### Roadmap

Retain this record through implementation review and acceptance. Estate rollout remains separately authorised work after the CLI and owning contracts are ready.

## Discussion

### Repository declaration

`.ki.toml` is the only canonical KI repository declaration and marker. Its `[repo]` plus one-table-per-skill schema is unchanged. Ordinary repository commands do not dual-read or choose precedence between marker names.

At every candidate root, canonical-only proceeds; legacy-only fails with `ki repo migrate` guidance; canonical plus legacy fails as a conflict; missing, symbolic, directory, malformed, or unsafe declarations fail explicitly. Upward discovery must not skip a legacy or conflicting child in favour of a canonical parent.

### Explicit migration

`ki repo migrate [directory]` operates on one physical Git root and rejects shared `--repo`, `--agora`, and `--estate` selectors. It preserves a valid legacy declaration's bytes and mode under the canonical name without overwrite, then removes the legacy name. Canonical-only is idempotent success; both, neither, malformed, unsafe, symbolic, non-root, or non-Git targets fail without destructive precedence.

### Installed Harness metadata

`.ki-config.toml` remains the internal installed-Harness metadata filename under `$XDG_DATA_HOME/ki/harnesses/<owner>/<name>/`, with role-specific naming in code. Local Harness source checkouts are repositories and therefore expose `.ki.toml`. Verified archive acquisition projects canonical source metadata into the installed filename, retains bounded intake for the currently pinned legacy immutable archive, and rejects archives carrying both names. The bounded legacy intake is removed when the built-in pin advances to a canonical archive.

### mGit selection

`.mgit.toml` is the sole mGit reader input. The CLI validates `schema = 1`, `kind = "workspace" | "repository"`, the configured default group, and `groups.<name>.members.<path>`. A workspace selects its configured group, structural member metadata supplies each member type, and child workspaces recurse through their own default group. Standard members select the child, nested members select `main/`, and bare members are skipped.

Repository-kind documents validate and then fall through to ordinary single-repository discovery. Empty explicit workspaces, unsafe paths, duplicate or cyclic selection, malformed or mixed documents, legacy `.mgit-config.toml` or `.mgit-workspace.toml`, and canonical-plus-legacy combinations fail with actionable diagnostics. Migration guidance points to `mgit register`; `ki` neither invokes mGit nor adds `--group`.

### Parallel contract assumption

This implementation proceeds from the stable target direction already evidenced in the owning repositories. It does not claim either external roadmap item is accepted. Reconciliation before release is a verification activity, not a prerequisite for local coding.
