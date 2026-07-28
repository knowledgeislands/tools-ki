---
id: 'CLI-006'
title: 'Persist qualified capability identities'
status: ready
roadmap: cli/persist-qualified-capability-identities-in-repository-declarations
blocks: —
blocked-by: —
baseline-ref: —
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

1. Define and implement one repository-declaration grammar: a skill root is a quoted TOML key `"<harness-id>:<skill-name>"`, for example `["knowledgeislands/ki-agentic-harness:ki-repo"]`; nested settings remain beneath that quoted root, for example `["knowledgeislands/ki-agentic-harness:ki-tokenomics".budgets]`. Parse each declaration into its qualified identity, provider, skill name, and unchanged configuration. Reject bare `ki-*` roots, malformed qualified roots, duplicate skill names, and non-table declared roots; retain unrelated non-skill TOML unchanged.
2. Resolve declared skills directly through their recorded harness and skill, with precise unavailable-provider and unavailable-skill diagnostics. Preserve dependency ordering only when every bare dependency name resolves to one declared identity; make qualified `--skill` selection exact and retain a bare selector only where it identifies one declared capability unambiguously.
3. Update repository activation and removal so `ki skill repo add` records the uniquely resolved provider identity, while removal finds and removes the exact declared qualified root (including its nested tables) without changing unrelated TOML. Keep user-scope configuration and activation semantics unchanged.
4. Update `ki list`, `ki missing`, `ki outdated`, `ki repo audit`, `ki repo conform`, `ki upgrade`, and their shared status paths to show and act on the persisted identity. Remove repository-provider ambiguity as a runtime state; report missing recorded providers or capabilities directly instead.
5. Migrate this repository's `.ki-config.toml` and every CLI test fixture to qualified headers, including nested-table fixtures. Extend sandboxed CLI-contract coverage for invalid bare and malformed declarations, direct provider resolution, duplicate declared names, exact and unambiguous selection, activation/removal preservation, status and list output, dependency ordering, upgrade selection, and failures. Keep the project at 100% coverage without unit-testing internal helpers.
6. Update the local user-facing configuration guidance only where the CLI contract is documented. Run the complete quality gate and record no tag, release, push, publication, or Homebrew-tap change.
7. After the implementation is accepted, create explicit outbound rollout handoffs before release: one to `ki-agentic-harness` to update the portable `.ki-config.toml` contract, its catalogue/rubrics, and its own declaration; and one each to `ki-arcadia-principal`, `ki-website`, and `ki-specifications` to migrate their declarations and nested settings. Each handoff must state that it originates from CLI-006, is non-blocking local work, and requires verification against the released CLI. Do not edit those repositories from this plan or release the CLI until the handoffs are durable and the receiving repositories have scheduled their work.

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
