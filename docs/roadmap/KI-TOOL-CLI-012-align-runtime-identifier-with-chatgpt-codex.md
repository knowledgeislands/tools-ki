---
id: KI-TOOL-CLI-012
title: Align the runtime identifier with ChatGPT Codex
theme: cli
horizon: blocking
status: acceptance
blocks: []
blocked-by: []
baseline-ref: f657f40c7fcdd204ec17647a3540290ccdceaadf
transferred-from: KI-HARNESS-RTP-005
---

## Context

`ki` detects the `chatgpt-codex` agent but exposes `codex` as its configuration-runtime identifier.

This forces repository declarations, skill frontmatter, initialisation input, and validation messages to use a name that differs from the detected integration.

Make `chatgpt-codex` the single canonical runtime identifier while retaining `claude-code` unchanged.

## Boundary

Do not retain `codex` as an accepted alias, compatibility fallback, or second configuration vocabulary.

Do not rename product concepts that are not configuration-runtime identifiers, including Codex configuration paths, the `codex` command, or the `ki-tokenomics-codex` capability name.

The harness owns its standards, rubric, skill metadata, and fleet migration; this item owns only the public CLI contract and its tests.

## Current state

`src/agents/chatgpt-codex.ts` already defines the concrete agent identity, but `src/core/harness.ts` still declares `codex` as a supported runtime and `src/agents/runtimes.ts` translates the agent to that legacy value.

Repository initialisation, repository configuration parsing, installed-harness frontmatter validation, CLI help, diagnostics, fixtures, and documentation repeat the old vocabulary.

## Steps

1. [x] Replace the CLI's canonical supported-runtime value and agent-to-runtime mapping with `chatgpt-codex`.
2. [x] Update repository configuration parsing, installed-harness frontmatter validation, and `ki repo init` validation, help, and generated TOML so only `chatgpt-codex` and `claude-code` are accepted.
3. [x] Migrate CLI test fixtures and assertions to the corrected value, adding contract coverage that rejects legacy `codex` with diagnostics naming the accepted replacement.
4. [x] Update the CLI's own `.ki-config.toml`, README, and manual-facing text without renaming unrelated Codex product concepts.
5. [x] Verify repository skill selection, diagnostics, and managed activation still select the detected `chatgpt-codex` agent and leave Claude Code behaviour unchanged.

## Files touched

- `src/core/harness.ts`, `src/core/configuration.ts`, `src/core/repository-operations.ts`, and `src/agents/runtimes.ts`
- Relevant command/agent sources and CLI contract tests under `src/tests/cli/`
- `.ki-config.toml`, `README.md`, and `man/ki.1` where they declare the supported runtime vocabulary
- The reciprocal `ki-agentic-harness` work item after this item has acceptance evidence

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- `ki repo audit --skill ki-roadmap`
- CLI contract coverage proves `--runtime chatgpt-codex` writes and activates the corrected declaration, `--runtime codex` is rejected, and `claude-code` remains supported.

## Dependencies / blocks

No internal prerequisite is known.

This item is the CLI prerequisite for KI-HARNESS-RTP-005's migration of the portable runtime standard and fleet declarations. Repository roadmap dependency identifiers are local-only, so the cross-repository relationship remains explicit in this item, its `transferred-from` provenance, and the originating harness record.

## Acceptance

### Delivered

The executable now treats `chatgpt-codex` as its canonical Codex runtime value in its supported-runtime set, agent mapping, repository configuration, skill frontmatter, and `ki repo init` contract.

Legacy `codex` declarations are rejected with a direct instruction to use `chatgpt-codex`; unrelated Codex product and capability names remain unchanged.

### Summary of changes

Commit `535335c297c5ac2fdc539671cf480af66b437752` updates runtime parsing, agent matching, CLI help, repository initialisation, the local declaration, README guidance, and end-to-end fixtures.

The contract tests now prove both the corrected activation path and the legacy rejection path.

### Verification

- `bunx vitest run src/tests/cli/harness.test.ts src/tests/cli/skill.test.ts src/tests/cli/repository-registry.test.ts src/tests/cli/diag.test.ts src/tests/cli/repair.test.ts src/tests/cli/doctor.test.ts` — 149 passed.
- `bun run test` — 448 passed.
- `bunx tsc --noEmit` — passed.
- `bunx biome check src README.md` — passed.
- `ki repo audit --skill ki-roadmap` — passed with no failures or warnings.

### Outstanding concerns

KI-HARNESS-RTP-005 still owns the corresponding portable standard, rubric, and fleet-declaration migration.

Until that work is complete, repositories selected by the new CLI value may still be assessed by the old harness standard; this is a coordinated migration boundary, not a CLI fallback.

### Mini recap

The CLI now has one unambiguous runtime vocabulary: `claude-code` and `chatgpt-codex`.

The accepted work is ready for explicit review; it deliberately does not close the originating harness item.

## Discussion

### Canonical vocabulary

The detected agent identity and configured runtime should be the same exact string: `chatgpt-codex`.

The CLI must not translate it to `codex`; that translation creates two competing contracts and makes every downstream validator choose one.

### Migration policy

The corrected current contract is intentionally breaking for legacy declarations.

The CLI should reject the old value clearly and name `chatgpt-codex` as the valid replacement, while the harness coordinates updates to every KI-managed declaration rather than preserving a dual runtime path.

### Cross-repository delivery

This item was adopted from [KI-HARNESS-RTP-005](../../../ki-agentic-harness/docs/roadmap/KI-HARNESS-RTP-005-align-the-runtime-identifier-with-chatgpt-codex.md).

It owns the executable release boundary and acceptance evidence; the harness owns the standard and fleet migration that follows.
