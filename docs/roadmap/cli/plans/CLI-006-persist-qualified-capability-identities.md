---
id: 'CLI-006'
title: 'Persist qualified capability identities'
status: acceptance
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
8. ✓ Rendered each audit and conform report header as `[<repository-basename>][<qualified-skill-identity>] <operation>`, retaining the concise repository identity without an absolute local path; CLI contracts cover both operations.
9. ✓ Resolved the local repository-audit baseline: declared public visibility, added the MIT license, aligned Biome and Knip managed-discovery exclusions, and applied the confirmed live GitHub settings.

## Files touched

- `src/core/configuration.ts`, `src/core/resolution.ts`, and capability-status paths
- `src/agents/skills.ts` and CLI command surfaces that list, select, audit, conform, update, or upgrade repository declarations
- `src/commands/repo.ts` and its CLI audit/conform rendering contracts
- `.ki-config.toml`, relevant CLI contract tests and fixture configuration strings, and user-facing CLI documentation where required
- `LICENSE`, `biome.json`, and `knip.json` for the local repository-audit baseline
- `-/_HANDOFFS/` only after accepted implementation, for the coordinated rollout briefs

## Verify

1. CLI-contract tests demonstrate that quoted qualified roots and nested qualified sub-tables preserve the exact skill configuration, while bare or malformed declarations fail before any operation runs.
2. Tests prove a declared provider is used directly, missing providers and missing skills have actionable diagnostics, duplicate declared skill names and ambiguous bare selectors fail, and exact identity selection includes declared dependencies in order.
3. Tests prove repository add writes and repository remove deletes the exact qualified declaration without disturbing nested settings or unrelated TOML; user-scope behavior remains unchanged.
4. Tests cover `list`, capability status, audit, conform, and upgrade output/selection using persisted identities, with no repository ambiguity state remaining.
5. Tests assert audit and conform headers use the repository basename plus the qualified skill identity, with no absolute repository path.
6. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, applicable Markdown checks, `./bin/ki repo audit --repo .`, and `git diff --check` pass.
7. Before release, the four named outbound handoffs are committed and the implementation has no tag, release, push, publication, or Homebrew-tap modification.

## Dependencies / blocks

CLI-006 has no plan dependency. It implements the repository-side identity already defined by ADR-KI-TOOLS-002. The post-acceptance rollout is deliberately cross-repository but non-blocking for each receiving repository; it is a release-coordination gate for this CLI change, not permission to change another repository's priority or implementation.

## Acceptance

### Delivered

CLI-006 persists qualified harness capability identities in repository configuration and removes repository-time provider ambiguity.

### Summary of changes

- Repository declarations now use quoted qualified roots such as `["knowledgeislands/ki-agentic-harness:ki-repo"]`, including qualified nested tables.
- Resolution, activation, removal, selection, status, audit, conform, upgrade, and list paths preserve and display the recorded provider identity.
- CLI contract coverage migrates every fixture to the qualified grammar and covers invalid, missing, duplicate, nested, selector, dependency, and lifecycle cases.
- Audit and conform headers now use `[<repository-basename>][<qualified-skill-identity>] <operation>`.
- The local repository baseline now includes public visibility, MIT licensing, managed Biome/Knip exclusions, and the confirmed GitHub repository settings.
- The four rollout handoffs were delivered to their receiving repositories and removed locally; the receivers retain their independent scheduling and execution ownership.

### Verification

- All nine implementation steps are complete.
- `bun run test` — 375 CLI contract tests passed.
- `bun run test:coverage` — 100% statements, branches, functions, and lines.
- `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bunx prettier --check '**/*.md'`, and `bunx markdownlint-cli2 '**/*.md'` passed. Knip emits only two non-failing redundant-ignore configuration hints for the managed skill-link directories.
- `./bin/ki repo audit --repo .` — no FAIL or WARN findings across all declared skills.
- `git diff --check` and the working tree were clean at `b8d9ec963b498dc92db32f936c4e5d0a50e357d7` before this acceptance-record transition.
- Live GitHub settings confirm public visibility, squash-only merging, branch deletion, disabled wiki and projects, and enabled Dependabot security updates, secret scanning, and push protection.

### Outstanding concerns

- The CLI must not be released until the four receiving repositories have scheduled their rollout work and the coordinated release is approved.
- This local acceptance record has not been pushed or released.

### Mini recap

The implementation showed that a persisted identity is only useful when every reader, writer, selector, and report carries it intact. The quoted TOML-root form keeps the qualified identity unambiguous while preserving ordinary nested configuration.
