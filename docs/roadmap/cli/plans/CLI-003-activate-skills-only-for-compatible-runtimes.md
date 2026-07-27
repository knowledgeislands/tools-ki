---
id: 'CLI-003'
title: Activate skills only for compatible runtimes
status: done
roadmap: cli/activate-skills-only-for-compatible-runtimes
blocks: —
blocked-by: —
baseline-ref: a8520e3db83260caaf223d3ec0beb2ab3bff50b6
---

## Context

The canonical harness now distinguishes portable skills from vendor adapters with optional `ki-supported-runtimes` skill frontmatter. `tools-ki` owns installed-capability discovery and managed user/repository projections, so it must enforce that compatibility when activating a skill.

This work was received directly from `ki-agentic-harness` RTP-002. It blocks that plan's fleet migration because the final environment capability set includes Claude-only and Codex-only skills.

## Current state

- `HarnessCapability` records a skill's name, source, dependencies, and optional rubric module, but not its supported runtimes.
- `addUserSkill` and `addRepoSkill` resolve one installed skill and link it into every configured agent.
- Repository activation does not combine capability compatibility with `[ki-repo].supported_runtimes`.
- The configured agent identifiers are `claude-code` and `chatgpt-codex`, while repository and skill metadata use the runtime identifiers `claude-code` and `codex`.
- Removal already visits every configured agent and should retain that breadth so it can remove stale managed links after a skill's compatibility narrows.

## Steps

1. ✓ Define one explicit mapping from configured agent identifiers to the canonical runtime identifiers `claude-code` and `codex`.
2. ✓ Parse and validate optional `ki-supported-runtimes` flow-array frontmatter into installed skill capabilities; absence means portable and invalid metadata makes the harness incompatible.
3. ✓ Filter user activation to configured compatible agents and fail clearly when none are compatible.
4. ✓ Filter repository activation to agents that are both configured, declared by `[ki-repo].supported_runtimes`, and compatible with the skill; fail clearly when none qualify.
5. ✓ Preserve broad managed-link removal so stale projections can be cleaned after metadata or repository-runtime changes.
6. ✓ Add CLI-contract coverage for portable, Claude-only, Codex-only, invalid, unsupported, mixed-runtime, and stale-removal cases; update user-visible inventory or diagnostics only where the new metadata materially changes their contract.
7. ✓ Run the complete repository quality gate and report the capability contract back to `ki-agentic-harness` RTP-002.

## Files touched

- `src/core/harness.ts` capability discovery and validation
- `src/agents/` runtime mapping and activation selection
- Repository configuration/resolution surfaces needed to read `supported_runtimes`
- `src/tests/cli/` contract tests and fixtures
- User documentation only where the public activation contract changes

## Verify

1. A portable skill links into every configured agent allowed by repository runtime declarations.
2. A Claude-only skill never links into Codex, and a Codex-only skill never links into Claude Code.
3. Repository activation honours both the repository runtime set and skill compatibility.
4. Invalid runtime metadata and an empty compatible-agent selection fail without partial mutation.
5. Removal can clean an existing KI-managed link from any configured agent regardless of current compatibility.
6. `bun run test`, `bun run test:coverage`, `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` pass.

## Dependencies / blocks

The harness-side `ki-supported-runtimes` contract is defined by `ki-agentic-harness` RTP-002. This plan is otherwise independent of CLI-001 and CLI-002 and takes precedence because it blocks the active cross-repository cutover.

## Delegation

- A bounded implementation worker owned capability parsing, runtime mapping, activation selection, stale removal, and CLI-contract tests.
- The orchestrator reviewed the complete diff, added runtime-aware `ki doctor` validation, and reran every repository gate before commit.

## Acceptance

### Delivered

Installed skills now carry explicit runtime compatibility into user and repository activation, and diagnostics understand the resulting selective links.

### Summary of changes

- Added strict `ki-supported-runtimes` discovery and the explicit `claude-code` / `chatgpt-codex` agent mapping.
- Filtered user and repository activation before mutation while preserving broad stale-link removal.
- Made `ki doctor` validate links only for compatible configured agents.
- Added CLI-contract coverage for portable, restricted, malformed, unsupported, mixed-runtime, stale-removal, and diagnostic cases.

### Verification

- At `645714baab8ed498794726ad1e5d77fda8b24e6e`, `bun run test` passed 318 tests.
- `bun run test:coverage` passed 318 tests at 100% statements, branches, functions, and lines after the diagnostic edge-case test.
- `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, and `git diff --check` passed.

### Outstanding concerns

None.

### Mini recap

Runtime compatibility belongs to installed capability metadata, not naming inference. Activation intersects that metadata with configured agents and repository runtime intent, while removal deliberately remains broader so obsolete managed links stay recoverable.

## Done

Completed runtime-compatible skill activation across user and repository scopes, including runtime-aware diagnostics and recoverable stale-link removal. No residual concerns. No intended follow-up.
