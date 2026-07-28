---
id: 'CLI-006'
title: 'Persist qualified capability identities'
status: in-progress
roadmap: cli/persist-qualified-capability-identities-in-repository-declarations
blocks: —
blocked-by: —
baseline-ref: 920415fa612065c4a86e4edea985913e0323e4e6
---

## Context

Repository declarations presently use bare `[ki-*]` TOML tables, even though the compatible-harness contract already identifies a skill as `<harness-id>:<skill-name>`. `ki` resolves that bare name against its installed harnesses at runtime, which makes the repository's intended provider implicit and can produce ambiguity. The V1 baseline should record the exact provider in the repository declaration.

## Current state

- `readDeclaredSkills` treats each top-level `[ki-*]` table as a declared skill and returns only its bare name and configuration.
- `resolveDeclaredSkills` finds one installed provider for each bare declaration; `ki repo`, `ki upgrade`, capability status, and list output share that late resolution path.
- `ki skill repo add` resolves a bare CLI argument, but writes another bare table; removal removes that bare root only.
- `.ki-config.toml` files and CLI fixtures include bare declarations. Some repositories use nested tables such as `[ki-tokenomics.budgets]`.
- The `ki-repo` configuration standard and its audit catalogue still define a table name as a bare skill name, so the CLI migration requires a coordinated post-change rollout rather than an isolated release.

## Steps

1. ✓ Defined and implemented one repository-declaration grammar: a skill root is a quoted TOML key `"<harness-id>:<skill-name>"`, for example `["knowledgeislands/ki-agentic-harness:ki-repo"]`; nested settings remain beneath that quoted root, for example `["knowledgeislands/ki-agentic-harness:ki-tokenomics".budgets]`. Parsing retains the qualified identity, provider, skill name, and unchanged configuration, while rejecting bare, malformed, duplicate, and non-table declarations without changing unrelated TOML.
2. ✓ Resolved declared skills directly through their recorded harness and skill, with diagnostics for an unavailable provider or a missing supplied capability. Dependency ordering remains named within the declaration set, and `--skill` accepts either the exact identity or its unambiguous capability name.
3. ✓ Updated repository activation and removal so `ki skill repo add` writes the resolved provider identity and removal deletes the exact qualified root, including nested tables, without disturbing unrelated TOML. User-scope configuration and activation semantics remain unchanged.
4. ✓ Updated `ki list`, `ki missing`, `ki outdated`, `ki repo audit`, `ki repo conform`, `ki upgrade`, and shared status paths to show and act on persisted identities. Repository-provider ambiguity is no longer a runtime state; missing recorded identities are reported directly.
5. ✓ Migrated this repository's `.ki-config.toml` and every CLI fixture to qualified headers, including nested-table fixtures. Sandboxed CLI contracts cover invalid bare and malformed declarations, direct provider resolution, duplicate names, exact selection, nested activation/removal preservation, status/list output, dependency ordering, upgrade selection, and failures; 100% coverage remains enforced.
6. ✓ Confirmed no local user-facing configuration guide declares repository table-header grammar; ran the complete quality gate with no tag, release, publication, or Homebrew-tap change.
7. ✓ Created, committed, and delivered explicit rollout handoffs to `ki-agentic-harness`, `ki-arcadia-principal`, `ki-website`, and `ki-specifications`; each names CLI-006, its non-blocking local scope, and verification against the released CLI. The receivers own scheduling and execution; after delivery, the outbound copies were pruned from this repository. Do not release the CLI until the receiving repositories have scheduled their work.

## Files touched

- `src/core/configuration.ts`, `src/core/resolution.ts`, and capability-status paths
- `src/agents/skills.ts` and CLI command surfaces that list, select, audit, conform, update, or upgrade repository declarations
- `.ki-config.toml`, relevant CLI contract tests and fixture configuration strings, and user-facing CLI documentation where required
- `-/_HANDOFFS/` only after accepted implementation, for the coordinated rollout briefs

## Verify

1. CLI-contract tests demonstrate that quoted qualified roots and nested qualified sub-tables preserve the exact skill configuration, while bare or malformed declarations fail before any operation runs.
2. Tests prove a declared provider is used directly, missing providers and missing skills have actionable diagnostics, duplicate declared skill names and ambiguous bare selectors fail, and exact identity selection includes declared dependencies in order.
3. Tests prove repository add writes and repository remove deletes the exact qualified declaration without disturbing nested settings or unrelated TOML; user-scope behavior remains unchanged.
4. Tests cover `list`, capability status, audit, conform, and upgrade output/selection using persisted identities, with no repository ambiguity state remaining.
5. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, applicable Markdown checks, `./bin/ki repo audit --repo .`, and `git diff --check` pass.
6. Before release, the four named outbound handoffs are committed and the implementation has no tag, release, push, publication, or Homebrew-tap modification.

## Dependencies / blocks

CLI-006 has no plan dependency. It implements the repository-side identity already defined by ADR-KI-TOOLS-002. The post-acceptance rollout is deliberately cross-repository but non-blocking for each receiving repository; it is a release-coordination gate for this CLI change, not permission to change another repository's priority or implementation.
